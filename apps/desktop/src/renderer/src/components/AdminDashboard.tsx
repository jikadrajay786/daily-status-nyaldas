import type { Profile } from '@daily-status/core/database.types'
import { useId, useState } from 'react'
import { fmtDate } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { TeamFeed, type FeedFilters } from './Admin/TeamFeed'
import { SignupRequests } from './Admin/SignupRequests'
import { UserWiseStatusView } from './Admin/UserWiseStatusView'
import { Button, PageHeader, TabBar } from './ui'

type Tab = 'feed' | 'people'

// Filters and the selected person live here, so switching tabs doesn't reset them.
export const AdminDashboard = ({
  me,
  open
}: {
  me: Pick<Profile, 'id' | 'role'>
  // A person to show straight away, from Home.
  open?: string | undefined
}): React.JSX.Element => {
  const { t, locale } = useT()
  const [tab, setTab] = useState<Tab>(open ? 'people' : 'feed')
  const [f, setF] = useState<FeedFilters>({ date: today(), userId: '', search: '' })
  const [person, setPerson] = useState(open)
  const [nonce, setNonce] = useState(0)
  const id = useId()
  // Each tab fills this with its own filters, in the pinned header.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const day = f.date || today()
  const dayLabel = day === today() ? t('today') : fmtDate(day, locale)

  return (
    <>
      <PageHeader
        title={t('navTeam')}
        subtitle={tab === 'feed' ? t('teamSubtitle', { day: dayLabel }) : t('peopleSubtitle')}
        action={
          <Button variant="ghost" onClick={() => setNonce((n) => n + 1)}>
            {t('refresh')}
          </Button>
        }
      >
        <TabBar
          id={id}
          label={t('navTeam')}
          tabs={[
            ['feed', t('tabFeed')],
            ['people', t('tabPeople')]
          ]}
          value={tab}
          onChange={setTab}
        />
        <div ref={setSlot} className="empty:hidden" />
      </PageHeader>
      {/* Above both tabs: the Team page opens on the feed, and a new person shouldn't wait on a tab switch. */}
      {me.role === 'admin' && <SignupRequests />}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'feed' ? (
          <TeamFeed
            f={f}
            onFilter={(p) => setF((prev) => ({ ...prev, ...p }))}
            dayLabel={dayLabel}
            nonce={nonce}
            slot={slot}
            onOpenPerson={(id) => {
              setPerson(id)
              setTab('people')
            }}
          />
        ) : (
          <UserWiseStatusView
            selected={person}
            onSelect={setPerson}
            nonce={nonce}
            me={me}
            slot={slot}
          />
        )}
      </div>
    </>
  )
}
