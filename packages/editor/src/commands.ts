import type { ChainedCommands, Editor, JSONContent } from '@tiptap/react'

// TipTap's focus() defers DOM focus to the next frame; focusing synchronously keeps the first keystroke in the editor.
export const exec = (editor: Editor, fn: (c: ChainedCommands) => ChainedCommands): void => {
  fn(editor.chain().focus()).run()
  editor.view.focus()
}

// An empty doc still holds one blank paragraph; replace it instead of appending below it.
const append = (editor: Editor, content: JSONContent[]): void => {
  const end = editor.state.doc.content.size
  exec(editor, (c) =>
    c.insertContentAt(editor.isEmpty ? { from: 0, to: end } : end, content).focus('end')
  )
}

const text = (t: string, bold = false): JSONContent => ({
  type: 'text',
  text: t,
  ...(bold && { marks: [{ type: 'bold' }] })
})

const heading = (title: string): JSONContent => ({
  type: 'paragraph',
  content: [text(`• ${title}:`, true)]
})

export const insertSection = (editor: Editor, title: string): void =>
  append(editor, [
    heading(title),
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }
  ])

// Built as JSON, not HTML: the items come from a stored update and must land as plain text.
export const insertPlan = (editor: Editor, title: string, items: readonly string[]): void =>
  append(editor, [
    heading(title),
    {
      type: 'taskList',
      content: items.map((item) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [text(item)] }]
      }))
    }
  ])
