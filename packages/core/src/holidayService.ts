import type { Holiday } from './database.types'
import { useLiveQuery } from './live'
import { changed } from './statusService'
import { db, unwrap } from './supabase'
import type { Query } from './useQuery'
import { isWorkday } from './workdays'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const fail = (code: string): never => {
  throw Object.assign(new Error(code), { code })
}

export const listHolidays = async (start: string, end: string): Promise<Holiday[]> =>
  unwrap(await db().from('holidays').select().gte('day', start).lte('day', end).order('day'))

// Day → name, for the workday rules and calendar marks.
export const holidayMap = async (start: string, end: string): Promise<Map<string, string>> =>
  new Map((await listHolidays(start, end)).map((h) => [h.day, h.name]))

export const addHoliday = async (day: string, name: string): Promise<Holiday> => {
  const label = name.trim()
  if (!DAY.test(day)) fail('holiday_day')
  if (!label || label.length > 100) fail('holiday_name')
  const res = await db().from('holidays').insert({ day, name: label }).select().single()
  if (res.error?.code === '23505') fail('holiday_exists')
  return unwrap(res)
}

export const deleteHoliday = async (day: string): Promise<void> => {
  changed(unwrap(await db().from('holidays').delete().eq('day', day).select('day')))
}

export const useHolidays = (start: string, end: string): [Query<Holiday[]>, () => void, boolean] =>
  useLiveQuery(`holidays:${start}:${end}`, () => listHolidays(start, end))

// The holiday's name on that day, if it is one.
export const useHoliday = (day: string): string | undefined => {
  const [q] = useHolidays(day, day)
  return q.state === 'ok' ? q.data[0]?.name : undefined
}

// Whether an update is optional that day (Sunday or a holiday), with the holiday's name when it is one.
export const useDayOff = (day: string): { off: boolean; holiday: string | undefined } => {
  const holiday = useHoliday(day)
  return { off: !!holiday || !isWorkday(day), holiday }
}
