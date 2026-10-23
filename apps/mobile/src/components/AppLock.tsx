import { unlockMessage } from '@daily-status/core/appLock'
import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import * as Haptics from 'expo-haptics'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, Link, Notice } from '@/components/ui'
import { askToUnlock, checkSupport, setLockOn, type LockState } from '@/lib/appLock'
import { useTheme } from '@/lib/theme'

const Brand = (): React.JSX.Element => {
  const { colors: c } = useTheme()
  return (
    <View style={[s.logo, { backgroundColor: c.accent }]}>
      <Text style={[s.logoText, { color: c.onAccent }]}>DS</Text>
    </View>
  )
}

const LockScreen = ({
  userId,
  onUnlock
}: {
  userId: string
  onUnlock: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  const [method, setMethod] = useState<Key>('methodFaceId')
  const [message, setMessage] = useState<Key | null>(null)
  const [busy, setBusy] = useState(false)
  // A ref as well as state: the auto-prompt and a tap on Unlock can land in the same moment.
  const inFlight = useRef(false)

  const tryUnlock = async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const support = await checkSupport()
      setBusy(true)
      setMethod(support.method)
      // Face ID or every fingerprint was removed after the lock was turned on: only the password can vouch now.
      if (!support.hardware || !support.enrolled) return setMessage('lockGone')
      const res = await askToUnlock(t, t('lockPrompt'))
      if (res.success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        return onUnlock()
      }
      const key = unlockMessage(res.error)
      setMessage(key)
      if (key) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } catch {
      setMessage('lockFailed')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // Prompt straight away, but only while the app is in front: a prompt raised from the background is cancelled
  // by the system, so if it opened there the first return to the front asks instead. Once per lock: re-prompting
  // after every cancel would trap people in a loop of Face ID sheets.
  const autoPrompt = useEffectEvent(() => void tryUnlock())
  useEffect(() => {
    // After the first paint, so the lock screen is already up behind the system sheet.
    if (AppState.currentState === 'active') {
      const id = setTimeout(autoPrompt, 0)
      return () => clearTimeout(id)
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      sub.remove()
      autoPrompt()
    })
    return () => sub.remove()
  }, [])

  const usePassword = (): void => {
    // Leaving through the password also switches the lock off when Face ID or fingerprint is gone, so it doesn't
    // block the next launch the same way.
    if (message === 'lockGone') setLockOn(userId, false)
    void db().auth.signOut()
  }

  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, s.screen, { backgroundColor: c.canvas }]}>
      <View style={s.body} accessibilityViewIsModal>
        <Brand />
        <Text accessibilityRole="header" style={[s.title, { color: c.fg }]}>
          {t('lockedTitle')}
        </Text>
        <Text style={[s.sub, { color: c.fg2 }]}>{t('lockedSub', { method: t(method) })}</Text>
        {message && <Notice tone="bad">{t(message, { method: t(method) })}</Notice>}
        {message !== 'lockGone' && (
          <Button onPress={() => void tryUnlock()} disabled={busy}>
            {t('unlock')}
          </Button>
        )}
        <Link onPress={usePassword}>{t('usePassword')}</Link>
      </View>
    </SafeAreaView>
  )
}

// Wraps the signed-in app. The lock screen sits over everything, tab bar included, and screen readers only
// reach it (accessibilityViewIsModal / no-hide-descendants on the app underneath).
export const AppLockGate = ({
  userId,
  lock,
  children
}: {
  userId: string
  lock: LockState
  children: React.ReactNode
}): React.JSX.Element => {
  const { colors: c } = useTheme()
  const hidden = lock.locked || lock.covered
  return (
    <View style={s.fill}>
      <View
        style={s.fill}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hidden}
      >
        {children}
      </View>
      {lock.locked ? (
        <LockScreen userId={userId} onUnlock={lock.unlock} />
      ) : (
        lock.covered && (
          <View style={[StyleSheet.absoluteFill, s.screen, { backgroundColor: c.canvas }]}>
            <Brand />
          </View>
        )
      )}
    </View>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  screen: { justifyContent: 'center', alignItems: 'center' },
  body: { width: '100%', maxWidth: 400, padding: 24, gap: 16, alignItems: 'stretch' },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center'
  },
  logoText: { fontSize: 20, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  sub: { fontSize: 16, textAlign: 'center' }
})
