import type { LeaveRequest, LeaveType } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import {
  canCancelLeave,
  fmtLeaveDays,
  fmtLeaveSpan,
  fmtLeaveTimes,
  LEAVE_STATUS_KEY,
  LEAVE_STATUS_TONE,
  leaveBalance,
  leaveNotSetUp,
  leaveStat,
  leaveTypeName
} from '@daily-status/core/leave'
import { today } from '@daily-status/core/supabase'
import {
  useCancelLeave,
  useLeaveBalances,
  useLeaveRequests,
  useLeaveTypes
} from '@daily-status/core/useLeave'
import { Redirect, router } from 'expo-router'
import { CalendarOff } from 'lucide-react-native'
import { useState } from 'react'
import { RefreshControl } from 'react-native'
import { withUniwind } from 'uniwind'
import { HStack } from '@/components/gs/hstack'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { CardsSkeleton } from '@/components/StatusCard'
import { ListScreen, Badge, Button, Card, Empty, Notice, Stat } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { usePullToRefresh } from '@/lib/refresh'

const LeaveIcon = withUniwind(CalendarOff)
const RequestCard = ({
  request: r,
  type
}: {
  request: LeaveRequest
  type: LeaveType | undefined
}): React.JSX.Element => {
  const { t, lang, locale } = useT()
  const [confirming, setConfirming] = useState(false)
  const cancel = useCancelLeave()
  const pending = r.status === 'pending'
  return (
    <Card>
      <VStack className="gap-2">
        <Text className="font-semibold text-fg">{fmtLeaveSpan(r, t, locale)}</Text>
        <HStack className="flex-wrap items-center gap-2">
          <Badge label={t(LEAVE_STATUS_KEY[r.status])} tone={LEAVE_STATUS_TONE[r.status]} />
          <Text className="text-[14px] text-fg-2">
            {type && `${leaveTypeName(type, lang)} · `}
            {fmtLeaveDays(+r.days, t)}
          </Text>
        </HStack>
        <Text className="text-[15px] text-fg-2">{r.reason}</Text>
        {r.decision_note && (
          <Text className="text-[14px] text-fg-2">
            {t('leaveAdminNote', { note: r.decision_note })}
          </Text>
        )}
        <Text className="text-[13px] text-fg-3">{fmtLeaveTimes(r, t, locale)}</Text>
        {cancel.error && <Notice tone="bad">{t(cancel.error)}</Notice>}
        {canCancelLeave(r, today()) ? (
          // In-app confirm: the system Alert's buttons would follow the phone's language, not the app's.
          confirming ? (
            <VStack className="gap-2">
              <Text className="text-[14px] text-fg-2">
                {t(pending ? 'leaveConfirmWithdraw' : 'leaveConfirmCancel')}
              </Text>
              <Button
                variant="danger"
                busy={cancel.busy}
                onPress={() => void cancel.run({ id: r.id })}
              >
                {t('leaveConfirmYes')}
              </Button>
              <Button variant="ghost" onPress={() => setConfirming(false)}>
                {t('leaveKeep')}
              </Button>
            </VStack>
          ) : (
            <Button variant="ghost" onPress={() => setConfirming(true)}>
              {t(pending ? 'leaveWithdraw' : 'leaveCancel')}
            </Button>
          )
        ) : (
          r.status === 'approved' && (
            <Text className="text-[13px] text-fg-3">{t('leaveStartedNote')}</Text>
          )
        )}
      </VStack>
    </Card>
  )
}

export default function MyLeave(): React.JSX.Element {
  const { t, lang } = useT()
  const { id, role } = useProfile()
  const [types] = useLeaveTypes()
  const [balances] = useLeaveBalances(id)
  const [requests, reload] = useLeaveRequests(id)
  const pull = usePullToRefresh(requests.state === 'loading', reload)
  if (role === 'admin') return <Redirect href="/" />
  const all = types.state === 'ok' ? types.data : []
  const shown = all.filter((x) => x.active)
  const rows = balances.state === 'ok' ? balances.data : []
  const empty = balances.state === 'ok' && types.state === 'ok' && leaveNotSetUp(shown, rows)
  return (
    <ListScreen
      underHeader
      header={<Text className="text-[15px] text-fg-2">{t('leaveSubtitle')}</Text>}
      data={requests.state === 'ok' ? requests.data : []}
      keyExtractor={(r) => r.id}
      contentContainerClassName="gap-4 p-6"
      refreshControl={<RefreshControl {...pull} tintColorClassName="accent-accent" />}
      ListHeaderComponent={
        <VStack className="gap-4">
          <HStack className="flex-wrap gap-3">
            {shown.map((x) => (
              <Stat
                key={x.id}
                label={leaveTypeName(x, lang)}
                loading={balances.state === 'loading'}
                {...leaveStat(x, leaveBalance(rows, x.id), t)}
              />
            ))}
          </HStack>
          {types.state === 'error' && <Notice tone="bad">{t(types.message)}</Notice>}
          {balances.state === 'error' && <Notice tone="bad">{t(balances.message)}</Notice>}
          {empty && <Notice tone="info">{t('leaveNoBalanceYet')}</Notice>}
          <Button onPress={() => router.push('/leave/new')}>{t('leaveAsk')}</Button>
          <Text className="text-[13px] font-semibold text-fg-2">{t('leaveRequests')}</Text>
        </VStack>
      }
      ListEmptyComponent={
        requests.state === 'loading' ? (
          <CardsSkeleton />
        ) : requests.state === 'error' ? (
          <VStack className="gap-3">
            <Notice tone="bad">{t(requests.message)}</Notice>
            <Button variant="ghost" onPress={reload}>
              {t('tryAgain')}
            </Button>
          </VStack>
        ) : (
          <Empty
            icon={<LeaveIcon colorClassName="accent-accent-fg" size={28} />}
            title={t('leaveEmpty')}
            hint={t('leaveEmptyHint')}
          />
        )
      }
      renderItem={({ item }) => (
        <RequestCard request={item} type={all.find((x) => x.id === item.type_id)} />
      )}
    />
  )
}
