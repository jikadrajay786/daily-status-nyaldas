import { isLead } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { Redirect, Stack } from 'expo-router'
import { useProfile } from '@/lib/profile'

// Links from Home open a person with the list underneath (withAnchor), so Back returns to Team.
// eslint-disable-next-line react-refresh/only-export-components -- Expo Router reads this export
export const unstable_settings = { initialRouteName: 'index' }

// The tab is already hidden for everyone else; this also stops a dailystatus://team/… link. RLS is the real boundary.
export default function TeamLayout(): React.JSX.Element {
  const { t } = useT()
  const { role } = useProfile()
  if (role !== 'admin' && !isLead(role)) return <Redirect href="/" />
  return (
    <Stack screenOptions={{ headerBackTitle: t('navTeam') }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="edit/[statusId]" options={{ title: '' }} />
    </Stack>
  )
}
