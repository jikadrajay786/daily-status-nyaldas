import { useState, type FormEvent } from 'react'
import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { dueFromDay, listPeople } from '@daily-status/core/taskService'
import { useQuery } from '@daily-status/core/useQuery'
import { useCreateTask } from '@daily-status/core/useTasks'
import { Button, Card, Field, Input, Notice, Skeleton, TextArea } from '../ui'

const EMPTY = { title: '', description: '', due: '' }

export const TaskForm = ({ onCreated }: { onCreated: () => void }): React.JSX.Element => {
  const { t } = useT()
  const [people] = useQuery('task-people', listPeople)
  const { run, busy, error } = useCreateTask()
  const [form, setForm] = useState(EMPTY)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: { currentTarget: { value: string } }) =>
    setForm({ ...form, [k]: e.currentTarget.value })

  const toggle = (id: string): void =>
    setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])))

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setDone(false)
    const res = await run({
      title: form.title,
      description: form.description,
      dueDate: form.due && dueFromDay(form.due),
      userIds: [...picked]
    })
    if (!res) return
    setForm(EMPTY)
    setPicked(new Set())
    setDone(true)
    onCreated()
  }

  return (
    <Card title={t('newTask')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('taskTitle')}>
          <Input
            required
            maxLength={200}
            value={form.title}
            onChange={set('title')}
            placeholder={t('taskTitlePlaceholder')}
          />
        </Field>
        <Field label={t('taskDetails')}>
          <TextArea maxLength={2000} value={form.description} onChange={set('description')} />
        </Field>
        <Field label={t('taskDue')}>
          <Input type="date" required min={today()} value={form.due} onChange={set('due')} />
        </Field>
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1.5 font-medium text-fg-2">{t('taskPeople')}</legend>
          <span className="text-xs text-fg-3">{t('taskPeopleHint')}</span>
          <div className="mt-1 grid max-h-60 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {people.state === 'ok' && !people.data.length ? (
              <p className="px-2 py-1.5 text-fg-2">{t('taskPeopleEmpty')}</p>
            ) : people.state === 'ok' ? (
              people.data.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-accent"
                  />
                  <span className="truncate">{nameOf(p)}</span>
                </label>
              ))
            ) : people.state === 'error' ? (
              <Notice tone="bad">{t(people.message)}</Notice>
            ) : (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-full" />)
            )}
          </div>
        </fieldset>
        {error && <Notice tone="bad">{t(error)}</Notice>}
        {done && <Notice tone="ok">{t('taskCreated')}</Notice>}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? t('pleaseWait') : t('taskCreate')}
        </Button>
      </form>
    </Card>
  )
}
