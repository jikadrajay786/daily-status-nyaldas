import { useT } from '@daily-status/core/i18n'
import {
  earliestLeaveDay,
  fmtLeaveDays,
  LEAVE_HALF_KEY,
  leaveTypeName
} from '@daily-status/core/leave'
import { today } from '@daily-status/core/supabase'
import { useLeaveForm } from '@daily-status/core/useLeave'
import { addDays } from '@daily-status/core/workdays'
import { Redirect, router } from 'expo-router'
import { AccessibilityInfo } from 'react-native'
import { DateField } from '@/components/DateField'
import { Text } from '@/components/gs/text'
import { VStack } from '@/components/gs/vstack'
import { Button, Field, Notice, Screen, Segmented, Skeleton } from '@/components/ui'
import { useProfile } from '@/lib/profile'

const LOOK_AHEAD = 365

export default function AskForLeave(): React.JSX.Element {
  const { t, lang } = useT()
  const { id, role } = useProfile()
  const now = today()
  const f = useLeaveForm(id, now)
  if (role === 'admin') return <Redirect href="/" />
  const { start, end, startHalf, endHalf } = f.span
  const half = f.type?.allow_half_day
  const send = async (): Promise<void> => {
    if (!(await f.submit())) return
    AccessibilityInfo.announceForAccessibility(t('leaveSent'))
    router.back()
  }
  return (
    <Screen underHeader>
      {f.loading ? (
        <Skeleton width={240} height={48} />
      ) : f.loadError ? (
        <Notice tone="bad">{t(f.loadError)}</Notice>
      ) : (
        <>
          {f.types.length > 1 && (
            <VStack className="gap-1.5">
              <Text className="text-[14px] font-medium text-fg-2">{t('leaveType')}</Text>
              <Segmented
                scroll
                label={t('leaveType')}
                value={f.type?.id ?? ''}
                onChange={f.pick}
                options={f.types.map((x) => [x.id, leaveTypeName(x, lang)])}
              />
            </VStack>
          )}
          <DateField
            label={t('leaveFrom')}
            value={start}
            min={earliestLeaveDay(now)}
            max={addDays(now, LOOK_AHEAD)}
            onChange={(d) => f.update({ start: d })}
          />
          <DateField
            label={t('leaveTo')}
            value={end}
            min={start}
            max={addDays(start, LOOK_AHEAD)}
            onChange={(d) => f.update({ end: d })}
          />
          {half &&
            (start === end ? (
              <VStack className="gap-1.5">
                <Text className="text-[14px] font-medium text-fg-2">{t('leaveLength')}</Text>
                <Segmented
                  label={t('leaveLength')}
                  value={startHalf}
                  onChange={(v) => f.update({ startHalf: v, endHalf: v })}
                  options={(['full', 'first', 'second'] as const).map((h) => [
                    h,
                    t(LEAVE_HALF_KEY[h])
                  ])}
                />
              </VStack>
            ) : (
              <>
                <VStack className="gap-1.5">
                  <Text className="text-[14px] font-medium text-fg-2">{t('leaveFirstPart')}</Text>
                  <Segmented
                    label={t('leaveFirstPart')}
                    value={startHalf}
                    onChange={(v) => f.update({ startHalf: v })}
                    options={(['full', 'second'] as const).map((h) => [h, t(LEAVE_HALF_KEY[h])])}
                  />
                </VStack>
                <VStack className="gap-1.5">
                  <Text className="text-[14px] font-medium text-fg-2">{t('leaveLastPart')}</Text>
                  <Segmented
                    label={t('leaveLastPart')}
                    value={endHalf}
                    onChange={(v) => f.update({ endHalf: v })}
                    options={(['full', 'first'] as const).map((h) => [h, t(LEAVE_HALF_KEY[h])])}
                  />
                </VStack>
              </>
            ))}
          <Field
            label={t('leaveReason')}
            multiline
            maxLength={500}
            placeholder={t('leaveReasonPlaceholder')}
            value={f.reason}
            onChangeText={f.setReason}
          />
          {f.days === 0 ? (
            <Notice tone="warn">{t('errLeaveNoWorkdays')}</Notice>
          ) : f.over && f.left !== null ? (
            <Notice tone="warn">{t('leaveNotEnough', { days: fmtLeaveDays(f.left, t) })}</Notice>
          ) : (
            f.days !== null && (
              <Text className="text-[14px] text-fg-2">
                {t('leaveWillUse', { days: fmtLeaveDays(f.days, t) })}
                {f.type?.needs_balance && f.left !== null
                  ? ` ${t('leaveLeftNow', { days: fmtLeaveDays(f.left, t) })}`
                  : ''}
              </Text>
            )
          )}
          {f.error && <Notice tone="bad">{t(f.error)}</Notice>}
          <Button busy={f.busy} disabled={!f.ready} onPress={() => void send()}>
            {t('leaveSend')}
          </Button>
        </>
      )}
    </Screen>
  )
}
