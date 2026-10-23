import { useState } from 'react'
import { useBusy } from '@daily-status/core/useBusy'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { canChange, deleteStatus, listMyStatuses } from '@daily-status/core/statusService'
import { useDebounced } from '@daily-status/core/useDebounced'
import { useLiveQuery } from '@daily-status/core/live'
import { errMsg } from '@daily-status/core/useQuery'
import { CardsSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { Button, Input, Notice, PageHeader } from './ui'

type Props = { profile: Profile; onEdit: (date: string) => void }

export const StatusHistory = ({ profile, onEdit }: Props): React.JSX.Element => {
  const { t } = useT()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, reload] = useLiveQuery(`history:${profile.id}:${q}`, () =>
    listMyStatuses(profile.id, q)
  )
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()

  const [deleting, runDelete] = useBusy()
  const remove = (s: DailyStatus): Promise<void> =>
    runDelete(async () => {
      try {
        await deleteStatus(s.id)
        setError(undefined)
        reload()
      } catch (err) {
        setError(errMsg(err))
      }
    })

  return (
    <>
      <PageHeader
        title={t('navHistory')}
        {...(list.state === 'ok' && {
          subtitle: t(q ? 'matchCount' : 'totalCount', { n: list.data.length })
        })}
      />
      <div className="mb-5 max-w-sm">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('historySearch')}
        />
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">{t(error)}</Notice>
        </div>
      )}
      {list.state === 'loading' ? (
        <CardsSkeleton />
      ) : list.state === 'error' ? (
        <Notice tone="bad">{t(list.message)}</Notice>
      ) : list.data.length ? (
        <div className="flex flex-col gap-3">
          {list.data.map((s) => (
            <StatusCard
              key={s.id}
              status={s}
              actions={
                // In-app confirm: window.confirm's OK/Cancel buttons stay in the OS language.
                !canChange(s.date, profile.role) ? (
                  <span title={t('statusLocked')} className="text-xs text-fg-3">
                    {t('lockedShort')}
                  </span>
                ) : confirming === s.id ? (
                  <>
                    <span className="mr-auto self-center text-sm text-bad-fg">
                      {t('confirmDelete')}
                    </span>
                    <Button variant="ghost" onClick={() => setConfirming(undefined)}>
                      {t('cancel')}
                    </Button>
                    <Button variant="danger" busy={deleting} onClick={() => remove(s)}>
                      {t('yesDelete')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => onEdit(s.date)}>
                      {t('edit')}
                    </Button>
                    <Button variant="danger" onClick={() => setConfirming(s.id)}>
                      {t('delete')}
                    </Button>
                  </>
                )
              }
            />
          ))}
        </div>
      ) : (
        <Notice>{q ? t('noMatch', { q }) : t('noHistory')}</Notice>
      )}
    </>
  )
}
