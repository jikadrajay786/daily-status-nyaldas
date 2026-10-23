import { useId } from 'react'
import { useT } from '@daily-status/core/i18n'
import { useVerifyCode } from '@daily-status/core/useVerifyCode'
import { OtpInput } from './OtpInput'
import { Button, Notice } from './ui'

type Props = { email: string; password: string; justSent: boolean; onBack: () => void }

// Codes beat links on desktop: the email's link would open a browser tab instead of returning to the app.
export const VerifyEmail = ({ email, password, justSent, onBack }: Props): React.JSX.Element => {
  const { t } = useT()
  const hint = useId()
  const otp = useVerifyCode({ email, password, justSent })
  const { phase } = otp

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        otp.submit()
      }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <h2 className="text-lg font-semibold tracking-tight">{t('verifyTitle')}</h2>
        <p className="mt-1 text-sm text-fg-2">
          {t(justSent ? 'verifySent' : 'verifyNeeded', { email })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <OtpInput
          value={otp.code}
          onChange={otp.setCode}
          label={t('code')}
          describedBy={hint}
          invalid={phase.state === 'error'}
          disabled={phase.state === 'checking'}
          rejected={otp.rejected}
        />
        <p id={hint} className="text-center text-xs text-fg-3">
          {t('codeHint')}
        </p>
      </div>

      {/* Polite, so a screen reader hears "checking" once; the error Notice is an alert and interrupts. */}
      <p aria-live="polite" className="text-center text-sm text-fg-2 empty:hidden">
        {phase.state === 'checking' && t('checkingCode')}
      </p>
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      {phase.state === 'sent' && <Notice tone="ok">{t('codeSent')}</Notice>}

      <Button type="submit" busy={phase.state === 'checking'} disabled={otp.busy}>
        {t('verify')}
      </Button>
      <Button
        variant="ghost"
        busy={phase.state === 'resending'}
        disabled={otp.wait > 0 || otp.busy}
        onClick={otp.resend}
      >
        {otp.wait > 0 ? t('resendIn', { s: otp.wait }) : t('resend')}
      </Button>
      <p className="text-center text-xs text-fg-3">{t('checkSpam')}</p>
      <button
        type="button"
        onClick={onBack}
        disabled={otp.busy}
        className="text-center text-sm font-medium text-accent-fg hover:text-accent disabled:opacity-40"
      >
        {t('otherEmail')}
      </button>
    </form>
  )
}
