import { useAnnounce } from '@/lib/announce'
import { useT } from '@daily-status/core/i18n'
import { useVerifyCode } from '@daily-status/core/useVerifyCode'
import * as Haptics from 'expo-haptics'
import { useEffect } from 'react'
import { Text } from './gs/text'
import { OtpInput } from './OtpInput'
import { Button, Link, Notice, Title } from './ui'

type Props = { email: string; password: string; justSent: boolean; onBack: () => void }

export const VerifyEmail = ({ email, password, justSent, onBack }: Props): React.JSX.Element => {
  const { t } = useT()
  const otp = useVerifyCode({ email, password, justSent })
  const { phase, rejected } = otp

  useEffect(() => {
    if (rejected) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }, [rejected])
  // The Verify button's spinner shows it visually; screen readers are told in words.
  useAnnounce(phase.state === 'checking' ? t('checkingCode') : undefined)

  return (
    <>
      <Title center sub={t(justSent ? 'verifySent' : 'verifyNeeded', { email })}>
        {t('verifyTitle')}
      </Title>
      <OtpInput
        value={otp.code}
        onChange={otp.setCode}
        label={t('code')}
        hint={t('codeHint')}
        invalid={phase.state === 'error'}
        disabled={phase.state === 'checking'}
        rejected={rejected}
      />
      <Text className="text-center text-[13px] text-fg-3">{t('codeHint')}</Text>
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      {phase.state === 'sent' && <Notice tone="ok">{t('codeSent')}</Notice>}
      <Button onPress={otp.submit} busy={phase.state === 'checking'} disabled={otp.busy}>
        {t('verify')}
      </Button>
      <Button
        variant="ghost"
        busy={phase.state === 'resending'}
        disabled={otp.wait > 0 || otp.busy}
        onPress={otp.resend}
      >
        {otp.wait > 0 ? t('resendIn', { s: otp.wait }) : t('resend')}
      </Button>
      <Text className="text-center text-[13px] text-fg-3">{t('checkSpam')}</Text>
      <Link onPress={() => !otp.busy && onBack()}>{t('otherEmail')}</Link>
    </>
  )
}
