import { describe, expect, it } from 'vitest'
import { translator } from '../src/i18n'
import type { BoardTask } from '../src/taskService'
import { shareText } from '../src/taskShare'

const task = (o: Partial<BoardTask> = {}): BoardTask => ({
  id: '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e',
  title: ' Count stock ',
  description: null,
  due_date: '2026-10-30T18:29:59.000Z',
  status: 'in_progress',
  created_by: '1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9',
  created_at: '2026-10-23T05:00:00Z',
  updated_at: '2026-10-23T05:00:00Z',
  assignees: [
    { id: 'a', full_name: 'Ravi Patel', email: 'ravi@example.com' },
    { id: 'b', full_name: null, email: 'meena@example.com' }
  ],
  ...o
})

describe('shareText', () => {
  it('lists title, people, due date and status', () => {
    expect(shareText(task(), translator('en'), 'en-IN')).toBe(
      [
        '📌 *Count stock*',
        'Given to: Ravi Patel, meena@example.com',
        'Due Fri, 30 Oct, 2026',
        'Status: In progress',
        '',
        '— Sent from Daily Status'
      ].join('\n')
    )
  })

  it('keeps the details with their line breaks', () => {
    const text = shareText(task({ description: '  Store 2\nStore 5  ' }), translator('en'), 'en-IN')
    expect(text).toContain('Status: In progress\n\nStore 2\nStore 5\n\n— Sent')
  })

  it('follows the UI language', () => {
    const text = shareText(task({ status: 'completed' }), translator('hi'), 'hi-IN')
    expect(text).toContain('Daily Status से भेजा गया')
    expect(text).not.toContain('Given to')
  })
})
