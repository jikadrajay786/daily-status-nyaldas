import { fmtShort } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { dueDay, isOverdue, STATUS_KEY, STATUS_TONE } from '@daily-status/core/taskService'
import { useUserTasks } from '@daily-status/core/useTasks'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CardsSkeleton } from '@/components/StatusCard'
import { TaskStatusPicker } from '@/components/TaskStatusPicker'
import { Badge, Button, Card, Notice, Title } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'
import { useTheme } from '@/lib/theme'

export default function Tasks(): React.JSX.Element {
  const { t, locale } = useT()
  const { colors } = useTheme()
  const { id } = useProfile()
  const [tasks, reload] = useUserTasks(id)
  const pull = usePullToRefresh(tasks.state === 'loading', reload)

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.fill, { backgroundColor: colors.canvas }]}
    >
      <FlatList
        data={tasks.state === 'ok' ? tasks.data : []}
        keyExtractor={(task) => task.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl {...pull} />}
        ListHeaderComponent={<Title sub={t('tasksSubtitle')}>{t('navTasks')}</Title>}
        ListEmptyComponent={
          tasks.state === 'loading' ? (
            <CardsSkeleton />
          ) : tasks.state === 'error' ? (
            <View style={s.gap}>
              <Notice tone="bad">{t(tasks.message)}</Notice>
              <Button variant="ghost" onPress={reload}>
                {t('tryAgain')}
              </Button>
            </View>
          ) : (
            <Notice>{t('tasksEmpty')}</Notice>
          )
        }
        renderItem={({ item: task }) => (
          <Card>
            <View style={s.gap}>
              <Text accessibilityRole="header" style={[s.title, { color: colors.fg }]}>
                {task.title}
              </Text>
              <View style={s.meta}>
                <Badge label={t(STATUS_KEY[task.status])} tone={STATUS_TONE[task.status]} />
                {isOverdue(task) && <Badge label={t('taskOverdue')} tone="warn" />}
                <Text style={[s.due, { color: colors.fg2 }]}>
                  {t('taskDueOn', { date: fmtShort(dueDay(task.due_date), locale) })}
                </Text>
              </View>
              {task.description && (
                <Text style={[s.body, { color: colors.fg2 }]}>{task.description}</Text>
              )}
              <TaskStatusPicker task={task} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: 24, gap: 16 },
  gap: { gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  due: { fontSize: 14 },
  body: { fontSize: 15, lineHeight: 22 }
})
