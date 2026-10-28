import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { errMsg } from '@daily-status/core/useQuery'
import { Lock, Mail, User } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { type TextInputInstance } from 'react-native'
import { withUniwind } from 'uniwind'
import { VStack } from './gs/vstack'
import { Logo } from './Logo'
import { Button, Card, Field, Notice, Screen, Segmented, Title } from './ui'
import { VerifyEmail } from './VerifyEmail'

const LockIcon = withUniwind(Lock)
const MailIcon = withUniwind(Mail)
const UserIcon = withUniwind(User)

type Mode = 'sign-in' | 'sign-up'
type FieldName = 'fullName' | 'email' | 'password'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Phase =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'error'; message: Key }
  | { state: 'verify'; email: string; password: string; justSent: boolean }

export const AuthScreen = (): React.JSX.Element => {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [invalid, setInvalid] = useState<{ field: FieldName; message: string } | null>(null)
  const nameRef = useRef<TextInputInstance>(null)
  const emailRef = useRef<TextInputInstance>(null)
  const passwordRef = useRef<TextInputInstance>(null)
  const set = (k: FieldName) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (invalid?.field === k) setInvalid(null)
  }
  const errorFor = (k: FieldName): { error?: string } =>
    invalid?.field === k ? { error: invalid.message } : {}

  const submit = async (): Promise<void> => {
    // Passwords are taken verbatim; leading/trailing spaces are legitimate characters.
    const [email, fullName, { password }] = [form.email.trim(), form.fullName.trim(), form]
    const signUp = mode === 'sign-up'
    // Same checks and messages as desktop's `required`/`type="email"`/`minLength` inputs.
    const bad = (
      [
        [signUp && !fullName, 'fullName', t('vRequired')],
        [!email, 'email', t('vRequired')],
        [!EMAIL.test(email), 'email', t('vEmail')],
        [!password, 'password', t('vRequired')],
        [signUp && password.length < 6, 'password', t('vTooShort', { n: 6 })]
      ] as const
    ).find(([failed]) => failed)
    if (bad) {
      setInvalid({ field: bad[1], message: bad[2] })
      return { fullName: nameRef, email: emailRef, password: passwordRef }[bad[1]].current?.focus()
    }
    setPhase({ state: 'busy' })
    try {
      if (mode === 'sign-in') {
        const { error } = await db().auth.signInWithPassword({ email, password })
        // Someone whose app was closed mid-sign-up (the OS kills it while they're in Mail) gets back here.
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
      if (!data.session) setPhase({ state: 'verify', email, password, justSent: true })
    } catch (err) {
      setPhase({ state: 'error', message: errMsg(err) })
    }
  }

  const switchTo = (m: Mode): void => {
    setMode(m)
    setPhase({ state: 'idle' })
    setInvalid(null)
  }

  return (
    <Screen center>
      <VStack className="mb-2 items-center gap-4">
        <Logo />
        <Title center sub={t(mode === 'sign-in' ? 'signInTagline' : 'signUpTagline')}>
          Daily Status
        </Title>
      </VStack>

      {phase.state === 'verify' ? (
        <VerifyEmail
          email={phase.email}
          password={phase.password}
          justSent={phase.justSent}
          onBack={() => setPhase({ state: 'idle' })}
        />
      ) : (
        <>
          <Segmented
            label={t('signIn')}
            value={mode}
            onChange={switchTo}
            options={[
              ['sign-in', t('signIn')],
              ['sign-up', t('createAccount')]
            ]}
          />
          <Card>
            <VStack className="gap-4">
              {mode === 'sign-up' && (
                <Field
                  label={t('fullName')}
                  ref={nameRef}
                  icon={<UserIcon colorClassName="accent-fg-3" size={20} />}
                  value={form.fullName}
                  {...errorFor('fullName')}
                  onChangeText={set('fullName')}
                  autoComplete="name"
                  textContentType="name"
                  placeholder={t('namePlaceholder')}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              )}
              <Field
                ref={emailRef}
                label={t('email')}
                icon={<MailIcon colorClassName="accent-fg-3" size={20} />}
                value={form.email}
                {...errorFor('email')}
                onChangeText={set('email')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                placeholder="you@company.com"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <Field
                ref={passwordRef}
                label={t('password')}
                icon={<LockIcon colorClassName="accent-fg-3" size={20} />}
                reveal
                {...(mode === 'sign-up' && { hint: t('passwordHint') })}
                value={form.password}
                {...errorFor('password')}
                onChangeText={set('password')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
              <Button onPress={submit} busy={phase.state === 'busy'}>
                {t(mode === 'sign-in' ? 'signIn' : 'createAccount')}
              </Button>
            </VStack>
          </Card>
        </>
      )}
    </Screen>
  )
}
