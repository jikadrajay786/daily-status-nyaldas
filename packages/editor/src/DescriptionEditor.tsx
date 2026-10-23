import { TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ClipboardList } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isLang, translator, useT, type Key, type Lang, type T } from '@daily-status/core/i18n'
import { errMsg } from '@daily-status/core/useQuery'
import { insertPlan, insertSection } from './commands'
import { LangPicker } from './LangPicker'
import { Highlight, TextColor } from './marks'
import { Toolbar } from './Toolbar'
import { lookup, pendingWord, pick, setWriteLang, Transliterate } from './transliterate'

const SAFE_URL = /^(https?:|mailto:)/i

// Every node and mark enabled here must be on ALLOWED_TAGS/ALLOWED_ATTR in packages/core/src/richText.ts.
// Code is off because the audience is non-technical; h1 is off so "# " can't create a heading cards would drop.
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      // Scheme-less input ("www.x.com") is fine; any explicit scheme other than http(s)/mailto is refused.
      isAllowedUri: (url) => SAFE_URL.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url)
    }
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
    // TipTap's default screen-reader label is English; <html lang> always holds the current UI language.
    a11y: {
      checkboxLabel: (node, checked) =>
        translator(isLang(document.documentElement.lang) ? document.documentElement.lang : 'en')(
          checked ? 'taskDone' : 'taskTodo',
          { text: node.textContent }
        )
    }
  }),
  TextColor,
  Highlight,
  Transliterate
]

const EXAMPLE = { hi: 'aaj → आज', gu: 'aaje → આજે' } as const satisfies Record<
  Exclude<Lang, 'en'>,
  string
>

const PRESETS = ['chipDid', 'chipProblems', 'chipPlan'] as const satisfies readonly Key[]

const attributes = (t: T, compact: boolean): Record<string, string> => ({
  'aria-label': t('editorLabel'),
  // Read back by the Placeholder extension, so a language switch only needs setOptions.
  'data-hint': t('editorPlaceholder'),
  // On a phone the writing area fills its box, so a tap anywhere in it starts typing.
  class: `rich px-3 py-2.5 text-sm text-fg ${compact ? 'min-h-full' : 'min-h-48'}`
})

const hintOf = (e: Editor): string => {
  const a = e.options.editorProps.attributes
  return typeof a === 'object' ? (a['data-hint'] ?? '') : ''
}

export type EditorChange = { html: string; empty: boolean; edited: boolean }

type Props = {
  initialHtml: string
  onChange: (c: EditorChange) => void
  loadPlan: () => Promise<string[]>
  // The saved "Write in" choice lives in each app's own storage.
  initialWriteLang: Lang
  onWriteLangChange: (l: Lang) => void
  // Phone layout (the mobile app's DOM component).
  compact?: boolean
  // Phone at rest: the writing area grows with its text instead of scrolling.
  grow?: boolean
}

// onChange is captured once at mount, so pass a stable callback such as a state setter.
export const DescriptionEditor = ({
  initialHtml,
  onChange,
  loadPlan,
  initialWriteLang,
  onWriteLangChange,
  compact = false,
  grow = false
}: Props): React.JSX.Element => {
  const { t } = useT()
  const [writeLang, setWrite] = useState(initialWriteLang)
  const [notice, setNotice] = useState<Key | null>(null)
  const editor = useEditor({
    extensions: [
      ...extensions,
      Placeholder.configure({ placeholder: ({ editor: e }) => hintOf(e) })
    ],
    content: initialHtml,
    editorProps: { attributes: attributes(t, compact) },
    onCreate: ({ editor: e }) => onChange({ html: e.getHTML(), empty: e.isEmpty, edited: false }),
    onUpdate: ({ editor: e }) => onChange({ html: e.getHTML(), empty: e.isEmpty, edited: true })
  })

  // Text set at creation must follow a language switch; an empty transaction repaints without touching content.
  useEffect(() => {
    editor.setOptions({ editorProps: { attributes: attributes(t, compact) } })
    editor.view.dispatch(editor.state.tr)
  }, [editor, t, compact])

  useEffect(() => {
    setWriteLang(editor, writeLang)
  }, [editor, writeLang])

  const { pending, words } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const p = pendingWord(e.state)
      return {
        pending: p && e.storage.transliterate.dismissed !== p.word ? p.word : null,
        words: e.getText().split(/\s+/).filter(Boolean).length
      }
    }
  })
  const [sugg, setSugg] = useState<{ id: string; options: string[] | null }>()
  const suggId = `${writeLang}:${pending}`
  useEffect(() => {
    if (writeLang === 'en' || !pending) return
    let live = true
    // Short debounce so fast typing doesn't send a request for every letter.
    const timer = setTimeout(
      () =>
        void lookup(writeLang, pending).then(
          (options) => live && setSugg({ id: `${writeLang}:${pending}`, options })
        ),
      120
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [writeLang, pending])
  const options = pending && sugg?.id === suggId ? sugg.options : undefined

  const chooseWriteLang = (l: Lang): void => {
    onWriteLangChange(l)
    setWrite(l)
    editor.view.focus()
  }

  const copyPlan = async (): Promise<void> => {
    try {
      const items = await loadPlan()
      setNotice(items.length ? null : 'noPlan')
      // Headings are content, so they follow the writing language; button labels follow the UI.
      if (items.length) insertPlan(editor, translator(writeLang)('planHeading'), items)
    } catch (err) {
      setNotice(errMsg(err))
    }
  }

  const chips = PRESETS.map((p) => (
    <button
      key={p}
      type="button"
      onClick={() => insertSection(editor, translator(writeLang)(p))}
      className="shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap text-accent-fg ring-1 ring-accent/40 hover:bg-accent/15"
    >
      + {t(p)}
    </button>
  ))
  const copyChip = (
    <button
      key="copy"
      type="button"
      onClick={copyPlan}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap text-ok-fg ring-1 ring-ok/30 hover:bg-ok/15"
    >
      <ClipboardList className="size-3.5" aria-hidden />
      {t('copyPlan')}
    </button>
  )

  return (
    // Phone: the page has a fixed height, so the writing area takes whatever the rows above leave.
    <div className={`flex flex-col gap-2 ${compact ? 'min-h-0 flex-1' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-fg-2">✍️ {t('writingIn')}</span>
        <div className={compact ? 'min-w-48 flex-1' : 'w-64 max-w-full'}>
          <LangPicker value={writeLang} onChange={chooseWriteLang} label={t('writingIn')} />
        </div>
      </div>
      {compact ? (
        // One sideways row, with the daily "copy yesterday's plan" first so it's never off screen.
        <div className="no-scrollbar -mx-px flex shrink-0 gap-2 overflow-x-auto p-px">
          {copyChip}
          {chips}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips}
          {copyChip}
        </div>
      )}
      {notice && <p className="text-xs text-warn-fg">{t(notice)}</p>}
      <div
        data-editor-box
        // clip, not hidden: a scroll container ignores its children's minimum heights, so large text could squeeze the
        // writing area to nothing; with clip the box grows instead and the page scrolls.
        className={`rounded-lg border border-line bg-field focus-within:border-accent-fg focus-within:ring-2 focus-within:ring-accent-fg/30 ${compact ? 'flex flex-1 flex-col overflow-clip' : 'overflow-hidden'}`}
      >
        <Toolbar editor={editor} compact={compact} />
        <EditorContent
          editor={editor}
          // contain:size stops the text from setting this area's size, so it scrolls instead of stretching the box.
          {...(compact && {
            className: `min-h-24 flex-1 ${grow ? '' : 'overflow-y-auto [contain:size]'}`
          })}
        />
        {writeLang !== 'en' && (
          <div
            aria-label={t('suggestions')}
            className="flex min-h-10 flex-wrap items-center gap-1.5 border-t border-line bg-panel px-3 py-1.5 text-xs"
          >
            {options === null ? (
              <span className="text-warn-fg">{t('typingOffline')}</span>
            ) : options?.length ? (
              options.map((o, i) => (
                <button
                  key={o}
                  type="button"
                  lang={writeLang}
                  // Keeps the editor focused so the cursor and pending word survive the click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(editor, o)}
                  className={`rounded-md px-2 py-1 text-sm ${i === 0 ? 'bg-accent/20 text-accent-fg' : 'text-fg-2 hover:bg-hover'}`}
                >
                  {o}
                </button>
              ))
            ) : (
              // On a phone the full hint only shows while the page is empty; after that the example is reminder enough.
              <span className="text-fg-3">
                {!(compact && words) && `${t(compact ? 'typingHintTouch' : 'typingHint')} `}
                <span className="text-fg-2">{EXAMPLE[writeLang]}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <p className="text-right text-xs text-fg-3">{t('wordCount', { n: words })}</p>
    </div>
  )
}
