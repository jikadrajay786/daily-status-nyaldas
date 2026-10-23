import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import { errMsg } from '@daily-status/core/useQuery'
import { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTheme } from '@/lib/theme'
import { Button, Field, Link, Notice, Title } from './ui'

// Supabase refuses a resend within 60s of the last email, so the button waits the same amount.
const COOLDOWN = 60

type Phase =
  { state: 'idle' } | { state: 'busy' } | { state: 'sent' } | { state: 'error'; message: Key }

type Props = { email: string; password: string; justSent: boolean; onBack: () => void }

export const VerifyEmail = ({ email, password, justSent, onBack }: Props): React.JSX.Element => {
  const { t } = useT()
  const { colors } = useTheme()
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(justSent ? COOLDOWN : 0)
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })

  useEffect(() => {
    if (!wait) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  // The address may already be verified (a code entered on another device, or this one consumed before the OS
  // killed the app). Supabase then "sends" new codes without sending anything, to hide which emails exist, so
  // check first: if the password signs in, the auth listener swaps in the app and no code is needed.
  const alreadyVerified = async (): Promise<boolean> =>
    !(await db().auth.signInWithPassword({ email, password })).error

  const verify = async (): Promise<void> => {
    if (code.length !== 6) return setPhase({ state: 'error', message: 'vCode' })
    setPhase({ state: 'busy' })
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
    <>
      <Title center sub={t(justSent ? 'verifySent' : 'verifyNeeded', { email })}>
        {t('verifyTitle')}
      </Title>
      <Field
        label={t('code')}
        value={code}
        // Pasted codes often carry spaces ("123 456"), so keep digits only rather than capping raw length.
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        placeholder="123456"
        returnKeyType="done"
        onSubmitEditing={verify}
      />
      {phase.state === 'error' && <Notice tone="bad">{t(phase.message)}</Notice>}
      {phase.state === 'sent' && <Notice tone="ok">{t('codeSent')}</Notice>}
      <Button onPress={verify} disabled={phase.state === 'busy'}>
        {phase.state === 'busy' ? t('pleaseWait') : t('verify')}
      </Button>
      <Button variant="ghost" disabled={wait > 0 || phase.state === 'busy'} onPress={resend}>
        {wait > 0 ? t('resendIn', { s: wait }) : t('resend')}
      </Button>
      <Text style={[s.spam, { color: colors.fg3 }]}>{t('checkSpam')}</Text>
      <Link onPress={onBack}>{t('otherEmail')}</Link>
    </>
  )
}

const s = StyleSheet.create({ spam: { fontSize: 13, textAlign: 'center' } })
