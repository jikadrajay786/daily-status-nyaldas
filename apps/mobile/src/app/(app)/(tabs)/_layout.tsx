import { isLead } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { canAssign } from '@daily-status/core/taskService'
import { router, usePathname } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import {
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  History,
  House,
  ListTodo,
  Settings,
  Users,
  type LucideIcon
} from 'lucide-react-native'
import { useEffect } from 'react'
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
  const path = usePathname()
  // "/" is Today, which leads also have, so the app would open there. A reminder tap still wins: (app)/_layout
  // handles it after this runs.
  const lead = isLead(role)
  useEffect(() => {
    if (lead && path === '/') router.replace('/home')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only where the app opens, not every later visit to Today
  }, [lead])
  return (
    <TabBarInsetProvider>
      <Tabs tabBar={(props) => <LiquidTabBar {...props} />} screenOptions={{ headerShown: false }}>
        {/* First, so admins and leads open on it. */}
        <Tabs.Protected guard={!staff || isLead(role)}>
          <Tabs.Screen name="home" options={{ title: t('navHome'), tabBarIcon: icon(House) }} />
        </Tabs.Protected>
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
        {/* Admins see everyone, store and agency managers their own staff; RLS is what actually limits the data. */}
        <Tabs.Protected guard={!staff || isLead(role)}>
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
