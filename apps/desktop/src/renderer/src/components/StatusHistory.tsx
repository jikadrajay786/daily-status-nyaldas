import { today } from '@daily-status/core/supabase'
import { History, SearchX } from 'lucide-react'
import { useCommentCounts } from '@daily-status/core/commentService'
import { useState } from 'react'
import { useBusy } from '@daily-status/core/useBusy'
import type { DailyStatus, Profile } from '@daily-status/core/database.types'
import { useT, type Key } from '@daily-status/core/i18n'
import { canChange, deleteStatus, listMyStatuses } from '@daily-status/core/statusService'
import { useDebounced } from '@daily-status/core/useDebounced'
import { usePaged } from '@daily-status/core/usePaged'
import { errMsg } from '@daily-status/core/useQuery'
import { CardsSkeleton } from './Skeletons'
import { StatusCard } from './StatusCard'
import { LoadMore, Button, Input, Notice, PageHeader, Empty } from './ui'

type Props = { profile: Profile; onEdit: (date: string, id?: string) => void }

export const StatusHistory = ({ profile, onEdit }: Props): React.JSX.Element => {
  const { t } = useT()
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [list, reload] = usePaged(`history:${profile.id}:${q}`, (limit, offset) =>
    listMyStatuses(profile.id, q, limit, offset)
  )
  const counts = useCommentCounts(
    'status',
    list.state === 'ok' ? list.data.rows.map((s) => s.id) : []
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
          subtitle: t(q ? 'matchCount' : 'totalCount', { n: list.data.total })
        })}
      >
        <div className="max-w-sm">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('historySearch')}
          />
        </div>
      </PageHeader>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">{t(error)}</Notice>
        </div>
      )}
      {list.state === 'loading' ? (
        <CardsSkeleton />
      ) : list.state === 'error' ? (
        <Notice tone="bad">{t(list.message)}</Notice>
      ) : list.data.rows.length ? (
        <div className="flex flex-col gap-3">
          {list.data.rows.map((s) => (
            <StatusCard
              key={s.id}
              status={s}
              comments={counts[s.id]}
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
                    <Button variant="ghost" onClick={() => onEdit(s.date, s.id)}>
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
          <LoadMore page={list.data} />
        </div>
      ) : (
        <Empty
          icon={q ? <SearchX className="size-7" /> : <History className="size-7" />}
          title={q ? t('noMatch', { q }) : t('noHistory')}
          hint={t(q ? 'noMatchHint' : 'noHistoryHint')}
          action={!q && <Button onClick={() => onEdit(today())}>{t('writeToday')}</Button>}
        />
      )}
    </>
  )
}
