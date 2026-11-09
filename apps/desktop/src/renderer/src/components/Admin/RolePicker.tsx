import { useId } from 'react'
import type { DirectoryEntry } from '@daily-status/core/adminService'
import { isLead, nameOf, ROLE_EFFECT, ROLE_KEY, ROLES } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useReportsTo, useRoleChange } from '@daily-status/core/useRoleChange'
import { Button, Field, Notice, Select } from '../ui'

type Props = { person: DirectoryEntry; me: string; leads: DirectoryEntry[] }

const ReportsTo = ({ person, leads }: Omit<Props, 'me'>): React.JSX.Element => {
  const { t } = useT()
  const { saved, error, busy, pick } = useReportsTo(person)
  return (
    <div className="flex flex-col gap-2">
      {leads.length ? (
        <div className="max-w-xs">
          <Field label={t('reportsTo')}>
            <Select
              value={person.reports_to ?? ''}
              disabled={busy}
              onChange={(e) => void pick(e.target.value || null)}
            >
              <option value="">{t('reportsNobody')}</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${nameOf(l)} (${t(ROLE_KEY[l.role])})`}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-fg-2">{t('reportsNoLeads')}</p>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
      {saved && <Notice tone="ok">{t('reportsChanged')}</Notice>}
    </div>
  )
}

export const RolePicker = ({ person, me, leads }: Props): React.JSX.Element => {
  const { t } = useT()
  const labelId = useId()
  const { next, saved, error, busy, pick, confirm } = useRoleChange(person)
  if (person.id === me)
    return <p className="mt-4 border-t border-line pt-4 text-sm text-fg-2">{t('roleOwnHint')}</p>
  const shown = next ?? person.role

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span id={labelId} className="font-medium text-fg-2">
          {t('roleLabel')}
        </span>
        <div
          role="group"
          aria-labelledby={labelId}
          className="flex flex-wrap gap-0.5 rounded-lg p-0.5 ring-1 ring-line"
        >
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={shown === r}
              onClick={() => pick(r)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                shown === r ? 'bg-selected text-fg' : 'text-fg-2 hover:text-fg'
              }`}
            >
              {t(ROLE_KEY[r])}
            </button>
          ))}
        </div>
      </div>
      {next && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg">
            {t('roleConfirm', { name: nameOf(person), role: t(ROLE_KEY[next]) })}
          </p>
          <p className="text-sm text-fg-2">{t(ROLE_EFFECT[next])}</p>
          {isLead(person.role) && <p className="text-sm text-fg-2">{t('roleEffectUnlink')}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => pick(person.role)}>
              {t('cancel')}
            </Button>
            <Button busy={busy} onClick={() => void confirm()}>
              {t('roleYes')}
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="bad">{t(error)}</Notice>}
      {saved && <Notice tone="ok">{t('roleChanged')}</Notice>}
      {person.role === 'user' && !next && <ReportsTo person={person} leads={leads} />}
    </div>
  )
}
