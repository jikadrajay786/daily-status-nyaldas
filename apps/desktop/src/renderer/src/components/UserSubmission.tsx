import { useEffect, useState, type FormEvent } from 'react'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { loadPlanBefore } from '@daily-status/core/richText'
import { loadDraft, saveDraft } from '../lib/drafts'
import { initialWriteLang, saveWriteLang } from '../lib/writeLang'
import { getMyStatus, listMyStatuses, saveStatus } from '@daily-status/core/statusService'
import { today } from '@daily-status/core/supabase'
import { errMsg, useQuery } from '@daily-status/core/useQuery'
import { DescriptionEditor, type EditorChange } from '@daily-status/editor/DescriptionEditor'
import { CardsSkeleton, FormSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { Badge, Button, Card, Field, Input, Notice, PageHeader } from './ui'

type Props = { profile: Profile; date: string; onDateChange: (d: string) => void }

export const UserSubmission = ({ profile, date, onDateChange }: Props): React.JSX.Element => {
  const { t } = useT()
  const [row, reloadRow] = useQuery(`mine:${profile.id}:${date}`, () =>
    getMyStatus(profile.id, date)
  )
  const [recent, reloadRecent] = useQuery(`recent:${profile.id}`, () =>
    listMyStatuses(profile.id, '', 5)
  )
  const [resets, setResets] = useState(0)

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
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
            />
          </Field>
        </div>
        {row.state === 'loading' ? (
          <FormSkeleton />
        ) : row.state === 'error' ? (
          <Notice tone="bad">{t(row.message)}</Notice>
        ) : (
          // Keyed so switching dates, saving or discarding a draft remounts the form with fresh values.
          <SubmissionForm
            key={`${date}:${row.data?.updated_at ?? 'new'}:${resets}`}
            userId={profile.id}
            date={date}
            row={row.data}
            onSaved={() => {
              reloadRow()
              reloadRecent()
            }}
            onDiscard={() => setResets((n) => n + 1)}
          />
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
              actions={
                s.date !== date && (
                  <Button variant="ghost" onClick={() => onDateChange(s.date)}>
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
  onSaved: () => void
  onDiscard: () => void
}

const SubmissionForm = ({
  userId,
  date,
  row,
  onSaved,
  onDiscard
}: FormProps): React.JSX.Element => {
  const { t, locale, lang } = useT()
  const key = `draft:${userId}:${date}`
  const savedHours = String(row?.hours_logged ?? 8)
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
    setSave({ state: 'saving' })
    try {
      await saveStatus(userId, { date, description: content.html, hours_logged: Number(hours) })
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
        <Badge
          label={
            row
              ? t('submittedAt', {
                  when: new Date(row.updated_at).toLocaleString(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })
                })
              : t('notSubmitted')
          }
          tone={row ? 'ok' : 'warn'}
        />
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
      <div>
        <Button type="submit" disabled={save.state === 'saving'}>
          {save.state === 'saving' ? t('saving') : t(row ? 'saveChanges' : 'submit')}
        </Button>
      </div>
    </form>
  )
}
