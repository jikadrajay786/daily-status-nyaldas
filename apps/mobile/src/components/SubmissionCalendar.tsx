import { fmtDate } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { addDays, weekday, type DayState } from '@daily-status/core/workdays'
import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme, type Colors } from '@/lib/theme'

const STATE_TEXT: Record<DayState, Key> = {
  done: 'stateDone',
  missed: 'stateMissed',
  pending: 'statePending',
  off: 'stateOff',
  outside: 'stateOutside'
}

// Shape as well as colour, so the calendar still reads for colour-blind people.
const Mark = ({ state, c }: { state: DayState; c: Colors }): React.JSX.Element | null => {
  switch (state) {
    case 'done':
      return <View style={[s.dot, { backgroundColor: c.ok }]} />
    case 'missed':
      return <Text style={[s.cross, { color: c.badFg }]}>✕</Text>
    case 'pending':
      return <View style={[s.dot, s.ring, { borderColor: c.warn }]} />
    case 'off':
      return <View style={[s.dash, { backgroundColor: c.fg3 }]} />
    default:
      return null
  }
}

const nextMonth = (m: string): string => addDays(`${m}-01`, 32).slice(0, 7)
// 2026-10-19 is a Monday: weeks start on Monday, as on desktop.
const MONDAY = '2026-10-19'

// Memoised: a year-long custom range renders a dozen month grids.
export const SubmissionCalendar = memo(function SubmissionCalendar({
  days
}: {
  days: readonly [string, DayState][]
}): React.JSX.Element | null {
  const { t, locale } = useT()
  const { colors: c } = useTheme()
  const first = days[0]?.[0]
  const last = days.at(-1)?.[0]
  if (!first || !last) return null
  const states = new Map(days)
  // Local midnight rather than a UTC time zone option, which Hermes may not honour.
  const fmt = (o: Intl.DateTimeFormatOptions, d: string): string =>
    new Intl.DateTimeFormat(locale, o).format(new Date(`${d}T00:00`))
  const heads = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
  const months: string[] = []
  for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = nextMonth(m)) months.push(m)

  return (
    <View style={s.wrap}>
      {months.map((m) => {
        const start = `${m}-01` > first ? `${m}-01` : first
        const monthEnd = addDays(`${nextMonth(m)}-01`, -1)
        const end = monthEnd < last ? monthEnd : last
        const weeks: string[][] = []
        for (let w = addDays(start, -((weekday(start) + 6) % 7)); w <= end; w = addDays(w, 7))
          weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
        return (
          <View key={m} style={s.month}>
            <Text accessibilityRole="header" style={[s.caption, { color: c.fg }]}>
              {fmt({ month: 'long', year: 'numeric' }, `${m}-01`)}
            </Text>
            <View
              style={s.row}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {heads.map((d) => (
                <Text key={d} style={[s.head, { color: c.fg3 }]}>
                  {fmt({ weekday: 'narrow' }, d)}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week[0]} style={s.row}>
                {week.map((d) => {
                  const state = d >= start && d <= end ? states.get(d) : undefined
                  return (
                    <View
                      key={d}
                      style={s.cell}
                      {...(state && {
                        accessible: true,
                        accessibilityLabel: `${fmtDate(d, locale)}: ${t(STATE_TEXT[state])}`
                      })}
                    >
                      {state && (
                        <>
                          <Text style={[s.day, { color: state === 'outside' ? c.fg3 : c.fg2 }]}>
                            {Number(d.slice(8))}
                          </Text>
                          <View style={s.mark}>
                            <Mark state={state} c={c} />
                          </View>
                        </>
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        )
      })}
      <View style={s.legend}>
        {(['done', 'missed', 'pending', 'off'] as const).map((st) => (
          <View key={st} style={s.legendItem}>
            <View style={s.mark}>
              <Mark state={st} c={c} />
            </View>
            <Text style={[s.legendText, { color: c.fg2 }]}>{t(STATE_TEXT[st])}</Text>
          </View>
        ))}
      </View>
    </View>
  )
})

const s = StyleSheet.create({
  wrap: { gap: 20 },
  month: { gap: 4 },
  caption: { fontSize: 15, fontWeight: '500', marginBottom: 4 },
  row: { flexDirection: 'row' },
  head: { flex: 1, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
  day: { fontSize: 12 },
  mark: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  ring: { backgroundColor: 'transparent', borderWidth: 2 },
  cross: { fontSize: 12, fontWeight: '800', lineHeight: 14 },
  dash: { width: 10, height: 2, borderRadius: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 13 }
})
