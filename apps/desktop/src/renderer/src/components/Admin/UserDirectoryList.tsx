import { useState } from 'react'
import type { DirectoryEntry } from '@daily-status/core/adminService'
import { fmtShort, initials, nameOf, ROLE_KEY, ROLE_TONE } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import type { Query } from '@daily-status/core/useQuery'
import { PeopleSkeleton } from '../Skeletons'
import { Avatar, Badge, Card, Input, Notice } from '../ui'

type Props = {
  dir: Query<DirectoryEntry[]>
  selected: string | undefined
  onSelect: (id: string) => void
}

export const UserDirectoryList = ({ dir, selected, onSelect }: Props): React.JSX.Element => {
  const { t, locale } = useT()
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  // The team list is small and already loaded, so filtering in memory keeps typing instant.
  const people =
    dir.state === 'ok'
      ? dir.data.filter(
          (p) => !q || `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)
        )
      : []

  return (
    <Card className="flex-[1_1_17rem]">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('findPerson')}
        aria-label={t('findPerson')}
      />
      <div className="mt-3">
        {dir.state === 'loading' ? (
          <PeopleSkeleton />
        ) : dir.state === 'error' ? (
          <Notice tone="bad">{t(dir.message)}</Notice>
        ) : people.length ? (
          <ul className="-mx-2 flex max-h-[70vh] flex-col gap-1 overflow-y-auto p-1 [scrollbar-gutter:stable]">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  aria-current={p.id === selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                    p.id === selected ? 'bg-selected' : 'hover:bg-hover'
                  }`}
                >
                  <Avatar text={initials(p)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">{nameOf(p)}</span>
                      <Badge label={t(ROLE_KEY[p.role])} tone={ROLE_TONE[p.role]} />
                    </span>
                    <span className="block truncate text-xs text-fg-3">{p.email}</span>
                    <span className="block text-xs text-fg-2">
                      {p.lastDate
                        ? `${t('updatesCount', { n: p.submissions })} · ${t('lastUpdate', { date: fmtShort(p.lastDate, locale) })}`
                        : t('noUpdatesYet')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Notice>{t('noPeopleMatch', { q: search.trim() })}</Notice>
        )}
      </div>
    </Card>
  )
}
