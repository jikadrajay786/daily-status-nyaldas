import type { LeaveBalance, LeaveType, Profile } from '@daily-status/core/database.types'
import { nameOf } from '@daily-status/core/format'
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
  usePendingLeave,
  useTeamBalances
} from '@daily-status/core/useLeave'
import { addDays } from '@daily-status/core/workdays'
import { CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import { CardsSkeleton } from '../Skeletons'
import { Badge, Button, Card, Empty, Field, Notice, PageHeader, TextArea } from '../ui'

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
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-fg">{r.person ? nameOf(r.person) : ''}</h3>
        <Badge label={t(LEAVE_STATUS_KEY[r.status])} tone={LEAVE_STATUS_TONE[r.status]} />
      </div>
      <p className="mt-1 text-sm text-fg">{fmtLeaveSpan(r, t, locale)}</p>
      <p className="text-sm text-fg-2">
        {type && `${leaveTypeName(type, lang)} · `}
        {fmtLeaveDays(+r.days, t)}
      </p>
      <p className="mt-3 text-sm whitespace-pre-line text-fg-2">{r.reason}</p>
      <p className="mt-2 text-xs text-fg-3">{fmtLeaveTimes(r, t, locale)}</p>
    </>
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
        <div className="mt-3">
          <Notice tone="warn">{t('leaveReviewOver', { days: fmtLeaveDays(room, t) })}</Notice>
        </div>
      ) : (
        room !== null && (
          <p className="mt-2 text-xs text-fg-3">
            {t('leaveReviewLeft', { days: fmtLeaveDays(room, t) })}
          </p>
        )
      )}
      {d.error && (
        <div className="mt-3">
          <Notice tone="bad">{t(d.error)}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        {/* In-app confirm: window.confirm's OK/Cancel buttons stay in the OS language. */}
        {d.choice ? (
          <>
            <p className="text-sm font-medium text-fg">
              {t(d.choice === 'approve' ? 'leaveConfirmApprove' : 'leaveConfirmReject')}
            </p>
            <Field label={t('leaveNoteOptional')}>
              <TextArea
                rows={2}
                maxLength={300}
                value={d.note}
                onChange={(e) => d.setNote(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={d.choice === 'approve' ? 'primary' : 'danger'}
                busy={d.busy}
                onClick={() => void d.confirm()}
              >
                {t(d.choice === 'approve' ? 'leaveYesApprove' : 'leaveYesReject')}
              </Button>
              <Button variant="ghost" onClick={() => d.choose(null)}>
                {t('cancel')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={over} onClick={() => d.choose('approve')}>
              {t('leaveApprove')}
            </Button>
            <Button variant="ghost" onClick={() => d.choose('reject')}>
              {t('leaveReject')}
            </Button>
          </div>
        )}
      </div>
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
      {cancel.error && (
        <div className="mt-3">
          <Notice tone="bad">{t(cancel.error)}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {confirming ? (
          <>
            <span className="text-sm text-fg-2">{t('leaveReviewConfirmCancel')}</span>
            <Button variant="danger" busy={cancel.busy} onClick={() => void yes()}>
              {t('leaveConfirmYes')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('leaveKeep')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {t('leaveCancel')}
          </Button>
        )}
      </div>
    </Card>
  )
}

export const LeaveRequests = ({ me }: { me: Pick<Profile, 'id'> }): React.JSX.Element => {
  const { t } = useT()
  const now = today()
  const [pending, reload] = usePendingLeave(me.id)
  const [away] = useApprovedLeave(now, addDays(now, AWAY_DAYS), me.id)
  const [types] = useLeaveTypes()
  const [balances] = useTeamBalances()
  const [done, setDone] = useState<Key>()
  const all = types.state === 'ok' ? types.data : []
  const typeOf = (r: TeamLeaveRequest): LeaveType | undefined => all.find((x) => x.id === r.type_id)
  return (
    <>
      <PageHeader title={t('navLeaveRequests')} subtitle={t('leaveReviewSubtitle')} />
      {done && (
        <div className="mb-4">
          <Notice tone="ok">{t(done)}</Notice>
        </div>
      )}
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-fg-2 uppercase">
        {t('leaveWaiting')}
      </h2>
      {pending.state === 'loading' ? (
        <CardsSkeleton />
      ) : pending.state === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{t(pending.message)}</Notice>
          <Button variant="ghost" onClick={reload}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : pending.data.length ? (
        <ul className="flex flex-col gap-3">
          {pending.data.map((r) => (
            <li key={r.id}>
              <WaitingCard
                request={r}
                type={typeOf(r)}
                balances={balances.state === 'ok' ? balances.data : []}
                onDone={setDone}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={<CalendarCheck className="size-7" />}
          title={t('leaveReviewEmpty')}
          hint={t('leaveReviewEmptyHint')}
        />
      )}
      <h2 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-fg-2 uppercase">
        {t('leaveAwaySoon')}
      </h2>
      {away.state === 'loading' ? (
        <CardsSkeleton />
      ) : away.state === 'error' ? (
        <Notice tone="bad">{t(away.message)}</Notice>
      ) : away.data.length ? (
        <ul className="flex flex-col gap-3">
          {away.data.map((r) => (
            <li key={r.id}>
              <AwayCard request={r} type={typeOf(r)} onDone={setDone} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-2">{t('leaveAwayEmpty')}</p>
      )}
    </>
  )
}
