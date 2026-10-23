import type { ReactNode } from 'react'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { fmtDate, fmtHours, nameOf } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { wasEdited } from '@daily-status/core/statusService'
import { RichText } from './Editor/RichText'
import { Badge } from './ui'

type Props = {
  status: DailyStatus
  author?: Pick<Profile, 'full_name' | 'email'> | null
  actions?: ReactNode
}

export const StatusCard = ({ status: s, author, actions }: Props): React.JSX.Element => {
  const { t, locale } = useT()
  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {author !== undefined && (
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-medium text-fg">{nameOf(author)}</p>
            <p className="truncate text-xs text-fg-3">{author?.email}</p>
          </div>
        )}
        <span className={`text-sm text-fg-2 ${author === undefined ? 'mr-auto' : ''}`}>
          {fmtDate(s.date, locale)}
        </span>
        {wasEdited(s) && (
          <span
            title={t('editedAt', {
              when: new Date(s.updated_at).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short'
              })
            })}
          >
            <Badge label={t('edited')} tone="idle" />
          </span>
        )}
        <Badge label={fmtHours(s.hours_logged, t)} tone="info" />
      </header>
      <RichText html={s.description} />
      {actions && <footer className="mt-3 flex justify-end gap-2">{actions}</footer>}
    </article>
  )
}
