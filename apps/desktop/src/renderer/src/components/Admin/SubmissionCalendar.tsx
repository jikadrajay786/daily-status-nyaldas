import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { fmtDate } from '@daily-status/core/format'
import { useT, type Key } from '@daily-status/core/i18n'
import { addDays, weekday, type DayState } from '@daily-status/core/workdays'

const STATE_TEXT: Record<DayState, Key> = {
  done: 'stateDone',
  missed: 'stateMissed',
  pending: 'statePending',
  off: 'stateOff',
  outside: 'stateOutside'
}

// Shape as well as colour, so the calendar still reads for colour-blind people and in high-contrast mode.
const MARKS: Record<DayState, ReactNode> = {
  done: <span className="size-2.5 rounded-full bg-ok" />,
  missed: <X className="size-3.5 text-bad-fg" strokeWidth={3} />,
  pending: <span className="size-2.5 rounded-full border-2 border-warn" />,
  off: <span className="h-0.5 w-2.5 rounded-full bg-fg-3" />,
  outside: null
}

const Mark = ({ state }: { state: DayState }): React.JSX.Element => (
  <span aria-hidden className="mx-auto grid size-3.5 place-items-center forced-color-adjust-none">
    {MARKS[state]}
  </span>
)

const utc = (d: string): Date => new Date(`${d}T00:00Z`)
const nextMonth = (m: string): string => addDays(`${m}-01`, 32).slice(0, 7)
// 2026-10-19 is a Monday: weeks in the grid start on Monday.
const MONDAY = '2026-10-19'

type Props = { days: readonly [string, DayState][] }

export const SubmissionCalendar = ({ days }: Props): React.JSX.Element | null => {
  const { t, locale } = useT()
  const first = days[0]?.[0]
  const last = days.at(-1)?.[0]
  if (!first || !last) return null
  const states = new Map(days)
  const fmt = (o: Intl.DateTimeFormatOptions, d: string): string =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(utc(d))
  const heads = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
  const months: string[] = []
  for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = nextMonth(m)) months.push(m)

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-6">
        {months.map((m) => {
          const start = `${m}-01` > first ? `${m}-01` : first
          const monthEnd = addDays(`${nextMonth(m)}-01`, -1)
          const end = monthEnd < last ? monthEnd : last
          const weeks: string[][] = []
          for (let w = addDays(start, -((weekday(start) + 6) % 7)); w <= end; w = addDays(w, 7))
            weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
          return (
            <table
              key={m}
              className="w-full table-fixed border-separate border-spacing-0.5 text-center"
            >
              <caption className="mb-1 text-left text-sm font-medium text-fg">
                {fmt({ month: 'long', year: 'numeric' }, `${m}-01`)}
              </caption>
              <thead>
                <tr>
                  {heads.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      abbr={fmt({ weekday: 'long' }, d)}
                      className="pb-1 text-xs font-normal text-fg-3"
                    >
                      {fmt({ weekday: 'narrow' }, d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]}>
                    {week.map((d) => {
                      const state = d >= start && d <= end ? states.get(d) : undefined
                      return (
                        <td key={d} className="h-10 rounded-md align-middle">
                          {state && (
                            <span title={`${fmtDate(d, locale)} · ${t(STATE_TEXT[state])}`}>
                              <span
                                aria-hidden
                                className={`block text-xs ${state === 'outside' ? 'text-fg-3' : 'text-fg-2'}`}
                              >
                                {Number(d.slice(8))}
                              </span>
                              <Mark state={state} />
                              <span className="sr-only">
                                {fmtDate(d, locale)}: {t(STATE_TEXT[state])}
                              </span>
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-2">
        {(['done', 'missed', 'pending', 'off'] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <Mark state={s} />
            {t(STATE_TEXT[s])}
          </li>
        ))}
      </ul>
    </>
  )
}
