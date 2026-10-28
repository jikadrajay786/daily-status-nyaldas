import { fmtDate } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { today } from '@daily-status/core/supabase'
import { addDays, weekday, type DayState } from '@daily-status/core/workdays'
import { memo } from 'react'
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
      return <Box className="h-0.5 w-2.5 rounded-[1px] bg-fg-3" />
    default:
      return null
  }
}

// A small diamond: a different shape again from every day state.
const HolidayMark = (): React.JSX.Element => <Box className="h-2 w-2 rotate-45 bg-accent" />

// The fixed box every mark sits in, so cells and the legend line up whatever the shape.
const MARK_BOX = 'h-3.5 w-3.5 items-center justify-center'

const nextMonth = (m: string): string => addDays(`${m}-01`, 32).slice(0, 7)
// 2026-10-19 is a Monday: weeks start on Monday, as on desktop.
const MONDAY = '2026-10-19'

// Memoised: a year-long custom range renders a dozen month grids.
// A null state draws the plain date (the admin's holiday calendar has no updates to show).
export const SubmissionCalendar = memo(function SubmissionCalendar({
  days,
  holidays,
  hideMonth = false
}: {
  days: readonly [string, DayState | null][]
  holidays?: ReadonlyMap<string, string>
  // For a single month whose name is already shown above the grid.
  hideMonth?: boolean
}): React.JSX.Element | null {
  const { t, locale } = useT()
  const first = days[0]?.[0]
  const last = days.at(-1)?.[0]
  if (!first || !last) return null
  const states = new Map(days)
  const now = today()
  // Local midnight rather than a UTC time zone option, which Hermes may not honour.
  const fmt = (o: Intl.DateTimeFormatOptions, d: string): string =>
    new Intl.DateTimeFormat(locale, o).format(new Date(`${d}T00:00`))
  const heads = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
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
            {!hideMonth && (
              <Text accessibilityRole="header" className="mb-1 text-[15px] font-medium text-fg">
                {fmt({ month: 'long', year: 'numeric' }, `${m}-01`)}
              </Text>
            )}
            <HStack accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {heads.map((d) => (
                <Text key={d} className="flex-1 text-center text-[12px] text-fg-3">
                  {fmt({ weekday: 'narrow' }, d)}
                </Text>
              ))}
            </HStack>
            {weeks.map((week) => (
              <HStack key={week[0]}>
                {week.map((d) => {
                  const shown = d >= start && d <= end
                  const state = shown ? states.get(d) : undefined
                  const holiday = shown ? holidays?.get(d) : undefined
                  return (
                    <VStack
                      key={d}
                      className="h-11 flex-1 items-center justify-center gap-0.5"
                      {...(shown && {
                        accessible: true,
                        accessibilityLabel: [
                          fmtDate(d, locale),
                          holiday,
                          state && t(STATE_TEXT[state])
                        ]
                          .filter(Boolean)
                          .join(': ')
                      })}
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
      <HStack className="flex-wrap gap-x-4 gap-y-2">
        {(days.some(([, s]) => s && s !== 'off')
          ? (['done', 'missed', 'pending', 'off'] as const)
          : (['off'] as const)
        ).map((st) => (
          <HStack key={st} className="items-center gap-1.5">
            <Box className={MARK_BOX}>
              <Mark state={st} />
            </Box>
            <Text className="text-[13px] text-fg-2">{t(STATE_TEXT[st])}</Text>
          </HStack>
        ))}
        {!!holidays?.size && (
          <HStack className="items-center gap-1.5">
            <Box className={MARK_BOX}>
              <HolidayMark />
            </Box>
            <Text className="text-[13px] text-fg-2">{t('stateHoliday')}</Text>
          </HStack>
        )}
      </HStack>
    </VStack>
  )
})
