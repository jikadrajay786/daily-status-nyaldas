import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setUserRole } from '../src/adminService'
import { errMsg } from '../src/useQuery'

const rpc = vi.fn()

vi.mock('../src/supabase', async (orig) => ({
  ...(await orig<typeof import('../src/supabase')>()),
  db: () => ({ rpc })
}))

beforeEach(() => rpc.mockReset())

it('treats a row hidden by a just-changed role as not found', () => {
  expect(errMsg({ code: 'PGRST116', message: 'The result contains 0 rows' })).toBe('notFound')
})

describe('setUserRole', () => {
  it('goes through the protected function, never the profiles table', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await setUserRole('id-1', 'manager')
    expect(rpc).toHaveBeenCalledWith('set_user_role', { p_user: 'id-1', p_role: 'manager' })
  })

  it.each([
    ['cannot change your own role', 'errRoleOwn'],
    ['person still has open tasks', 'errRoleOpenTasks'],
    ['person still has open leave requests', 'errRoleOpenLeave'],
    ['no such person', 'notFound'],
    ['permission denied: only admins change roles', 'errDenied']
  ])('turns "%s" into %s', async (message, key) => {
    rpc.mockResolvedValue({ data: null, error: { message } })
    const err = await setUserRole('id-1', 'admin').catch((e: unknown) => e)
    expect(errMsg(err)).toBe(key)
  })
})
