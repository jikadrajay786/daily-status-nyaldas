import { useState } from 'react'
import { fmtDate } from '@daily-status/core/format'
import { useT } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { TeamFeed, type FeedFilters } from './Admin/TeamFeed'
import { UserWiseStatusView } from './Admin/UserWiseStatusView'
import { Button, PageHeader, Tabs } from './ui'

type Tab = 'feed' | 'people'

// Filters and the selected person live here, so switching tabs doesn't reset them.
export const AdminDashboard = (): React.JSX.Element => {
  const { t, locale } = useT()
  const [tab, setTab] = useState<Tab>('feed')
  const [f, setF] = useState<FeedFilters>({ date: today(), userId: '', search: '' })
  const [person, setPerson] = useState<string>()
  const [nonce, setNonce] = useState(0)
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
      />
      <Tabs
        label={t('navTeam')}
        tabs={[
          ['feed', t('tabFeed')],
          ['people', t('tabPeople')]
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === 'feed' ? (
          <TeamFeed
            f={f}
            onFilter={(p) => setF((prev) => ({ ...prev, ...p }))}
            dayLabel={dayLabel}
            nonce={nonce}
            onOpenPerson={(id) => {
              setPerson(id)
              setTab('people')
            }}
          />
        ) : (
          <UserWiseStatusView selected={person} onSelect={setPerson} nonce={nonce} />
        )}
      </Tabs>
    </>
  )
}
