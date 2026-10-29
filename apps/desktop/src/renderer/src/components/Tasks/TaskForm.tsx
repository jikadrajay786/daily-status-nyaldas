import { Check, X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Role } from '@daily-status/core/database.types'
import { initials, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import {
  dueFromDay,
  listPeople,
  type Assignee,
  type BoardTask
} from '@daily-status/core/taskService'
import { useLiveQuery } from '@daily-status/core/live'
import { useCreateTask } from '@daily-status/core/useTasks'
import { Avatar, Button, Card, Field, Input, Notice, Skeleton, TextArea } from '../ui'
import { ShareButton } from './ShareButton'

const EMPTY = { title: '', description: '', due: '' }
const SUBMIT_KEYS = /Mac/.test(navigator.userAgent) ? '⌘ Enter' : 'Ctrl Enter'

// Cmd/Ctrl+Enter submits from any field, including the details box where plain Enter adds a line.
const submitOnShortcut = (e: KeyboardEvent<HTMLFormElement>): void => {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
  e.preventDefault()
  e.currentTarget.requestSubmit()
}

// Search, tick boxes and the picked people as removable chips, so a long staff list stays manageable.
const PeopleList = ({
  people,
  picked,
  onChange
}: {
  people: readonly Assignee[]
  picked: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}): React.JSX.Element => {
  const { t } = useT()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = people.filter(
    (p) => !needle || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(needle)
  )
  const allShown = rows.length > 0 && rows.every((p) => picked.has(p.id))
  const toggle = (id: string): void =>
    onChange(new Set(picked.has(id) ? [...picked].filter((x) => x !== id) : [...picked, id]))

  if (!people.length) return <p className="text-fg-2">{t('taskPeopleEmpty')}</p>
  return (
    <>
      {picked.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {people
            .filter((p) => picked.has(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-label={t('removePerson', { name: nameOf(p) })}
                className="flex items-center gap-1 rounded-full bg-accent/15 py-1 pr-2 pl-3 font-medium text-accent-fg transition-colors duration-150 ease-enter hover:bg-accent/25"
              >
                {nameOf(p)}
                <X aria-hidden className="size-3.5" />
              </button>
            ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 6 && (
          <div className="min-w-48 flex-1">
            <Input
              type="search"
              aria-label={t('searchPeople')}
              placeholder={t('searchPeople')}
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
          </div>
        )}
        {rows.length > 1 && (
          <Button
            variant="ghost"
            onClick={() =>
              onChange(
                new Set(
                  allShown
                    ? [...picked].filter((id) => !rows.some((p) => p.id === id))
                    : [...picked, ...rows.map((p) => p.id)]
                )
              )
            }
          >
            {allShown ? t('clearAll') : t('pickAll')}
          </Button>
        )}
      </div>
      <div className="grid max-h-72 grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-1 overflow-y-auto rounded-lg border border-line p-1.5 [scrollbar-gutter:stable]">
        {rows.length ? (
          rows.map((p) => (
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
              <Avatar text={initials(p)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-fg">{nameOf(p)}</span>
                {p.full_name && p.email && (
                  <span className="truncate text-xs text-fg-3">{p.email}</span>
                )}
              </span>
              <span
                aria-hidden
                className="grid size-4.5 shrink-0 place-items-center rounded border border-fg-3 bg-field transition-colors duration-150 ease-enter group-has-checked:border-accent group-has-checked:bg-accent"
              >
                <Check
                  strokeWidth={3}
                  className="size-3 scale-50 text-on-accent opacity-0 transition-[opacity,scale] duration-200 ease-enter group-has-checked:scale-100 group-has-checked:opacity-100"
                />
              </span>
            </label>
          ))
        ) : (
          <p className="px-2 py-1.5 text-fg-2">{t('noPeopleMatch', { q: q.trim() })}</p>
        )}
      </div>
    </>
  )
}

export const TaskForm = ({
  role,
  onCreated
}: {
  role: Role
  onCreated: () => void
}): React.JSX.Element => {
  const { t } = useT()
  const [people] = useLiveQuery(`task-people:${role}`, () => listPeople(role))
  const { run, busy, error } = useCreateTask()
  const [form, setForm] = useState(EMPTY)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [created, setCreated] = useState<BoardTask | null>(null)
  const set = (k: keyof typeof EMPTY) => (e: { currentTarget: { value: string } }) =>
    setForm({ ...form, [k]: e.currentTarget.value })

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setCreated(null)
    const res = await run({
      title: form.title,
      description: form.description,
      dueDate: form.due && dueFromDay(form.due),
      userIds: [...picked]
    })
    if (!res) return
    setForm(EMPTY)
    setPicked(new Set())
    // The live board catches up a moment later; the picker already knows who it went to.
    setCreated({
      ...res,
      assignees: people.state === 'ok' ? people.data.filter((p) => picked.has(p.id)) : []
    })
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
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1.5 flex w-full flex-wrap justify-between gap-2 font-medium text-fg-2">
            {t('taskPeople')}
            <span aria-live="polite" className="text-xs font-normal text-fg-3">
              {picked.size ? t('pickedCount', { n: picked.size }) : t('taskPeopleHint')}
            </span>
          </legend>
          {people.state === 'ok' ? (
            <PeopleList people={people.data} picked={picked} onChange={setPicked} />
          ) : people.state === 'error' ? (
            <Notice tone="bad">{t(people.message)}</Notice>
          ) : (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)
          )}
        </fieldset>
        {error && <Notice tone="bad">{t(error)}</Notice>}
        {created && (
          <div className="flex flex-wrap items-center gap-3">
            <Notice tone="ok">{t('taskCreated')}</Notice>
            <ShareButton task={created} />
          </div>
        )}
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
