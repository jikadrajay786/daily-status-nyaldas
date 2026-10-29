import { useT } from '@daily-status/core/i18n'
import { canAssign } from '@daily-status/core/taskService'
import { Redirect, Stack } from 'expo-router'
import { useProfile } from '@/lib/profile'

// Like Team: hidden for staff, and this also stops a deep link. RLS is the real boundary.
export default function BoardLayout(): React.JSX.Element {
  const { t } = useT()
  const { role } = useProfile()
  if (!canAssign(role)) return <Redirect href="/" />
  return (
    <Stack screenOptions={{ headerBackTitle: t('navTaskBoard') }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: t('newTask') }} />
    </Stack>
  )
}
