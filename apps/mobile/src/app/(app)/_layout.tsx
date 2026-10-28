import { useT } from '@daily-status/core/i18n'
import { useRealtimeSync } from '@daily-status/core/live'
import { Stack } from 'expo-router'
import { AppLockGate } from '@/components/AppLock'
import { QuickCommentProvider } from '@/components/QuickComment'
import { useAppLock } from '@/lib/appLock'
import { useProfile } from '@/lib/profile'
import { useReminders } from '@/lib/reminder'

// The tabs, with details screens pushed over them; the lock covers both.
export default function AppLayout(): React.JSX.Element {
  const { t, lang } = useT()
  const { id, role } = useProfile()
  useReminders(role !== 'admin' ? id : null, lang)
  useRealtimeSync(id)
  const lock = useAppLock(id)
  return (
    <AppLockGate userId={id} lock={lock}>
      <QuickCommentProvider>
        <Stack screenOptions={{ headerBackTitle: t('back') }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="details/[kind]/[id]" options={{ headerShown: false }} />
        </Stack>
      </QuickCommentProvider>
    </AppLockGate>
  )
}
