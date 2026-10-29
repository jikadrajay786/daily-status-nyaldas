import { useT } from '@daily-status/core/i18n'
import { canAssign } from '@daily-status/core/taskService'
import { Tabs } from 'expo-router/js-tabs'
import {
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  History,
  ListTodo,
  Settings,
  Users,
  type LucideIcon
} from 'lucide-react-native'
import type { ColorValue } from 'react-native'
import { LiquidTabBar, TabBarInsetProvider } from '@/components/LiquidTabBar'
import { useProfile } from '@/lib/profile'

const icon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }): React.JSX.Element {
    return <Icon color={color} size={size} />
  }

export default function TabsLayout(): React.JSX.Element {
  const { t } = useT()
  const { role } = useProfile()
  const staff = role !== 'admin'
  return (
    <TabBarInsetProvider>
      <Tabs tabBar={(props) => <LiquidTabBar {...props} />} screenOptions={{ headerShown: false }}>
        {/* Admins manage rather than report: no daily updates, and they hand out tasks rather than receive them. */}
        <Tabs.Protected guard={staff}>
          <Tabs.Screen
            name="index"
            options={{ title: t('navToday'), tabBarIcon: icon(CalendarCheck) }}
          />
          <Tabs.Screen
            name="history"
            options={{ title: t('navHistory'), tabBarIcon: icon(History) }}
          />
          <Tabs.Screen
            name="tasks"
            options={{ title: t('navTasks'), tabBarIcon: icon(ListTodo) }}
          />
        </Tabs.Protected>
        {/* Hidden for non-admins; RLS is what actually keeps team data from them. */}
        <Tabs.Protected guard={!staff}>
          <Tabs.Screen name="team" options={{ title: t('navTeam'), tabBarIcon: icon(Users) }} />
        </Tabs.Protected>
        {/* Managers report like staff and also hand out tasks. */}
        <Tabs.Protected guard={canAssign(role)}>
          <Tabs.Screen
            name="board"
            options={{ title: t('navTaskBoard'), tabBarIcon: icon(ClipboardList) }}
          />
        </Tabs.Protected>
        <Tabs.Screen
          name="calendar"
          options={{ title: t('navCalendar'), tabBarIcon: icon(CalendarDays) }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: t('navSettings'), tabBarIcon: icon(Settings) }}
        />
      </Tabs>
    </TabBarInsetProvider>
  )
}
