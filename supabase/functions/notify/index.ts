// Sends one event's pushes. Called only by public.push_event() (via pg_net), which has already picked who gets it;
// this turns that into each phone's language and hands it to Expo. Deployed with --no-verify-jwt: the shared secret
// in the x-notify-secret header is the gate.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { PUSH } from './messages.gen.ts'

type Event = keyof typeof PUSH.channels
type Lang = keyof typeof PUSH.text
type Status = keyof (typeof PUSH.text)[Lang]['status']
type Job = {
  event: Event
  kind: 'status' | 'task' | 'leave' | 'person'
  id: string
  to: string[]
  vars: { name?: string; title?: string; text?: string; status?: Status }
}

type Data = { event: Event; kind: Job['kind']; id: string }
type Message =
  | {
      to: string
      title: string
      body: string
      data: Data
      channelId: string
      priority: 'high'
      sound: 'default'
    }
  // Data only: Android would draw a regular push itself while the app is in the background, without the Reply box.
  | {
      to: string
      data: Data & { show: { title: string; body: string } }
      priority: 'high'
      _contentAvailable: true
    }

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN')
const fill = (s: string, vars: Record<string, string | undefined>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)

const message = (
  { event, kind, id, vars }: Job,
  token: string,
  lang: Lang,
  replies: boolean
): Message => {
  const { events, status } = PUSH.text[lang] ?? PUSH.text.en
  const t = events[event] as { title: string; body?: string }
  const v = { ...vars, status: vars.status && status[vars.status] }
  const title = fill(t.title, v)
  // description_text turns tags into spaces, so an update's text arrives padded.
  const body = (t.body ? fill(t.body, v) : (vars.text ?? '')).replace(/\s+/g, ' ').trim()
  const data = { event, kind, id }
  return event === 'comment' && replies
    ? {
        to: token,
        data: { ...data, show: { title, body } },
        priority: 'high',
        _contentAvailable: true
      }
    : {
        to: token,
        title,
        body,
        data,
        channelId: PUSH.channels[event],
        priority: 'high',
        sound: 'default'
      }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET'))
    return new Response('forbidden', { status: 403 })
  const job = (await req.json()) as Job
  if (!(job.event in PUSH.channels) || !job.to?.length) return Response.json({ sent: 0 })

  const { data: phones, error } = await db
    .from('push_tokens')
    .select('token, lang, replies')
    .in('user_id', job.to)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const all = phones.map(({ token, lang, replies }) => message(job, token, lang as Lang, replies))
  const gone: string[] = []
  // Expo takes up to 100 messages a request; tickets come back in the same order.
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100)
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Needed once "Enhanced Security for Push" is on in Expo; set the secret before turning that on.
        ...(expoToken && { Authorization: `Bearer ${expoToken}` })
      },
      body: JSON.stringify(batch)
    })
    const { data } = (await res.json()) as { data?: { details?: { error?: string } }[] }
    data?.forEach((t, j) => t.details?.error === 'DeviceNotRegistered' && gone.push(batch[j]!.to))
  }
  // An uninstalled app's token never works again.
  if (gone.length) await db.from('push_tokens').delete().in('token', gone)
  return Response.json({ sent: all.length, removed: gone.length })
})
