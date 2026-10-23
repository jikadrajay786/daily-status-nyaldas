import { useEffect, useState, type FormEvent } from 'react'
import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { errMsg } from '@daily-status/core/useQuery'
import { Button, Field, Input, Notice } from './ui'

// Supabase refuses a resend within 60s of the last email, so the button waits the same amount.
const COOLDOWN = 60

type Phase =
  { state: 'idle' } | { state: 'busy' } | { state: 'sent' } | { state: 'error'; message: Key }

type Props = { email: string; password: string; justSent: boolean; onBack: () => void }

// Codes beat links on desktop: the email's link would open a browser tab instead of returning to the app.
export const VerifyEmail = ({ email, password, justSent, onBack }: Props): React.JSX.Element => {
  const { t } = useT()
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(justSent ? COOLDOWN : 0)
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })

  useEffect(() => {
    if (!wait) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  // The address may already be verified (a code entered in another window, or this one consumed but the app
  // closed). Supabase then "sends" new codes without sending anything, to hide which emails exist, so check
  // first: if the password signs in, the auth listener swaps in the app and no code is needed.
  const alreadyVerified = async (): Promise<boolean> =>
    !(await db().auth.signInWithPassword({ email, password })).error

  const verify = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setPhase({ state: 'busy' })
    // On success the auth listener receives the new session and swaps in the app.
    const { error } = await db().auth.verifyOtp({ email, token: code, type: 'email' })
    if (error && !(await alreadyVerified())) setPhase({ state: 'error', message: errMsg(error) })
  }

  const resend = async (): Promise<void> => {
    setPhase({ state: 'busy' })
    if (await alreadyVerified()) return
    const { error } = await db().auth.resend({ type: 'signup', email })
    if (error) return setPhase({ state: 'error', message: errMsg(error) })
    setWait(COOLDOWN)
    setPhase({ state: 'sent' })
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t('verifyTitle')}</h2>
        <p className="mt-1 text-sm text-fg-2">
          {t(justSent ? 'verifySent' : 'verifyNeeded', { email })}
        </p>
      </div>
      <Field label={t('code')}>
        <Input
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          placeholder="123456"
          value={code}
          // Pasted codes often carry spaces ("123 456"), so keep digits only rather than capping raw length.
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </Field>
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      {phase.state === 'sent' && <Notice tone="ok">{t('codeSent')}</Notice>}
      <Button type="submit" disabled={phase.state === 'busy'}>
        {phase.state === 'busy' ? t('pleaseWait') : t('verify')}
      </Button>
      <Button variant="ghost" disabled={wait > 0 || phase.state === 'busy'} onClick={resend}>
        {wait > 0 ? t('resendIn', { s: wait }) : t('resend')}
      </Button>
      <p className="text-center text-xs text-fg-3">{t('checkSpam')}</p>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-sm font-medium text-accent-fg hover:text-accent"
      >
        {t('otherEmail')}
      </button>
    </form>
  )
}
