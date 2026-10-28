import { useBusy } from '@daily-status/core/useBusy'
import { unlockMessage } from '@daily-status/core/appLock'
import { useT, type Key } from '@daily-status/core/i18n'
import { db } from '@daily-status/core/supabase'
import * as Haptics from 'expo-haptics'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context'
import { withUniwind } from 'uniwind'
import { Button, Link, Notice } from '@/components/ui'
import { askToUnlock, checkSupport, setLockOn, type LockState } from '@/lib/appLock'
import { Box } from './gs/box'
import { Logo } from './Logo'
import { Heading } from './gs/heading'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'

const SafeAreaView = withUniwind(RNSafeAreaView)

const Brand = (): React.JSX.Element => (
  <Box className="self-center">
    <Logo size={56} />
  </Box>
)

const LockScreen = ({
  userId,
  onUnlock
}: {
  userId: string
  onUnlock: () => void
}): React.JSX.Element => {
  const { t } = useT()
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

  const [leaving, leave] = useBusy()
  const usePassword = (): void => {
    // Leaving through the password also switches the lock off when Face ID or fingerprint is gone, so it doesn't
    // block the next launch the same way.
    if (message === 'lockGone') setLockOn(userId, false)
    void leave(() => db().auth.signOut())
  }

  return (
    <SafeAreaView className="absolute inset-0 items-center justify-center bg-canvas">
      <VStack className="w-full max-w-[400px] gap-4 p-6" accessibilityViewIsModal>
        <Brand />
        <Heading
          accessibilityRole="header"
          className="text-center text-[22px] font-semibold text-fg"
        >
          {t('lockedTitle')}
        </Heading>
        <Text className="text-center text-[16px] text-fg-2">
          {t('lockedSub', { method: t(method) })}
        </Text>
        {message && <Notice tone="bad">{t(message, { method: t(method) })}</Notice>}
        {message !== 'lockGone' && (
          <Button onPress={() => void tryUnlock()} disabled={busy}>
            {t('unlock')}
          </Button>
        )}
        <Link onPress={usePassword} busy={leaving}>
          {t('usePassword')}
        </Link>
      </VStack>
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
  const hidden = lock.locked || lock.covered
  return (
    <Box className="flex-1">
      <Box
        className="flex-1"
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hidden}
      >
        {children}
      </Box>
      {lock.locked ? (
        <LockScreen userId={userId} onUnlock={lock.unlock} />
      ) : (
        lock.covered && (
          <Box className="absolute inset-0 items-center justify-center bg-canvas">
            <Brand />
          </Box>
        )
      )}
    </Box>
  )
}
