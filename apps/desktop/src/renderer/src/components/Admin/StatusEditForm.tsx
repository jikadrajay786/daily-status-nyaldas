import { useState, type FormEvent } from 'react'
import type { DailyStatus } from '@daily-status/core/database.types'
import { fmtDate } from '@daily-status/core/format'
import { loadPlanBefore } from '@daily-status/core/richText'
import { sanitize } from '@daily-status/editor/sanitize'
import { initialWriteLang, saveWriteLang } from '../../lib/writeLang'
import { useT, type Key } from '@daily-status/core/i18n'
import { updateStatus } from '@daily-status/core/statusService'
import { errMsg } from '@daily-status/core/useQuery'
import { DescriptionEditor, type EditorChange } from '@daily-status/editor/DescriptionEditor'
import { Button, Card, Field, Input, Notice } from '../ui'

type Save = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: Key }

type Props = { status: DailyStatus; name: string; onSaved: () => void; onCancel: () => void }

// Admin correction of someone else's update. The date stays fixed, so it can't collide with another day.
export const StatusEditForm = ({ status, name, onSaved, onCancel }: Props): React.JSX.Element => {
  const { t, locale, lang } = useT()
  // Someone else's stored HTML, so it goes through the same sanitizer as every rendered card.
  const [initialHtml] = useState(() => sanitize(status.description))
  const [content, setContent] = useState<EditorChange>({
    html: initialHtml,
    empty: false,
    edited: false
  })
  const [hours, setHours] = useState(String(status.hours_logged))
  const [save, setSave] = useState<Save>({ state: 'idle' })

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (content.empty) return setSave({ state: 'error', message: 'writeFirst' })
    setSave({ state: 'saving' })
    try {
      await updateStatus(status.id, { description: content.html, hours_logged: Number(hours) })
      onSaved()
    } catch (err) {
      setSave({ state: 'error', message: errMsg(err) })
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <p className="text-sm font-medium text-fg">
          {t('editingFor', { name, date: fmtDate(status.date, locale) })}
        </p>
        {/* Not a <Field>: a <label> forwards clicks to its first button, which fired a chip. */}
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-fg-2">{t('whatDidYouDo')}</span>
          <DescriptionEditor
            initialHtml={initialHtml}
            onChange={setContent}
            loadPlan={() => loadPlanBefore(status.user_id, status.date)}
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
        <div className="flex gap-2">
          <Button type="submit" busy={save.state === 'saving'}>
            {t('saveChanges')}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={save.state === 'saving'}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
