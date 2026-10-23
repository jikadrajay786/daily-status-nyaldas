import type { Task, TaskStatus } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import { STATUS_KEY, TASK_STATUSES } from '@daily-status/core/taskService'
import { useUpdateTaskStatus } from '@daily-status/core/useTasks'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Notice } from '@/components/ui'
import { useTheme } from '@/lib/theme'

// Wraps to two rows on narrow phones instead of squeezing four labels into one Segmented bar.
export const TaskStatusPicker = ({
  task
}: {
  task: Pick<Task, 'id' | 'status'>
}): React.JSX.Element => {
  const { t } = useT()
  const { colors: c } = useTheme()
  const { run, busy, error } = useUpdateTaskStatus()
  const [want, setWant] = useState<TaskStatus | null>(null)
  if (want === task.status) setWant(null)
  const shown = want ?? task.status

  const pick = async (status: TaskStatus): Promise<void> => {
    setWant(status)
    if (!(await run({ taskId: task.id, status }))) setWant(null)
  }

  return (
    <View style={s.box}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('taskStatus')} style={s.row}>
        {TASK_STATUSES.map((st) => (
          <Pressable
            key={st}
            accessibilityRole="radio"
            accessibilityState={{ checked: shown === st, disabled: busy }}
            disabled={busy}
            onPress={() => shown !== st && void pick(st)}
            style={({ pressed }) => [
              s.option,
              {
                borderColor: shown === st ? c.accent : c.line,
                backgroundColor: shown === st || pressed ? c.selected : 'transparent'
              }
            ]}
          >
            <Text style={[s.text, { color: shown === st ? c.fg : c.fg2 }]}>
              {t(STATUS_KEY[st])}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Notice tone="bad">{t(error)}</Notice>}
    </View>
  )
}

const s = StyleSheet.create({
  box: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  text: { fontSize: 15, fontWeight: '600', textAlign: 'center' }
})
