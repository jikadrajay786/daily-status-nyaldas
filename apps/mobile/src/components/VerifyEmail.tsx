import { useT } from '@daily-status/core/i18n'
import { useVerifyCode } from '@daily-status/core/useVerifyCode'
import * as Haptics from 'expo-haptics'
import { useEffect } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTheme } from '@/lib/theme'
import { OtpInput } from './OtpInput'
import { Button, Link, Notice, Title } from './ui'

type Props = { email: string; password: string; justSent: boolean; onBack: () => void }

export const VerifyEmail = ({ email, password, justSent, onBack }: Props): React.JSX.Element => {
  const { t } = useT()
  const { colors } = useTheme()
  const otp = useVerifyCode({ email, password, justSent })
  const { phase, rejected } = otp

  useEffect(() => {
    if (rejected) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }, [rejected])

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
      <Text style={[s.small, { color: colors.fg3 }]}>{t('codeHint')}</Text>
      {phase.state === 'checking' && (
        <Text accessibilityLiveRegion="polite" style={[s.status, { color: colors.fg2 }]}>
          {t('checkingCode')}
        </Text>
      )}
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      {phase.state === 'sent' && <Notice tone="ok">{t('codeSent')}</Notice>}
      <Button onPress={otp.submit} disabled={otp.busy}>
        {phase.state === 'checking' ? t('checkingCode') : t('verify')}
      </Button>
      <Button variant="ghost" disabled={otp.wait > 0 || otp.busy} onPress={otp.resend}>
        {otp.wait > 0 ? t('resendIn', { s: otp.wait }) : t('resend')}
      </Button>
      <Text style={[s.small, { color: colors.fg3 }]}>{t('checkSpam')}</Text>
      <Link onPress={() => !otp.busy && onBack()}>{t('otherEmail')}</Link>
    </>
  )
}

const s = StyleSheet.create({
  small: { fontSize: 13, textAlign: 'center' },
  status: { fontSize: 15, textAlign: 'center' }
})
