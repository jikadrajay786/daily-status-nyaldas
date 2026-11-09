import type { LeaveBalance, LeaveType } from '@daily-status/core/database.types'
import { isLead, nameOf } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import {
  fmtLeaveDays,
  fmtLeaveSpan,
  fmtLeaveTimes,
  LEAVE_STATUS_KEY,
  LEAVE_STATUS_TONE,
  leaveRoom,
  leaveTypeName
} from '@daily-status/core/leave'
import type { TeamLeaveRequest } from '@daily-status/core/leaveService'
import { today } from '@daily-status/core/supabase'
import {
  useApprovedLeave,
  useCancelLeave,
  useLeaveDecision,
  useLeaveTypes,
  usePendingLeavePage,
  useTeamBalances
} from '@daily-status/core/useLeave'
import { addDays } from '@daily-status/core/workdays'
import { Redirect } from 'expo-router'
import { CalendarCheck } from 'lucide-react-native'
import { useState } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { CardsSkeleton } from '@/components/StatusCard'
import { Badge, Button, Card, Empty, Field, LoadMore, Notice, Screen } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'

const CheckIcon = withUniwind(CalendarCheck)
const SECTION = 'text-[13px] font-semibold uppercase tracking-[0.8px] text-fg-2'
const AWAY_DAYS = 60

const Summary = ({
  request: r,
  type
}: {
  request: TeamLeaveRequest
  type: LeaveType | undefined
}): React.JSX.Element => {
  const { t, lang, locale } = useT()
  return (
    <VStack className="gap-1">
      <HStack className="flex-wrap items-center justify-between gap-2">
        <Text className="shrink font-semibold text-fg">{r.person ? nameOf(r.person) : ''}</Text>
        <Badge label={t(LEAVE_STATUS_KEY[r.status])} tone={LEAVE_STATUS_TONE[r.status]} />
      </HStack>
      <Text className="text-[15px] text-fg">{fmtLeaveSpan(r, t, locale)}</Text>
      <Text className="text-[14px] text-fg-2">
        {type && `${leaveTypeName(type, lang)} · `}
        {fmtLeaveDays(+r.days, t)}
      </Text>
      <Text className="mt-2 text-[15px] text-fg-2">{r.reason}</Text>
      <Text className="text-[13px] text-fg-3">{fmtLeaveTimes(r, t, locale)}</Text>
    </VStack>
  )
}

const WaitingCard = ({
  request: r,
  type,
  balances,
  onDone
}: {
  request: TeamLeaveRequest
  type: LeaveType | undefined
  balances: LeaveBalance[]
  onDone: (done: Key) => void
}): React.JSX.Element => {
  const { t } = useT()
  const d = useLeaveDecision(r.id, (c) =>
    onDone(c === 'approve' ? 'leaveApproved' : 'leaveRejected')
  )
  const room = leaveRoom(r, type, balances)
  const over = room !== null && +r.days > room
  return (
    <Card>
      <Summary request={r} type={type} />
      {over ? (
        <Notice tone="warn">{t('leaveReviewOver', { days: fmtLeaveDays(room, t) })}</Notice>
      ) : (
        room !== null && (
          <Text className="text-[13px] text-fg-3">
            {t('leaveReviewLeft', { days: fmtLeaveDays(room, t) })}
          </Text>
        )
      )}
      {d.error && <Notice tone="bad">{t(d.error)}</Notice>}
      {/* In-app confirm: the system Alert's buttons would follow the phone's language, not the app's. */}
      {d.choice ? (
        <VStack className="gap-3">
          <Text className="text-[15px] font-medium text-fg">
            {t(d.choice === 'approve' ? 'leaveConfirmApprove' : 'leaveConfirmReject')}
          </Text>
          <Field
            label={t('leaveNoteOptional')}
            value={d.note}
            onChangeText={d.setNote}
            maxLength={300}
            multiline
          />
          <Button
            variant={d.choice === 'approve' ? 'primary' : 'danger'}
            busy={d.busy}
            onPress={() => void d.confirm()}
          >
            {t(d.choice === 'approve' ? 'leaveYesApprove' : 'leaveYesReject')}
          </Button>
          <Button variant="ghost" onPress={() => d.choose(null)}>
            {t('cancel')}
          </Button>
        </VStack>
      ) : (
        <VStack className="gap-2">
          <Button disabled={over} onPress={() => d.choose('approve')}>
            {t('leaveApprove')}
          </Button>
          <Button variant="ghost" onPress={() => d.choose('reject')}>
            {t('leaveReject')}
          </Button>
        </VStack>
      )}
    </Card>
  )
}

const AwayCard = ({
  request: r,
  type,
  onDone
}: {
  request: TeamLeaveRequest
  type: LeaveType | undefined
  onDone: (done: Key) => void
}): React.JSX.Element => {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const cancel = useCancelLeave()
  const yes = async (): Promise<void> => {
    if (await cancel.run({ id: r.id })) onDone('leaveCancelled')
  }
  return (
    <Card>
      <Summary request={r} type={type} />
      {cancel.error && <Notice tone="bad">{t(cancel.error)}</Notice>}
      {confirming ? (
        <VStack className="gap-2">
          <Text className="text-[14px] text-fg-2">{t('leaveReviewConfirmCancel')}</Text>
          <Button variant="danger" busy={cancel.busy} onPress={() => void yes()}>
            {t('leaveConfirmYes')}
          </Button>
          <Button variant="ghost" onPress={() => setConfirming(false)}>
            {t('leaveKeep')}
          </Button>
        </VStack>
      ) : (
        <Button variant="ghost" onPress={() => setConfirming(true)}>
          {t('leaveCancel')}
        </Button>
      )}
    </Card>
  )
}

export default function LeaveRequests(): React.JSX.Element {
  const { t } = useT()
  const { id, role } = useProfile()
  const now = today()
  const [pending, reload, refreshing] = usePendingLeavePage(id)
  const [away] = useApprovedLeave(now, addDays(now, AWAY_DAYS), id)
  const [types] = useLeaveTypes()
  const [balances] = useTeamBalances()
  const [done, setDone] = useState<Key>()
  const pull = usePullToRefresh(pending.state === 'loading' || refreshing, reload)
  if (role !== 'admin' && !isLead(role)) return <Redirect href="/" />
  const all = types.state === 'ok' ? types.data : []
  const typeOf = (r: TeamLeaveRequest): LeaveType | undefined => all.find((x) => x.id === r.type_id)
  return (
    <Screen
      underHeader
      refreshControl={<RefreshControl {...pull} />}
      header={<Text className="text-[15px] text-fg-2">{t('leaveReviewSubtitle')}</Text>}
    >
      {done && <Notice tone="ok">{t(done)}</Notice>}
      <Text accessibilityRole="header" className={SECTION}>
        {t('leaveWaiting')}
      </Text>
      {pending.state === 'loading' ? (
        <CardsSkeleton />
      ) : pending.state === 'error' ? (
        <VStack className="gap-3">
          <Notice tone="bad">{t(pending.message)}</Notice>
          <Button variant="ghost" onPress={reload}>
            {t('tryAgain')}
          </Button>
        </VStack>
      ) : pending.data.rows.length ? (
        <>
          {pending.data.rows.map((r) => (
            <WaitingCard
              key={r.id}
              request={r}
              type={typeOf(r)}
              balances={balances.state === 'ok' ? balances.data : []}
              onDone={setDone}
            />
          ))}
          <LoadMore page={pending.data} />
        </>
      ) : (
        <Empty
          icon={<CheckIcon colorClassName="accent-accent-fg" size={28} />}
          title={t('leaveReviewEmpty')}
          hint={t('leaveReviewEmptyHint')}
        />
      )}
      <Text accessibilityRole="header" className={SECTION}>
        {t('leaveAwaySoon')}
      </Text>
      {away.state === 'loading' ? (
        <CardsSkeleton />
      ) : away.state === 'error' ? (
        <Notice tone="bad">{t(away.message)}</Notice>
      ) : away.data.length ? (
        away.data.map((r) => <AwayCard key={r.id} request={r} type={typeOf(r)} onDone={setDone} />)
      ) : (
        <Text className="text-[15px] text-fg-2">{t('leaveAwayEmpty')}</Text>
      )}
    </Screen>
  )
}
