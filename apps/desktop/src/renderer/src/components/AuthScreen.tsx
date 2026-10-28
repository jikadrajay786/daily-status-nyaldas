import { useState, type FormEvent } from 'react'
import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { errMsg } from '@daily-status/core/useQuery'
import { Check, Eye, EyeOff } from 'lucide-react'
import { Logo } from './Logo'
import { Button, Field, Input, Notice, Tabs } from './ui'
import { VerifyEmail } from './VerifyEmail'

type Mode = 'sign-in' | 'sign-up'
type Phase =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'error'; message: Key }
  | { state: 'verify'; email: string; password: string; justSent: boolean }

// A password box with a show/hide button, so people can check what they typed.
const PasswordInput = ({ autoComplete }: { autoComplete: string }): React.JSX.Element => {
  const { t } = useT()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        name="password"
        type={shown ? 'text' : 'password'}
        required
        minLength={6}
        autoComplete={autoComplete}
        style={{ paddingInlineEnd: '2.75rem' }}
      />
      <button
        type="button"
        aria-label={t(shown ? 'hidePassword' : 'showPassword')}
        aria-pressed={shown}
        title={t(shown ? 'hidePassword' : 'showPassword')}
        onClick={() => setShown(!shown)}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-fg-2 transition-colors duration-150 ease-enter hover:text-fg"
      >
        {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  )
}

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
      <div className="flex w-full max-w-4xl animate-rise flex-wrap overflow-hidden rounded-2xl border border-line bg-card shadow-raised">
        <section className="flex flex-[1_1_18rem] flex-col justify-between gap-10 bg-accent p-8 text-on-accent">
          <div className="flex flex-col gap-4">
            <Logo inverse />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Daily Status</h1>
              <p className="mt-1 text-sm opacity-90">
                {t(mode === 'sign-in' ? 'signInTagline' : 'signUpTagline')}
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-3 text-sm">
            {(['perkUpdate', 'perkTasks', 'perkLang'] as const).map((k) => (
              <li key={k} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-on-accent/20">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex-[1_1_22rem] p-8">
          {phase.state === 'verify' ? (
            <VerifyEmail
              email={phase.email}
              password={phase.password}
              justSent={phase.justSent}
              onBack={() => setPhase({ state: 'idle' })}
            />
          ) : (
            <Tabs
              label="Daily Status"
              value={mode}
              onChange={switchTo}
              tabs={[
                ['sign-in', t('signIn')],
                ['sign-up', t('createAccount')]
              ]}
            >
              {/* Keyed by mode, so switching clears the fields and the browser's autofill sees a fresh form. */}
              <form key={mode} onSubmit={submit} className="flex flex-col gap-4">
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
                <Field
                  label={t('password')}
                  {...(mode === 'sign-up' && { hint: t('passwordHint') })}
                >
                  <PasswordInput
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  />
                </Field>
                {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
                <Button type="submit" busy={phase.state === 'busy'} className="py-2.5">
                  {t(mode === 'sign-in' ? 'signIn' : 'createAccount')}
                </Button>
              </form>
            </Tabs>
          )}
        </section>
      </div>
    </main>
  )
}
