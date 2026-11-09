import { fmtDate } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { addDays, weekday, type DayState } from '@daily-status/core/workdays'
import { Moon } from 'lucide-react-native'
import { memo, type ReactNode } from 'react'
import { useWindowDimensions } from 'react-native'
import { withUniwind } from 'uniwind'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'
import { VStack } from './gs/vstack'

const STATE_TEXT: Record<DayState, Key> = {
  done: 'stateDone',
  missed: 'stateMissed',
  pending: 'statePending',
  off: 'stateOff',
  outside: 'stateOutside'
}

const MoonIcon = withUniwind(Moon)

// Shape as well as colour, so the calendar still reads for colour-blind people.
const Mark = ({ state }: { state: DayState }): React.JSX.Element | null => {
  switch (state) {
    case 'done':
      return <Box className="h-2.5 w-2.5 rounded-full bg-ok" />
    case 'missed':
      return <Text className="text-[12px] leading-[14px] font-extrabold text-bad-fg">✕</Text>
    case 'pending':
      return <Box className="h-2.5 w-2.5 rounded-full border-2 border-warn" />
    case 'off':
      return <MoonIcon colorClassName="accent-fg-3" size={13} strokeWidth={2.5} />
    default:
      return null
  }
}

// A small diamond: a different shape again from every day state.
const HolidayMark = (): React.JSX.Element => <Box className="h-2 w-2 rotate-45 bg-accent" />

// The fixed box every mark sits in, so cells and the legend line up whatever the shape.
const MARK_BOX = 'h-3.5 w-3.5 items-center justify-center'

const TILE: Record<DayState, string> = {
  done: 'border-transparent bg-ok/15',
  missed: 'border-transparent bg-bad/15',
  pending: 'border-warn',
  off: 'border-transparent bg-hover',
  outside: 'border-transparent'
}

const DayTile = ({
  d,
  state,
  holiday,
  label,
  minHeight
}: {
  d: string
  state: DayState | null | undefined
  holiday: string | undefined
  label: string
  minHeight: number
}): React.JSX.Element => {
  const isToday = d === today()
  return (
    <VStack
      accessible
      accessibilityLabel={label}
      style={{ minHeight }}
      className={`flex-1 items-center justify-center gap-0.5 rounded-[12px] border py-1 ${
        holiday ? 'border-accent-fg bg-accent/15' : state ? TILE[state] : 'border-line bg-canvas'
      }`}
    >
      <Box
        className={`min-h-6 min-w-6 items-center justify-center rounded-full ${isToday ? 'bg-accent' : ''}`}
      >
        <Text
          className={`text-[14px] ${
            isToday
              ? 'font-semibold text-on-accent android:font-bold'
              : state === 'outside'
                ? 'text-fg-3'
                : 'font-medium text-fg'
          }`}
        >
          {Number(d.slice(8))}
        </Text>
      </Box>
      <Box className={MARK_BOX}>
        {holiday && state !== 'done' ? <HolidayMark /> : state && <Mark state={state} />}
      </Box>
    </VStack>
  )
}

const Legend = ({
  label,
  count,
  children
}: {
  label: string
  count?: number | undefined
  children: ReactNode
}): React.JSX.Element => (
  <HStack
    className={`items-center gap-1.5 ${count === undefined ? '' : 'rounded-full bg-hover px-2.5 py-1'}`}
  >
    <Box className={MARK_BOX}>{children}</Box>
    <Text className="text-[13px] text-fg-2">{label}</Text>
    {count !== undefined && (
      <Text className="text-[13px] font-semibold text-fg android:font-bold">{count}</Text>
    )}
  </HStack>
)

const nextMonth = (m: string): string => addDays(`${m}-01`, 32).slice(0, 7)
// 2026-10-19 is a Monday: weeks start on Monday, as on desktop.
const MONDAY = '2026-10-19'

// Memoised: a year-long custom range renders a dozen month grids.
// A null state draws the plain date (the admin's holiday calendar has no updates to show).
export const SubmissionCalendar = memo(function SubmissionCalendar({
  days,
  holidays,
  large = false
}: {
  days: readonly [string, DayState | null][]
  holidays?: ReadonlyMap<string, string>
  // One month filling the phone's width, named above the grid; the legend also counts the days.
  large?: boolean
}): React.JSX.Element | null {
  const { t, locale } = useT()
  const { width } = useWindowDimensions()
  const first = days[0]?.[0]
  const last = days.at(-1)?.[0]
  if (!first || !last) return null
  const states = new Map(days)
  const now = today()
  // Local midnight rather than a UTC time zone option, which Hermes may not honour.
  const fmt = (o: Intl.DateTimeFormatOptions, d: string): string =>
    new Intl.DateTimeFormat(locale, o).format(new Date(`${d}T00:00`))
  const heads = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
  // Slightly taller than wide on any phone, without tablets getting huge tiles.
  const tileHeight = Math.min(84, Math.max(52, ((width - 48) / 7) * 1.15))
  const count = (st: DayState): number | undefined =>
    large
      ? days.filter(([d, s]) => s === st && !(st === 'off' && holidays?.has(d))).length
      : undefined
  const months: string[] = []
  for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = nextMonth(m)) months.push(m)

  return (
    <VStack className="gap-5">
      {months.map((m) => {
        const start = `${m}-01` > first ? `${m}-01` : first
        const monthEnd = addDays(`${nextMonth(m)}-01`, -1)
        const end = monthEnd < last ? monthEnd : last
        const weeks: string[][] = []
        for (let w = addDays(start, -((weekday(start) + 6) % 7)); w <= end; w = addDays(w, 7))
          weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
        return (
          <VStack key={m} className="gap-1">
            {!large && (
              <Text accessibilityRole="header" className="mb-1 text-[15px] font-medium text-fg">
                {fmt({ month: 'long', year: 'numeric' }, `${m}-01`)}
              </Text>
            )}
            <HStack
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className={large ? 'mb-1 gap-1' : ''}
            >
              {heads.map((d) => (
                <Text
                  key={d}
                  numberOfLines={1}
                  className={`flex-1 text-center text-[12px] ${large ? 'font-medium text-fg-2' : 'text-fg-3'}`}
                >
                  {fmt({ weekday: large ? 'short' : 'narrow' }, d)}
                </Text>
              ))}
            </HStack>
            {weeks.map((week) => (
              <HStack key={week[0]} className={large ? 'gap-1' : ''}>
                {week.map((d) => {
                  const shown = d >= start && d <= end
                  const state = shown ? states.get(d) : undefined
                  const holiday = shown ? holidays?.get(d) : undefined
                  const label = [fmtDate(d, locale), holiday, state && t(STATE_TEXT[state])]
                    .filter(Boolean)
                    .join(': ')
                  if (large)
                    return shown ? (
                      <DayTile
                        key={d}
                        d={d}
                        state={state}
                        holiday={holiday}
                        label={label}
                        minHeight={tileHeight}
                      />
                    ) : (
                      <Box key={d} className="flex-1" />
                    )
                  return (
                    <VStack
                      key={d}
                      className="h-11 flex-1 items-center justify-center gap-0.5"
                      {...(shown && { accessible: true, accessibilityLabel: label })}
                    >
                      {shown && (
                        <>
                          <Text
                            className={`text-[12px] ${d === now ? 'font-bold text-accent-fg android:font-extrabold' : state === 'outside' ? 'text-fg-3' : 'text-fg-2'}`}
                          >
                            {Number(d.slice(8))}
                          </Text>
                          <Box className={MARK_BOX}>
                            {holiday && state !== 'done' ? (
                              <HolidayMark />
                            ) : (
                              state && <Mark state={state} />
                            )}
                          </Box>
                        </>
                      )}
                    </VStack>
                  )
                })}
              </HStack>
            ))}
          </VStack>
        )
      })}
      <HStack className={large ? 'flex-wrap gap-2' : 'flex-wrap gap-x-4 gap-y-2'}>
        {(days.some(([, s]) => s && s !== 'off')
          ? (['done', 'missed', 'pending', 'off'] as const)
          : (['off'] as const)
        )
          .filter((st) => !large || count(st))
          .map((st) => (
            <Legend key={st} label={t(STATE_TEXT[st])} count={count(st)}>
              <Mark state={st} />
            </Legend>
          ))}
        {!!holidays?.size && (
          <Legend label={t('stateHoliday')} count={large ? holidays.size : undefined}>
            <HolidayMark />
          </Legend>
        )}
      </HStack>
    </VStack>
  )
})
