import { useT } from '@daily-status/core/i18n'
import { Redirect, Stack } from 'expo-router'
import { useProfile } from '@/lib/profile'

// The tab is already hidden for non-admins; this also stops a dailystatus://team/… link. RLS is the real boundary.
export default function TeamLayout(): React.JSX.Element {
  const { t } = useT()
  const { role } = useProfile()
  if (role !== 'admin') return <Redirect href="/" />
  return (
    <Stack screenOptions={{ headerBackTitle: t('navTeam') }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="edit/[statusId]" options={{ title: '' }} />
    </Stack>
  )
}
