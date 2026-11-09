import { describe, expect, it } from 'vitest'
import { collect, pageOf } from '../src/supabase'

type Res = { data: number[]; error: null; count: number; status: number; statusText: string }

const table = (
  n: number
): { asked: [number, number][]; page: (from: number, to: number) => Promise<Res> } => {
  const asked: [number, number][] = []
  return {
    asked,
    page: async (from: number, to: number) => {
      asked.push([from, to])
      const data = Array.from(
        { length: Math.max(0, Math.min(to, n - 1) - from + 1) },
        (_, i) => from + i
      )
      return { data, error: null, count: n, status: 200, statusText: 'OK' }
    }
  }
}

describe('paging', () => {
  it('opens with one page and says more are left', async () => {
    const t = table(45)
    expect(await pageOf(t.page, 20)).toMatchObject({ total: 45, more: true })
    expect(t.asked).toEqual([[0, 19]])
  })

  it('says nothing is left on the last page', async () => {
    const res = await pageOf(table(20).page, 20)
    expect(res.rows).toHaveLength(20)
    expect(res.more).toBe(false)
  })

  it('handles an empty list', async () => {
    expect(await pageOf(table(0).page, 20)).toEqual({ rows: [], total: 0, more: false })
  })

  it('reaches past the 1000-row cap in batches, without overshooting', async () => {
    const t = table(5000)
    expect((await pageOf(t.page, 1040)).rows).toHaveLength(1040)
    expect(t.asked).toEqual([
      [0, 999],
      [1000, 1039]
    ])
  })

  it('never asks past the end of a counted list, which PostgREST refuses', async () => {
    const t = table(1000)
    expect((await collect(t.page)).rows).toHaveLength(1000)
    expect(t.asked).toEqual([[0, 999]])
  })

  it('passes errors on', async () => {
    const err = { message: 'boom' }
    const page = async (): Promise<unknown> => ({
      data: null,
      error: err,
      count: null,
      status: 500,
      statusText: ''
    })
    await expect(collect(page as never)).rejects.toBe(err)
  })
})

describe('paging from further down', () => {
  it('starts at the offset and knows when it reached the end', async () => {
    const t = table(45)
    const res = await pageOf(t.page, 20, 20)
    expect(res.rows).toHaveLength(20)
    expect(res).toMatchObject({ total: 45, more: true })
    expect(await pageOf(t.page, 20, 40)).toMatchObject({ total: 45, more: false })
  })

  it('treats a page past the end as nothing more, when rows were removed meanwhile', async () => {
    const gone = (): PromiseLike<PostgrestSingleResponse<number[]>> =>
      Promise.resolve({
        data: null,
        error: { code: 'PGRST103', message: 'range', details: '', hint: '', name: '' },
        count: null,
        status: 416,
        statusText: ''
      } as unknown as PostgrestSingleResponse<number[]>)
    expect(await pageOf(gone, 20, 100)).toMatchObject({ rows: [], more: false })
  })

  it('without a count, a full page means there may be more', async () => {
    const page = (from: number, to: number): PromiseLike<PostgrestSingleResponse<number[]>> =>
      Promise.resolve({
        data: Array.from({ length: Math.max(0, Math.min(to, 29) - from + 1) }, (_, i) => from + i),
        error: null,
        count: null,
        status: 200,
        statusText: ''
      } as unknown as PostgrestSingleResponse<number[]>)
    expect(await pageOf(page, 20)).toMatchObject({ more: true })
    expect(await pageOf(page, 20, 20)).toMatchObject({ more: false })
  })
})
