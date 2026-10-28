import { useT } from '@daily-status/core/i18n'
import { Redirect, Stack } from 'expo-router'
import { useProfile } from '@/lib/profile'

// Like Team: hidden for staff, and this also stops a deep link. RLS and the create_task RPC are the real boundary.
export default function BoardLayout(): React.JSX.Element {
  const { t } = useT()
  const { role } = useProfile()
  if (role !== 'admin') return <Redirect href="/" />
  return (
    <Stack screenOptions={{ headerBackTitle: t('navTaskBoard') }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: t('newTask') }} />
    </Stack>
  )
}
