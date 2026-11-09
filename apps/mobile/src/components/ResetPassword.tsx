import { useT } from '@daily-status/core/i18n'
import { usePasswordReset } from '@daily-status/core/usePasswordReset'
import { Lock, Mail } from 'lucide-react-native'
import { useState } from 'react'
import { withUniwind } from 'uniwind'
import { VStack } from './gs/vstack'
import { Button, Card, Field, Link, Notice, Title } from './ui'
import { VerifyEmail } from './VerifyEmail'

const LockIcon = withUniwind(Lock)
const MailIcon = withUniwind(Mail)

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = { initialEmail: string; onBack: () => void; onChanged: () => void }

export const ResetPassword = ({ initialEmail, onBack, onChanged }: Props): React.JSX.Element => {
  const { t } = useT()
  const { step, email, phase, recovery, send, save, changeEmail } = usePasswordReset(onChanged)
  const [address, setAddress] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const busy = phase.state === 'busy'

  if (step === 'code')
    return <VerifyEmail email={email} justSent recovery={recovery} onBack={changeEmail} />

  const isEmail = step === 'email'
  const to = address.trim()
  const submit = (): void => {
    if (busy) return
    const bad = isEmail
      ? !to
        ? t('vRequired')
        : !EMAIL.test(to) && t('vEmail')
      : password.length < 6 && t('vTooShort', { n: 6 })
    setInvalid(bad || undefined)
    if (!bad) void (isEmail ? send(to) : save(password))
  }

  return (
    <>
      <Title center sub={t(isEmail ? 'forgotIntro' : 'newPasswordIntro')}>
        {t(isEmail ? 'forgotTitle' : 'newPasswordTitle')}
      </Title>
      <Card>
        <VStack className="gap-4">
          {isEmail ? (
            <Field
              label={t('email')}
              icon={<MailIcon colorClassName="accent-fg-3" size={20} />}
              value={address}
              {...(invalid && { error: invalid })}
              onChangeText={(v) => {
                setAddress(v)
                setInvalid(undefined)
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              placeholder="you@company.com"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          ) : (
            <Field
              label={t('newPassword')}
              icon={<LockIcon colorClassName="accent-fg-3" size={20} />}
              reveal
              hint={t('passwordHint')}
              value={password}
              {...(invalid && { error: invalid })}
              onChangeText={(v) => {
                setPassword(v)
                setInvalid(undefined)
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          )}
          {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
          <Button onPress={submit} busy={busy}>
            {t(isEmail ? 'sendCode' : 'savePassword')}
          </Button>
        </VStack>
      </Card>
      <Link onPress={() => !busy && onBack()}>{t('backToSignIn')}</Link>
    </>
  )
}
