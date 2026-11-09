import { useState } from 'react'
import { getUserDirectoryWithStats } from '@daily-status/core/adminService'
import type { Profile } from '@daily-status/core/database.types'
import { isLead } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { useLiveQuery } from '@daily-status/core/live'
import { Notice } from '../ui'
import { UserDirectoryList } from './UserDirectoryList'
import { UserHistoryDetail } from './UserHistoryDetail'

type Props = {
  selected: string | undefined
  onSelect: (id: string) => void
  nonce: number
  slot: HTMLElement | null
  me: Pick<Profile, 'id' | 'role'>
}

export const UserWiseStatusView = ({
  selected,
  onSelect,
  nonce,
  me,
  slot
}: Props): React.JSX.Element => {
  const { t } = useT()
  // Bumped after an admin edit or delete, so the directory counts and the detail refetch together.
  const [changes, setChanges] = useState(0)
  const version = `${nonce}:${changes}`
  const [dir] = useLiveQuery(`directory:${version}`, getUserDirectoryWithStats)
  const person = dir.state === 'ok' ? dir.data.find((p) => p.id === selected) : undefined

  return (
    // Same reflow as the feed: side by side at normal sizes, stacked once text gets large.
    <div className="flex flex-wrap items-start gap-6">
      <UserDirectoryList dir={dir} selected={selected} onSelect={onSelect} />
      <section className="min-w-0 flex-[999_1_30rem]">
        {person ? (
          <UserHistoryDetail
            slot={slot}
            key={person.id}
            person={person}
            me={me}
            leads={dir.state === 'ok' ? dir.data.filter((p) => isLead(p.role)) : []}
            version={version}
            onChanged={() => setChanges((n) => n + 1)}
          />
        ) : (
          dir.state === 'ok' && <Notice>{t('pickPerson')}</Notice>
        )}
      </section>
    </div>
  )
}
