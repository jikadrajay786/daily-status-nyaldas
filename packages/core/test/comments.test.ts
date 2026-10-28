import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, countComments, listComments } from '../src/commentService'
import { fmtAgo } from '../src/format'
import { translator } from '../src/i18n'
import { errMsg } from '../src/useQuery'

type Res = { data: unknown; error: unknown }
const calls: [string, unknown[]][] = []
let next: Res = { data: null, error: null }

// A PostgREST builder stand-in: every method records itself and chains; awaiting it yields `next`.
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
  db: () => ({
    from: (t: string) => (calls.push(['from', [t]]), chain),
    rpc: (...args: unknown[]) => (calls.push(['rpc', args]), chain)
  })
}))

const ID = '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e'
const call = (name: string): unknown[] | undefined => calls.find(([k]) => k === name)?.[1]

beforeEach(() => {
  calls.length = 0
  next = { data: [], error: null }
})

describe('comments', () => {
  it('reads a thread oldest first, by the right column', async () => {
    await listComments({ kind: 'task', id: ID })
    expect(call('eq')).toEqual(['task_id', ID])
    expect(call('order')).toEqual(['created_at'])
  })

  it('trims and attaches the comment to its update', async () => {
    next = { data: { id: 'c1' }, error: null }
    await addComment({ kind: 'status', id: ID }, '  Looks good  ')
    expect(call('insert')).toEqual([{ status_id: ID, body: 'Looks good' }])
  })

  it('rejects empty and overlong comments before any request', async () => {
    for (const body of ['   ', 'x'.repeat(2001)])
      await expect(addComment({ kind: 'task', id: ID }, body)).rejects.toSatisfy(
        (e) => errMsg(e) === 'errCommentBody'
      )
    expect(calls).toEqual([])
  })

  it('counts comments per card and skips the request when nothing is shown', async () => {
    expect(await countComments('task', [])).toEqual({})
    expect(calls).toEqual([])
    next = {
      data: [
        { id: 'a', n: 2 },
        { id: 'b', n: 1 }
      ],
      error: null
    }
    expect(await countComments('task', ['a', 'b'])).toEqual({ a: 2, b: 1 })
    expect(call('rpc')).toEqual(['comment_counts', { p_kind: 'task', p_ids: ['a', 'b'] }])
  })
})

describe('fmtAgo', () => {
  const t = translator('en')
  const now = Date.parse('2026-10-25T12:00:00Z')
  it('says how long ago for the last day, then the date', () => {
    expect(fmtAgo('2026-10-25T11:59:40Z', t, 'en-IN', now)).toBe('Just now')
    expect(fmtAgo('2026-10-25T11:15:00Z', t, 'en-IN', now)).toBe('45 min ago')
    expect(fmtAgo('2026-10-25T07:00:00Z', t, 'en-IN', now)).toBe('5 h ago')
    expect(fmtAgo('2026-10-23T07:00:00Z', t, 'en-IN', now)).toMatch(/23 Oct/)
  })
})
