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
  kind: 'status' | 'task'
  id: string
  to: string[]
  vars: { name?: string; title?: string; text?: string; status?: Status }
}

type Message = {
  to: string
  title: string
  body: string
  data: { event: Event; kind: Job['kind']; id: string }
  channelId: string
  priority: 'high'
  sound: 'default'
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const fill = (s: string, vars: Record<string, string | undefined>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)

const message = ({ event, kind, id, vars }: Job, token: string, lang: Lang): Message => {
  const { events, status } = PUSH.text[lang] ?? PUSH.text.en
  const { title, body } = events[event] as { title: string; body?: string }
  const v = { ...vars, status: vars.status && status[vars.status] }
  return {
    to: token,
    title: fill(title, v),
    // description_text turns tags into spaces, so an update's text arrives padded.
    body: (body ? fill(body, v) : (vars.text ?? '')).replace(/\s+/g, ' ').trim(),
    data: { event, kind, id },
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
    .select('token, lang')
    .in('user_id', job.to)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const all = phones.map(({ token, lang }) => message(job, token, lang as Lang))
  const gone: string[] = []
  // Expo takes up to 100 messages a request; tickets come back in the same order.
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100)
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch)
    })
    const { data } = (await res.json()) as { data?: { details?: { error?: string } }[] }
    data?.forEach((t, j) => t.details?.error === 'DeviceNotRegistered' && gone.push(batch[j]!.to))
  }
  // An uninstalled app's token never works again.
  if (gone.length) await db.from('push_tokens').delete().in('token', gone)
  return Response.json({ sent: all.length, removed: gone.length })
})
