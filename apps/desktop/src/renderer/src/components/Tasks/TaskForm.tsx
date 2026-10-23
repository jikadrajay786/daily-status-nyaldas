import { Check } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { dueFromDay, listPeople } from '@daily-status/core/taskService'
import { useQuery } from '@daily-status/core/useQuery'
import { useCreateTask } from '@daily-status/core/useTasks'
import { Button, Card, Field, Input, Notice, Skeleton, TextArea } from '../ui'

const EMPTY = { title: '', description: '', due: '' }
const SUBMIT_KEYS = /Mac/.test(navigator.userAgent) ? '⌘ Enter' : 'Ctrl Enter'

// Cmd/Ctrl+Enter submits from any field, including the details box where plain Enter adds a line.
const submitOnShortcut = (e: KeyboardEvent<HTMLFormElement>): void => {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
  e.preventDefault()
  e.currentTarget.requestSubmit()
}

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
      <form onSubmit={submit} onKeyDown={submitOnShortcut} className="flex flex-col gap-4">
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
                // The real checkbox stays for keyboards and screen readers; the drawn box only animates the tick.
                <label
                  key={p.id}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 ease-enter hover:bg-hover has-checked:bg-selected has-focus-visible:outline-2 has-focus-visible:outline-accent-fg"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid size-4.5 shrink-0 place-items-center rounded border border-fg-3 bg-field transition-colors duration-150 ease-enter group-has-checked:border-accent group-has-checked:bg-accent"
                  >
                    <Check
                      strokeWidth={3}
                      className="size-3 scale-50 text-on-accent opacity-0 transition-[opacity,scale] duration-200 ease-enter group-has-checked:scale-100 group-has-checked:opacity-100"
                    />
                  </span>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" busy={busy}>
            {t('taskCreate')}
          </Button>
          <span className="text-xs text-fg-3">{t('shortcutHint', { keys: SUBMIT_KEYS })}</span>
        </div>
      </form>
    </Card>
  )
}
