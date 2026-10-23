import { useT } from '@daily-status/core/i18n'
import { useRealtimeSync } from '@daily-status/core/live'
import { Tabs } from 'expo-router/js-tabs'
import {
  CalendarCheck,
  History,
  ListTodo,
  Settings,
  Users,
  type LucideIcon
} from 'lucide-react-native'
import type { ColorValue } from 'react-native'
import { LiquidTabBar } from '@/components/LiquidTabBar'
import { useProfile } from '@/lib/profile'
import { useReminders } from '@/lib/reminder'

const icon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }): React.JSX.Element {
    return <Icon color={color} size={size} />
  }

export default function AppLayout(): React.JSX.Element {
  const { t, lang } = useT()
  const { id, role } = useProfile()
  useReminders(id, lang)
  useRealtimeSync(id)
  return (
    <Tabs tabBar={(props) => <LiquidTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('navToday'), tabBarIcon: icon(CalendarCheck) }}
      />
      <Tabs.Screen name="history" options={{ title: t('navHistory'), tabBarIcon: icon(History) }} />
      {/* Admins hand out tasks and never receive them. */}
      <Tabs.Protected guard={role !== 'admin'}>
        <Tabs.Screen name="tasks" options={{ title: t('navTasks'), tabBarIcon: icon(ListTodo) }} />
      </Tabs.Protected>
      {/* Hidden for non-admins; RLS is what actually keeps team data from them. */}
      <Tabs.Protected guard={role === 'admin'}>
        <Tabs.Screen name="team" options={{ title: t('navTeam'), tabBarIcon: icon(Users) }} />
      </Tabs.Protected>
      <Tabs.Screen
        name="settings"
        options={{ title: t('navSettings'), tabBarIcon: icon(Settings) }}
      />
    </Tabs>
  )
}
