import { useT } from '@daily-status/core/i18n'
import { bumpLive, useLiveQuery } from '@daily-status/core/live'
import { today } from '@daily-status/core/supabase'
import { dueFromDay, listPeople } from '@daily-status/core/taskService'
import { useCreateTask } from '@daily-status/core/useTasks'
import { addDays } from '@daily-status/core/workdays'
import { router } from 'expo-router'
import { useState } from 'react'
import { DateField } from '@/components/DateField'
import { PeoplePicker } from '@/components/PeoplePicker'
import { Button, Field, Loading, Notice, Screen, Skeleton } from '@/components/ui'

export default function NewTask(): React.JSX.Element {
  const { t } = useT()
  const [people] = useLiveQuery('task-people', listPeople)
  const { run, busy, error } = useCreateTask()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [due, setDue] = useState(() => addDays(today(), 1))
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const submit = async (): Promise<void> => {
    const res = await run({
      title,
      description: details,
      dueDate: dueFromDay(due),
      userIds: [...picked]
    })
    if (!res) return
    bumpLive()
    router.dismissTo({ pathname: '/board', params: { created: res.id } })
  }

  return (
    <Screen underHeader>
      <Field
        label={t('taskTitle')}
        placeholder={t('taskTitlePlaceholder')}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Field
        label={t('taskDetails')}
        value={details}
        onChangeText={setDetails}
        maxLength={2000}
        multiline
        textAlignVertical="top"
        className="min-h-24"
      />
      <DateField
        label={t('taskDue')}
        value={due}
        onChange={setDue}
        min={today()}
        max={addDays(today(), 730)}
      />
      {people.state === 'ok' ? (
        <PeoplePicker people={people.data} picked={picked} onChange={setPicked} />
      ) : people.state === 'error' ? (
        <Notice tone="bad">{t(people.message)}</Notice>
      ) : (
        <Loading>
          <Skeleton width="100%" height={168} />
        </Loading>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
      <Button busy={busy} onPress={() => void submit()}>
        {t('taskCreate')}
      </Button>
    </Screen>
  )
}
