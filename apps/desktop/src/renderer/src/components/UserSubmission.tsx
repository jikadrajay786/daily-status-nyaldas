import { useCommentCounts } from '@daily-status/core/commentService'
import { useEffect, useState, type FormEvent } from 'react'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, fmtStamp } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore } from '@daily-status/core/richText'
import { loadDraft, saveDraft } from '../lib/drafts'
import { initialWriteLang, saveWriteLang } from '../lib/writeLang'
import {
  addStatus,
  canChange,
  hoursLeft,
  listMyDay,
  listMyStatuses,
  updateStatus
} from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { useDayOff } from '@daily-status/core/holidayService'
import { useLiveQuery } from '@daily-status/core/live'
import { errMsg } from '@daily-status/core/useQuery'
import { DescriptionEditor, type EditorChange } from '@daily-status/editor/DescriptionEditor'
import { CardsSkeleton, FormSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { Badge, Button, Card, Field, Input, Notice, PageHeader } from './ui'

type Props = {
  profile: Profile
  date: string
  // An update's id to change it, `new` to add another, or null.
  editing: string | null
  onChange: (date: string, editing: string | null) => void
}

export const UserSubmission = ({ profile, date, editing, onChange }: Props): React.JSX.Element => {
  const { t, locale } = useT()
  const [day, reloadDay] = useLiveQuery(`mine:${profile.id}:${date}`, () =>
    listMyDay(profile.id, date)
  )
  const [recent, reloadRecent] = useLiveQuery(`recent:${profile.id}`, () =>
    listMyStatuses(profile.id, '', 5).then(({ rows }) => rows)
  )
  const { off: dayOff, holiday } = useDayOff(date)
  const counts = useCommentCounts(
    'status',
    recent.state === 'ok' ? recent.data.map((s) => s.id) : []
  )
  const [resets, setResets] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const rows = day.state === 'ok' ? day.data : []
  const row = rows.find((r) => r.id === editing) ?? null
  const locked = rows.length > 0 && !canChange(date, profile.role)
  const draftKey = `draft:${profile.id}:${date}${row ? `:${row.id}` : ''}`
  // An unsaved draft means someone was mid-way when they left: reopen the form rather than hide their words.
  const formOpen =
    !locked && (!!row || editing === 'new' || !rows.length || loadDraft(draftKey) !== null)
  const goTo = (d: string, edit: string | null = null): void => {
    setSaved(null)
    onChange(d, edit)
  }

  return (
    <>
      <PageHeader title={t('navToday')} subtitle={t('todaySubtitle')} />
      <Card>
        <div className="mb-5 w-48">
          <Field label={t('date')}>
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => e.target.value && goTo(e.target.value)}
            />
          </Field>
        </div>
        {dayOff && day.state === 'ok' && !rows.length && (
          <Notice>{holiday ? t('holidayToday', { name: holiday }) : t('dayOff')}</Notice>
        )}
        {day.state === 'loading' ? (
          <FormSkeleton />
        ) : day.state === 'error' ? (
          <Notice tone="bad">{t(day.message)}</Notice>
        ) : (
          <div className="flex flex-col gap-3">
            {locked && <Notice>{t('statusLocked')}</Notice>}
            {saved === date && !formOpen && (
              <Notice tone="ok">{t('savedDone', { date: fmtDate(date, locale) })}</Notice>
            )}
            {rows.length > 1 && (
              <p className="text-sm font-medium text-fg-2">
                {t('dayTotal', {
                  n: rows.length,
                  hours: fmtHours(
                    rows.reduce((sum, r) => sum + r.hours_logged, 0),
                    t
                  )
                })}
              </p>
            )}
            {rows
              .filter((r) => r.id !== row?.id)
              .map((r) => (
                <StatusCard
                  key={r.id}
                  status={r}
                  actions={
                    !locked &&
                    !formOpen && (
                      <Button variant="ghost" onClick={() => goTo(date, r.id)}>
                        {t('edit')}
                      </Button>
                    )
                  }
                />
              ))}
            {!locked && !formOpen && (
              <div>
                <Button variant="ghost" onClick={() => goTo(date, 'new')}>
                  {t('addAnotherUpdate')}
                </Button>
              </div>
            )}
            {formOpen && (
              // Keyed so switching dates, saving or discarding a draft remounts the form with fresh values.
              <SubmissionForm
                key={`${date}:${row ? `${row.id}:${row.updated_at}` : `new:${rows.length}`}:${resets}`}
                userId={profile.id}
                date={date}
                row={row}
                first={!rows.length}
                left={hoursLeft(rows, row?.id)}
                onSaved={() => {
                  reloadDay()
                  reloadRecent()
                  onChange(date, null)
                  setSaved(date)
                }}
                onDiscard={() => setResets((n) => n + 1)}
                {...(rows.length > 0 && {
                  onCancel: () => {
                    saveDraft(draftKey, null)
                    goTo(date)
                  }
                })}
              />
            )}
          </div>
        )}
      </Card>

      <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-fg-2 uppercase">
        {t('recentUpdates')}
      </h2>
      {recent.state === 'loading' ? (
        <CardsSkeleton count={2} />
      ) : recent.state === 'error' ? (
        <Notice tone="bad">{t(recent.message)}</Notice>
      ) : recent.data.length ? (
        <div className="flex flex-col gap-3">
          {recent.data.map((s) => (
            <StatusCard
              key={s.id}
              status={s}
              comments={counts[s.id]}
              actions={
                // The selected date's cards above have their own Edit.
                s.date !== date &&
                canChange(s.date, profile.role) && (
                  <Button variant="ghost" onClick={() => goTo(s.date, s.id)}>
                    {t('edit')}
                  </Button>
                )
              }
            />
          ))}
        </div>
      ) : (
        <Notice>{t('nothingYet')}</Notice>
      )}
    </>
  )
}

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: Key }

type FormProps = {
  userId: string
  date: string
  row: DailyStatus | null
  first: boolean
  // Hours this day still has room for, not counting the update being changed.
  left: number
  onSaved: () => void
  onDiscard: () => void
  onCancel?: () => void
}

const SubmissionForm = ({
  userId,
  date,
  row,
  first,
  left,
  onSaved,
  onDiscard,
  onCancel
}: FormProps): React.JSX.Element => {
  const { t, locale, lang } = useT()
  const key = `draft:${userId}:${date}${row ? `:${row.id}` : ''}`
  const savedHours = String(row?.hours_logged ?? Math.max(0, Math.min(8, left)))
  const [draft] = useState(() => loadDraft(key))
  const [content, setContent] = useState<EditorChange>({ html: '', empty: true, edited: false })
  const [hours, setHours] = useState(draft?.hours ?? savedHours)
  const [save, setSave] = useState<Save>({ state: 'idle' })
  const dirty = content.edited || hours !== savedHours

  useEffect(() => {
    if (dirty) saveDraft(key, { html: content.html, hours })
  }, [dirty, key, content.html, hours])

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (content.empty) return setSave({ state: 'error', message: 'writeFirst' })
    if (Number(hours) > left) return setSave({ state: 'error', message: 'errHoursDay' })
    setSave({ state: 'saving' })
    try {
      const entry = { description: content.html, hours_logged: Number(hours) }
      await (row ? updateStatus(row.id, entry) : addStatus(userId, { ...entry, date }))
      saveDraft(key, null)
      onSaved()
    } catch (err) {
      setSave({ state: 'error', message: errMsg(err) })
    }
  }

  const discard = (): void => {
    saveDraft(key, null)
    onDiscard()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {(row || first) && (
          <Badge
            label={
              row ? t('submittedAt', { when: fmtStamp(row.updated_at, locale) }) : t('notSubmitted')
            }
            tone={row ? 'ok' : 'warn'}
          />
        )}
        {draft && (
          <>
            <Badge label={t('draftKept')} tone="info" />
            <button
              type="button"
              onClick={discard}
              className="text-xs text-fg-2 underline hover:text-fg"
            >
              {t('startOver')}
            </button>
          </>
        )}
      </div>

      {/* Not a <Field>: a <label> forwards clicks to its first button, so clicking the editor fired a chip. */}
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-fg-2">{t('whatDidYouDo')}</span>
        <DescriptionEditor
          initialHtml={draft?.html ?? row?.description ?? ''}
          onChange={setContent}
          loadPlan={() => loadPlanBefore(userId, date)}
          initialWriteLang={initialWriteLang(lang)}
          onWriteLangChange={saveWriteLang}
        />
      </div>

      <div className="w-48">
        <Field label={t('hoursWorked')}>
          <Input
            name="hours"
            type="number"
            required
            min={0}
            max={24}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
      </div>

      {save.state === 'error' && <Notice tone="bad">{t(save.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={save.state === 'saving'}>
          {t(row ? 'saveChanges' : 'submit')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={save.state === 'saving'}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}
