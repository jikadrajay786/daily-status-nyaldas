import { useState } from 'react'
import { useT } from '@daily-status/core/i18n'
import { usePasswordReset } from '@daily-status/core/usePasswordReset'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Field, Input, Notice } from './ui'
import { VerifyEmail } from './VerifyEmail'

// A password box with a show/hide button, so people can check what they typed.
export const PasswordInput = ({ autoComplete }: { autoComplete: string }): React.JSX.Element => {
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

type Props = { initialEmail: string; onBack: () => void; onChanged: () => void }

export const ResetPassword = ({ initialEmail, onBack, onChanged }: Props): React.JSX.Element => {
  const { t } = useT()
  const { step, email, phase, recovery, send, save, changeEmail } = usePasswordReset(onChanged)
  const busy = phase.state === 'busy'

  if (step === 'code')
    return <VerifyEmail email={email} justSent recovery={recovery} onBack={changeEmail} />

  const isEmail = step === 'email'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        // Passwords are taken verbatim; leading/trailing spaces are legitimate characters.
        void (isEmail
          ? send(String(form.get('email') ?? '').trim())
          : save(String(form.get('password') ?? '')))
      }}
      className="flex flex-col gap-4"
    >
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          {t(isEmail ? 'forgotTitle' : 'newPasswordTitle')}
        </h2>
        <p className="mt-1 text-sm text-fg-2">{t(isEmail ? 'forgotIntro' : 'newPasswordIntro')}</p>
      </div>
      {isEmail ? (
        <Field label={t('email')}>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            defaultValue={email || initialEmail}
          />
        </Field>
      ) : (
        <Field label={t('newPassword')} hint={t('passwordHint')}>
          <PasswordInput autoComplete="new-password" />
        </Field>
      )}
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      <Button type="submit" busy={busy} className="py-2.5">
        {t(isEmail ? 'sendCode' : 'savePassword')}
      </Button>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="text-center text-sm font-medium text-accent-fg hover:text-accent disabled:opacity-40"
      >
        {t('backToSignIn')}
      </button>
    </form>
  )
}
