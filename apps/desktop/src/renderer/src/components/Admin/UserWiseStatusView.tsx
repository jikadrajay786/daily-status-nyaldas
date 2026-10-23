import { useState } from 'react'
import { getUserDirectoryWithStats } from '@daily-status/core/adminService'
import { useT } from '@daily-status/core/i18n'
import { useQuery } from '@daily-status/core/useQuery'
import { Notice } from '../ui'
import { UserDirectoryList } from './UserDirectoryList'
import { UserHistoryDetail } from './UserHistoryDetail'

type Props = { selected: string | undefined; onSelect: (id: string) => void; nonce: number }

export const UserWiseStatusView = ({ selected, onSelect, nonce }: Props): React.JSX.Element => {
  const { t } = useT()
  // Bumped after an admin edit or delete, so the directory counts and the detail refetch together.
  const [changes, setChanges] = useState(0)
  const version = `${nonce}:${changes}`
  const [dir] = useQuery(`directory:${version}`, getUserDirectoryWithStats)
  const person = dir.state === 'ok' ? dir.data.find((p) => p.id === selected) : undefined

  return (
    // Same reflow as the feed: side by side at normal sizes, stacked once text gets large.
    <div className="flex flex-wrap items-start gap-6">
      <UserDirectoryList dir={dir} selected={selected} onSelect={onSelect} />
      <section className="min-w-0 flex-[999_1_30rem]">
        {person ? (
          <UserHistoryDetail
            key={person.id}
            person={person}
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
