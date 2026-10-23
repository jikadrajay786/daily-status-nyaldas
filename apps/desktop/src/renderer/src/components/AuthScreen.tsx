import { useState, type FormEvent } from 'react'
import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { errMsg } from '@daily-status/core/useQuery'
import { Button, Field, Input, Notice } from './ui'
import { VerifyEmail } from './VerifyEmail'

type Mode = 'sign-in' | 'sign-up'
type Phase =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'error'; message: Key }
  | { state: 'verify'; email: string; password: string; justSent: boolean }

export const AuthScreen = (): React.JSX.Element => {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const val = (k: string): string => String(form.get(k) ?? '')
    // Passwords are taken verbatim; leading/trailing spaces are legitimate characters.
    const [email, fullName, password] = [
      val('email').trim(),
      val('full_name').trim(),
      val('password')
    ]
    if (!email || !password) return
    setPhase({ state: 'busy' })
    try {
      if (mode === 'sign-in') {
        const { error } = await db().auth.signInWithPassword({ email, password })
        // Someone who closed the app mid-sign-up gets back to the code screen this way.
        if (error?.code === 'email_not_confirmed')
          return setPhase({ state: 'verify', email, password, justSent: false })
        if (error) throw error
        return
      }
      const { data, error } = await db().auth.signUp({
        email,
        password,
        // daily_status picks this app's branch of the project-wide confirmation email template.
        options: { data: { full_name: fullName, daily_status: true } }
      })
      if (error) throw error
      // To avoid revealing which emails exist, Supabase "succeeds" for a verified address but returns no identities.
      if (data.user?.identities?.length === 0)
        return setPhase({ state: 'error', message: 'errExists' })
      // With confirmation on there is no session yet; with auto-confirm the auth listener has already signed in.
      if (!data.session) setPhase({ state: 'verify', email, password, justSent: true })
    } catch (err) {
      setPhase({ state: 'error', message: errMsg(err) })
    }
  }

  const switchTo = (m: Mode): void => {
    setMode(m)
    setPhase({ state: 'idle' })
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-accent text-lg font-bold text-on-accent">
            DS
          </div>
          <h1 className="text-xl font-semibold">Daily Status</h1>
          <p className="mt-1 text-sm text-fg-2">
            {t(mode === 'sign-in' ? 'signInTagline' : 'signUpTagline')}
          </p>
        </div>

        {phase.state === 'verify' ? (
          <VerifyEmail
            email={phase.email}
            password={phase.password}
            justSent={phase.justSent}
            onBack={() => setPhase({ state: 'idle' })}
          />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'sign-up' && (
              <Field label={t('fullName')}>
                <Input
                  name="full_name"
                  required
                  autoComplete="name"
                  placeholder={t('namePlaceholder')}
                />
              </Field>
            )}
            <Field label={t('email')}>
              <Input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </Field>
            <Field label={t('password')} {...(mode === 'sign-up' && { hint: t('passwordHint') })}>
              <Input
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              />
            </Field>
            {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
            <Button type="submit" disabled={phase.state === 'busy'}>
              {phase.state === 'busy'
                ? t('pleaseWait')
                : t(mode === 'sign-in' ? 'signIn' : 'createAccount')}
            </Button>
            <p className="text-center text-sm text-fg-2">
              {t(mode === 'sign-in' ? 'newHere' : 'haveAccount')}{' '}
              <button
                type="button"
                className="font-medium text-accent-fg hover:text-accent"
                onClick={() => switchTo(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
              >
                {t(mode === 'sign-in' ? 'createAnAccount' : 'signIn')}
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
