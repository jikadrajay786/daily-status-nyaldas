import type { LeaveRequest, LeaveType, Profile } from '@daily-status/core/database.types'
import { useT } from '@daily-status/core/i18n'
import {
  canCancelLeave,
  earliestLeaveDay,
  fmtLeaveDays,
  fmtLeaveSpan,
  fmtLeaveTimes,
  LEAVE_HALF_KEY,
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
  useLeaveForm,
  useLeaveRequests,
  useLeaveTypes
} from '@daily-status/core/useLeave'
import { CalendarOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { CardsSkeleton, FormSkeleton } from '../Skeletons'
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Stat,
  TextArea
} from '../ui'

const Choice = <V extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: readonly (readonly [V, string])[]
  value: V
  onChange: (v: V) => void
}): React.JSX.Element => (
  <div role="group" aria-label={label} className="flex flex-col gap-1.5 text-sm">
    <span className="font-medium text-fg-2">{label}</span>
    <div className="flex flex-wrap gap-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-2 transition-colors ${
            value === v
              ? 'border-accent-fg font-medium text-fg ring-1 ring-accent-fg/40'
              : 'border-line text-fg-2 hover:bg-hover'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  </div>
)

const Balances = ({ userId, types }: { userId: string; types: LeaveType[] }): React.JSX.Element => {
  const { t, lang } = useT()
  const [balances] = useLeaveBalances(userId)
  const rows = balances.state === 'ok' ? balances.data : []
  return (
    <>
      <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {types.map((x) => (
          <Stat
            key={x.id}
            label={leaveTypeName(x, lang)}
            loading={balances.state === 'loading'}
            {...leaveStat(x, leaveBalance(rows, x.id), t)}
          />
        ))}
      </div>
      {balances.state === 'error' ? (
        <Notice tone="bad">{t(balances.message)}</Notice>
      ) : (
        balances.state === 'ok' &&
        leaveNotSetUp(types, rows) && <Notice tone="info">{t('leaveNoBalanceYet')}</Notice>
      )}
    </>
  )
}

const LeaveForm = ({
  userId,
  onDone,
  onClose
}: {
  userId: string
  onDone: () => void
  onClose: () => void
}): React.JSX.Element => {
  const { t, lang } = useT()
  const now = today()
  const f = useLeaveForm(userId, now)
  const { start, end, startHalf, endHalf } = f.span
  const half = f.type?.allow_half_day
  const send = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (await f.submit()) onDone()
  }
  if (f.loading) return <FormSkeleton />
  if (f.loadError) return <Notice tone="bad">{t(f.loadError)}</Notice>
  return (
    <Card className="mb-6" title={t('leaveAsk')}>
      <form onSubmit={(e) => void send(e)} className="flex flex-col gap-4">
        {f.types.length > 1 && (
          <Field label={t('leaveType')}>
            <Select value={f.type?.id ?? ''} onChange={(e) => f.pick(e.target.value)}>
              {f.types.map((x) => (
                <option key={x.id} value={x.id}>
                  {leaveTypeName(x, lang)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
          <Field label={t('leaveFrom')}>
            <Input
              type="date"
              required
              min={earliestLeaveDay(now)}
              value={start}
              onChange={(e) => e.target.value && f.update({ start: e.target.value })}
            />
          </Field>
          <Field label={t('leaveTo')}>
            <Input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => e.target.value && f.update({ end: e.target.value })}
            />
          </Field>
        </div>
        {half &&
          (start === end ? (
            <Choice
              label={t('leaveLength')}
              value={startHalf}
              onChange={(v) => f.update({ startHalf: v, endHalf: v })}
              options={(['full', 'first', 'second'] as const).map((h) => [h, t(LEAVE_HALF_KEY[h])])}
            />
          ) : (
            <div className="flex flex-wrap gap-4">
              <Choice
                label={t('leaveFirstPart')}
                value={startHalf}
                onChange={(v) => f.update({ startHalf: v })}
                options={(['full', 'second'] as const).map((h) => [h, t(LEAVE_HALF_KEY[h])])}
              />
              <Choice
                label={t('leaveLastPart')}
                value={endHalf}
                onChange={(v) => f.update({ endHalf: v })}
                options={(['full', 'first'] as const).map((h) => [h, t(LEAVE_HALF_KEY[h])])}
              />
            </div>
          ))}
        <Field label={t('leaveReason')}>
          <TextArea
            rows={2}
            required
            maxLength={500}
            placeholder={t('leaveReasonPlaceholder')}
            value={f.reason}
            onChange={(e) => f.setReason(e.target.value)}
          />
        </Field>
        {f.days === 0 ? (
          <Notice tone="warn">{t('errLeaveNoWorkdays')}</Notice>
        ) : f.over && f.left !== null ? (
          <Notice tone="warn">{t('leaveNotEnough', { days: fmtLeaveDays(f.left, t) })}</Notice>
        ) : (
          f.days !== null && (
            <p className="text-sm text-fg-2">
              {t('leaveWillUse', { days: fmtLeaveDays(f.days, t) })}
              {f.type?.needs_balance &&
                f.left !== null &&
                ` ${t('leaveLeftNow', { days: fmtLeaveDays(f.left, t) })}`}
            </p>
          )
        )}
        {f.error && <Notice tone="bad">{t(f.error)}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={f.busy} disabled={!f.ready}>
            {t('leaveSend')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-fg">{fmtLeaveSpan(r, t, locale)}</h2>
        <Badge label={t(LEAVE_STATUS_KEY[r.status])} tone={LEAVE_STATUS_TONE[r.status]} />
      </div>
      <p className="mt-1 text-sm text-fg-2">
        {type && `${leaveTypeName(type, lang)} · `}
        {fmtLeaveDays(+r.days, t)}
      </p>
      <p className="mt-3 text-sm whitespace-pre-line text-fg-2">{r.reason}</p>
      {r.decision_note && (
        <p className="mt-2 text-sm text-fg-2">{t('leaveAdminNote', { note: r.decision_note })}</p>
      )}
      <p className="mt-2 text-xs text-fg-3">{fmtLeaveTimes(r, t, locale)}</p>
      {cancel.error && (
        <div className="mt-3">
          <Notice tone="bad">{t(cancel.error)}</Notice>
        </div>
      )}
      {canCancelLeave(r, today()) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {/* In-app confirm: window.confirm's OK/Cancel buttons stay in the OS language. */}
          {confirming ? (
            <>
              <span className="text-sm text-fg-2">
                {t(pending ? 'leaveConfirmWithdraw' : 'leaveConfirmCancel')}
              </span>
              <Button
                variant="danger"
                busy={cancel.busy}
                onClick={() => void cancel.run({ id: r.id })}
              >
                {t('leaveConfirmYes')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t('leaveKeep')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              {t(pending ? 'leaveWithdraw' : 'leaveCancel')}
            </Button>
          )}
        </div>
      ) : (
        r.status === 'approved' && <p className="mt-3 text-xs text-fg-3">{t('leaveStartedNote')}</p>
      )}
    </Card>
  )
}

export const MyLeave = ({ profile }: { profile: Profile }): React.JSX.Element => {
  const { t } = useT()
  const [types, reloadTypes] = useLeaveTypes()
  const [requests, reload] = useLeaveRequests(profile.id)
  const [asking, setAsking] = useState(false)
  const [sent, setSent] = useState(false)
  const all = types.state === 'ok' ? types.data : []
  return (
    <>
      <PageHeader
        title={t('navLeave')}
        subtitle={t('leaveSubtitle')}
        action={
          !asking && (
            <Button
              onClick={() => {
                setAsking(true)
                setSent(false)
              }}
            >
              {t('leaveAsk')}
            </Button>
          )
        }
      />
      {types.state === 'error' ? (
        <div className="mb-6 flex flex-col items-start gap-3">
          <Notice tone="bad">{t(types.message)}</Notice>
          <Button variant="ghost" onClick={reloadTypes}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : (
        <div className="mb-6">
          <Balances userId={profile.id} types={all.filter((x) => x.active)} />
        </div>
      )}
      {sent && (
        <div className="mb-6">
          <Notice tone="ok">{t('leaveSent')}</Notice>
        </div>
      )}
      {asking && (
        <LeaveForm
          userId={profile.id}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false)
            setSent(true)
          }}
        />
      )}
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-fg-2 uppercase">
        {t('leaveRequests')}
      </h2>
      {requests.state === 'loading' ? (
        <CardsSkeleton />
      ) : requests.state === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{t(requests.message)}</Notice>
          <Button variant="ghost" onClick={reload}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : requests.data.length ? (
        <ul className="flex flex-col gap-3">
          {requests.data.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} type={all.find((x) => x.id === r.type_id)} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={<CalendarOff className="size-7" />}
          title={t('leaveEmpty')}
          hint={t('leaveEmptyHint')}
        />
      )}
    </>
  )
}
