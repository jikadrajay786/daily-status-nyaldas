import { useEffect, useRef, useState } from 'react'
import type { Key } from './i18n'
import { db } from './supabase'
import { errMsg } from './useQuery'

// Matches the project's email OTP length (auth.email.otp_length) and Supabase's 60s gap between emails.
export const CODE_LENGTH = 6
export const COOLDOWN_S = 60

// Zero code points of digits staff may type on Indian or Arabic keyboards, plus full-width ones from some IMEs.
const ZEROS = [0x966, 0xae6, 0x660, 0x6f0, 0xff10]
const toAscii = (s: string): string =>
  s.replace(/[०-९૦-૯٠-٩۰-۹０-９]/g, (d) => {
    const c = d.charCodeAt(0)
    return String(c - (ZEROS.find((z) => c >= z && c <= z + 9) ?? c))
  })

// Typed or pasted text to at most 6 ASCII digits. From pasted text ("23 Oct 2026: your code is 482 913") it takes the
// first group that is exactly six digits, written plain or split by a space or dash, not the first six digits it sees.
export const normalizeCode = (raw: string): string => {
  const s = toAscii(raw)
  const six = (groups: RegExpMatchArray | null): string | undefined =>
    groups?.map((g) => g.replace(/\D/g, '')).find((g) => g.length === CODE_LENGTH)
  return (six(s.match(/\d+/g)) ?? six(s.match(/\d+(?:[ -]\d+)*/g)) ?? s.replace(/\D/g, '')).slice(
    0,
    CODE_LENGTH
  )
}

// From a timestamp rather than a ticking counter: phones pause timers in the background, a clock doesn't.
export const secondsLeft = (sentAt: number, now: number): number =>
  Math.max(0, Math.ceil((sentAt + COOLDOWN_S * 1000 - now) / 1000))

export type VerifyPhase =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'resending' }
  | { state: 'sent' }
  | { state: 'error'; message: Key }

export type VerifyCode = {
  code: string
  setCode: (raw: string) => void
  submit: () => void
  resend: () => void
  phase: VerifyPhase
  busy: boolean
  wait: number
  // Bumps on every rejected code, so screens can shake, buzz and refocus.
  rejected: number
}

type Args = { email: string; password: string; justSent: boolean }

export const useVerifyCode = ({ email, password, justSent }: Args): VerifyCode => {
  const [code, setRaw] = useState('')
  const [phase, setPhase] = useState<VerifyPhase>({ state: 'idle' })
  const [sentAt, setSentAt] = useState(() => (justSent ? Date.now() : 0))
  const [now, setNow] = useState(() => Date.now())
  const [rejected, setRejected] = useState(0)
  // A ref, not state: two quick submits (auto-submit plus a tap on Verify) must not both reach the server.
  const inFlight = useRef(false)
  const wait = secondsLeft(sentAt, now)

  useEffect(() => {
    if (!wait) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [wait])

  // The address may already be verified (a code used on another device, or this one consumed before the app
  // closed). Supabase then "sends" new codes without sending anything, to hide which emails exist, so check
  // first: if the password signs in, the auth listener swaps in the app and no code is needed.
  const alreadyVerified = async (): Promise<boolean> =>
    !(await db().auth.signInWithPassword({ email, password })).error

  const fail = (message: Key): void => {
    inFlight.current = false
    setPhase({ state: 'error', message })
  }

  const check = async (token: string): Promise<void> => {
    if (inFlight.current) return
    if (token.length !== CODE_LENGTH) return setPhase({ state: 'error', message: 'vCode' })
    inFlight.current = true
    setPhase({ state: 'checking' })
    // On success the auth listener receives the session and replaces this screen; stay busy until it does.
    const { error } = await db().auth.verifyOtp({ email, token, type: 'email' })
    if (!error || (await alreadyVerified())) return
    setRaw('')
    setRejected((n) => n + 1)
    fail(errMsg(error))
  }

  const setCode = (raw: string): void => {
    if (inFlight.current) return
    const next = normalizeCode(raw)
    setRaw(next)
    if (phase.state === 'error') setPhase({ state: 'idle' })
    if (next.length === CODE_LENGTH && next !== code) void check(next)
  }

  const resend = async (): Promise<void> => {
    if (inFlight.current || wait) return
    inFlight.current = true
    setPhase({ state: 'resending' })
    if (await alreadyVerified()) return
    const { error } = await db().auth.resend({ type: 'signup', email })
    if (error) {
      // Supabase's own limit was hit (e.g. a resend from another device): wait it out like a normal send.
      if (errMsg(error) === 'errRate') setSentAt(Date.now())
      return fail(errMsg(error))
    }
    inFlight.current = false
    setRaw('')
    setSentAt(Date.now())
    setNow(Date.now())
    setPhase({ state: 'sent' })
  }

  return {
    code,
    setCode,
    submit: () => void check(code),
    resend: () => void resend(),
    phase,
    busy: phase.state === 'checking' || phase.state === 'resending',
    wait,
    rejected
  }
}
