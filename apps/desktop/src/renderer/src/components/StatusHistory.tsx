import { useState } from 'react'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { deleteStatus, listMyStatuses } from '@daily-status/core/statusService'
import { useDebounced } from '@daily-status/core/useDebounced'
import { errMsg, useQuery } from '@daily-status/core/useQuery'
import { CardsSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { Button, Input, Notice, PageHeader } from './ui'

type Props = { profile: Profile; onEdit: (date: string) => void }

export const StatusHistory = ({ profile, onEdit }: Props): React.JSX.Element => {
  const { t } = useT()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, reload] = useQuery(`history:${profile.id}:${q}`, () => listMyStatuses(profile.id, q))
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<Key>()

  const remove = async (s: DailyStatus): Promise<void> => {
    try {
      await deleteStatus(s.id)
      setError(undefined)
      reload()
    } catch (err) {
      setError(errMsg(err))
    }
  }

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
                confirming === s.id ? (
                  <>
                    <span className="mr-auto self-center text-sm text-bad-fg">
                      {t('confirmDelete')}
                    </span>
                    <Button variant="ghost" onClick={() => setConfirming(undefined)}>
                      {t('cancel')}
                    </Button>
                    <Button variant="danger" onClick={() => remove(s)}>
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
