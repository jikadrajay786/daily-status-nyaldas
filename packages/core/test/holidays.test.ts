import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addHoliday } from '../src/holidayService'
import { errMsg } from '../src/useQuery'

type Res = { data: unknown; error: unknown }
const calls: [string, unknown[]][] = []
let next: Res = { data: null, error: null }

const chain: object = new Proxy(
  {},
  {
    get: (_, k) =>
      k === 'then'
        ? (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) =>
            Promise.resolve(next).then(ok, bad)
        : (...args: unknown[]) => (calls.push([String(k), args]), chain)
  }
)

vi.mock('../src/supabase', async (orig) => ({
  ...(await orig<typeof import('../src/supabase')>()),
  db: () => ({ from: (t: string) => (calls.push(['from', [t]]), chain) })
}))

beforeEach(() => {
  calls.length = 0
  next = { data: { day: '2027-01-14', name: 'Uttarayan' }, error: null }
})

describe('addHoliday', () => {
  it('trims the name', async () => {
    await addHoliday('2027-01-14', '  Uttarayan ')
    expect(calls.find(([k]) => k === 'insert')?.[1]).toEqual([
      { day: '2027-01-14', name: 'Uttarayan' }
    ])
  })

  it('checks the date and name before any request', async () => {
    await expect(addHoliday('', 'Uttarayan')).rejects.toSatisfy(
      (e) => errMsg(e) === 'errHolidayDay'
    )
    await expect(addHoliday('2027-01-14', ' ')).rejects.toSatisfy(
      (e) => errMsg(e) === 'errHolidayName'
    )
    expect(calls).toEqual([])
  })

  it('says so when the day is already a holiday', async () => {
    next = { data: null, error: { code: '23505', message: 'duplicate key' } }
    await expect(addHoliday('2026-11-08', 'Diwali')).rejects.toSatisfy(
      (e) => errMsg(e) === 'errHolidayExists'
    )
  })
})
