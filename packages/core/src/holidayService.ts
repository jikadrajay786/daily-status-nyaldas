import { useState } from 'react'
import type { Holiday } from './database.types'
import type { Key } from './i18n'
import { bumpLive, useLiveQuery } from './live'
import { changed } from './statusService'
import { db, unwrap } from './supabase'
import { useBusy } from './useBusy'
import { errMsg, type Query } from './useQuery'
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

const clean = (day: string, name: string): string => {
  const label = name.trim()
  if (!DAY.test(day)) fail('holiday_day')
  if (!label || label.length > 100) fail('holiday_name')
  return label
}

export const addHoliday = async (day: string, name: string): Promise<Holiday> => {
  const label = clean(day, name)
  const res = await db().from('holidays').insert({ day, name: label }).select().single()
  if (res.error?.code === '23505') fail('holiday_exists')
  return unwrap(res)
}

export const updateHoliday = async (day: string, next: string, name: string): Promise<void> => {
  const label = clean(next, name)
  const res = await db()
    .from('holidays')
    .update({ day: next, name: label })
    .eq('day', day)
    .select('day')
  if (res.error?.code === '23505') fail('holiday_exists')
  changed(unwrap(res))
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

// The edit form both apps draw on a holiday's row.
export type HolidayEdit = {
  editing: boolean
  open: () => void
  close: () => void
  day: string
  setDay: (d: string) => void
  name: string
  setName: (n: string) => void
  save: () => Promise<void>
  busy: boolean
  error: Key | undefined
}

export const useHolidayEdit = (h: Pick<Holiday, 'day' | 'name'>): HolidayEdit => {
  const [editing, setEditing] = useState(false)
  const [day, setDay] = useState(h.day)
  const [name, setName] = useState(h.name)
  const [error, setError] = useState<Key>()
  const [busy, run] = useBusy()
  return {
    editing,
    open: () => {
      setDay(h.day)
      setName(h.name)
      setError(undefined)
      setEditing(true)
    },
    close: () => setEditing(false),
    day,
    setDay,
    name,
    setName,
    save: () =>
      run(async () => {
        try {
          await updateHoliday(h.day, day, name)
          setEditing(false)
          bumpLive()
        } catch (err) {
          setError(errMsg(err))
        }
      }),
    busy,
    error
  }
}
