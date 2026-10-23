import { useEditorState, type ChainedCommands, type Editor } from '@tiptap/react'
import {
  Baseline,
  Bold,
  Ellipsis,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  SeparatorHorizontal,
  Sticker,
  Strikethrough,
  Underline,
  Undo2,
  X,
  type LucideIcon
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useT, type Key } from '@daily-status/core/i18n'
import { HIGHLIGHTS, TEXT_COLORS } from '@daily-status/core/richText'
import { exec } from './commands'

const MAC = navigator.userAgent.includes('Mac')
const MOD = MAC ? '⌘' : 'Ctrl+'
const SHIFT = MAC ? '⇧' : 'Shift+'

type Tool = {
  id: string
  icon: LucideIcon
  label: Key
  keys?: string
  run: (c: ChainedCommands, e: Editor) => ChainedCommands
  on?: (e: Editor) => boolean
  can?: (e: Editor) => boolean
}

// Indent/outdent must target the item type of whichever list the cursor is in.
const item = (e: Editor): string => (e.isActive('taskItem') ? 'taskItem' : 'listItem')
const is = (name: string) => (e: Editor) => e.isActive(name)

const HISTORY: readonly Tool[] = [
  {
    id: 'undo',
    icon: Undo2,
    label: 'undo',
    keys: `${MOD}Z`,
    run: (c) => c.undo(),
    can: (e) => e.can().undo()
  },
  {
    id: 'redo',
    icon: Redo2,
    label: 'redo',
    keys: MAC ? `${MOD}${SHIFT}Z` : `${MOD}Y`,
    run: (c) => c.redo(),
    can: (e) => e.can().redo()
  }
]
const MARKS: readonly Tool[] = [
  {
    id: 'bold',
    icon: Bold,
    label: 'bold',
    keys: `${MOD}B`,
    run: (c) => c.toggleBold(),
    on: is('bold')
  },
  {
    id: 'italic',
    icon: Italic,
    label: 'italic',
    keys: `${MOD}I`,
    run: (c) => c.toggleItalic(),
    on: is('italic')
  },
  {
    id: 'underline',
    icon: Underline,
    label: 'underline',
    keys: `${MOD}U`,
    run: (c) => c.toggleUnderline(),
    on: is('underline')
  },
  {
    id: 'strike',
    icon: Strikethrough,
    label: 'strike',
    keys: `${MOD}${SHIFT}S`,
    run: (c) => c.toggleStrike(),
    on: is('strike')
  }
]
const LISTS: readonly Tool[] = [
  {
    id: 'bullets',
    icon: List,
    label: 'bullets',
    keys: `${MOD}${SHIFT}8`,
    run: (c) => c.toggleBulletList(),
    on: is('bulletList')
  },
  {
    id: 'numbers',
    icon: ListOrdered,
    label: 'numbers',
    keys: `${MOD}${SHIFT}7`,
    run: (c) => c.toggleOrderedList(),
    on: is('orderedList')
  },
  {
    id: 'checklist',
    icon: ListChecks,
    label: 'checklist',
    keys: `${MOD}${SHIFT}9`,
    run: (c) => c.toggleTaskList(),
    on: is('taskList')
  },
  {
    id: 'outdent',
    icon: ListIndentDecrease,
    label: 'outdent',
    keys: `${SHIFT}Tab`,
    run: (c, e) => c.liftListItem(item(e)),
    can: (e) => e.can().liftListItem(item(e))
  },
  {
    id: 'indent',
    icon: ListIndentIncrease,
    label: 'indent',
    keys: 'Tab',
    run: (c, e) => c.sinkListItem(item(e)),
    can: (e) => e.can().sinkListItem(item(e))
  }
]
const BLOCKS: readonly Tool[] = [
  {
    id: 'quote',
    icon: Quote,
    label: 'quote',
    keys: `${MOD}${SHIFT}B`,
    run: (c) => c.toggleBlockquote(),
    on: is('blockquote')
  },
  { id: 'divider', icon: SeparatorHorizontal, label: 'divider', run: (c) => c.setHorizontalRule() }
]
const ALL = [...HISTORY, ...MARKS, ...LISTS, ...BLOCKS]
// The phone's main row fits a narrow screen without scrolling; everything else waits behind "More".
const pick = (ids: readonly string[]): Tool[] => ids.flatMap((id) => ALL.filter((t) => t.id === id))
const PHONE_MAIN = pick(['undo', 'bold', 'italic', 'bullets', 'numbers', 'checklist'])
const PHONE_MORE = pick(['redo', 'underline', 'strike', 'outdent', 'indent', 'quote', 'divider'])

const COLOR_NAMES: Record<string, Key> = {
  red: 'cRed',
  orange: 'cOrange',
  green: 'cGreen',
  blue: 'cBlue',
  purple: 'cPurple',
  yellow: 'cYellow',
  pink: 'cPink'
}

const ICONS = [
  ['✅', 'iconDone'],
  ['⏳', 'iconProgress'],
  ['⚠️', 'iconProblem'],
  ['📅', 'iconMeeting'],
  ['📞', 'iconCall'],
  ['💡', 'iconIdea'],
  ['🎯', 'iconGoal']
] as const satisfies readonly (readonly [string, Key])[]

// Bare domains get https://, bare emails get mailto:; any other scheme is refused.
const SCHEMES: readonly [RegExp, (v: string) => string][] = [
  [/^(https?:\/\/|mailto:)/i, (v) => v],
  [/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/, (v) => `mailto:${v}`],
  [/^[\w-]+(\.[\w-]+)+/, (v) => `https://${v}`]
]

const toUrl = (raw: string): string | null => {
  const v = raw.trim()
  const href = SCHEMES.find(([re]) => re.test(v))?.[1](v)
  try {
    return href && /^(https?|mailto):$/.test(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}

type Panel = 'textColor' | 'highlight' | 'link' | 'icons' | null

const Btn = ({
  icon: Icon,
  label,
  on,
  disabled = false,
  compact = false,
  onClick
}: {
  icon: LucideIcon
  label: string
  on?: boolean
  disabled?: boolean
  compact?: boolean
  onClick: () => void
}): React.JSX.Element => (
  <button
    type="button"
    title={label}
    aria-label={label}
    {...(on !== undefined && { 'aria-pressed': on })}
    disabled={disabled}
    // On a phone a tap would move focus to the button and drop the keyboard; keep it in the editor.
    {...(compact && { onMouseDown: (e: React.MouseEvent) => e.preventDefault() })}
    onClick={onClick}
    className={`grid shrink-0 place-items-center rounded-md transition-colors disabled:opacity-30 ${compact ? 'size-11' : 'size-8'} ${
      on ? 'bg-accent/20 text-accent-fg' : 'text-fg-2 enabled:hover:bg-hover enabled:hover:text-fg'
    }`}
  >
    <Icon className={compact ? 'size-5' : 'size-4'} aria-hidden />
  </button>
)

const Sep = (): React.JSX.Element => <span className="mx-1 h-5 w-px shrink-0 bg-line" />

const PanelRow = ({
  children,
  onClose,
  closeLabel
}: {
  children: ReactNode
  onClose: () => void
  closeLabel: string
}): React.JSX.Element => (
  <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2 text-xs text-fg-2">
    {children}
    <button
      type="button"
      aria-label={closeLabel}
      title={closeLabel}
      onClick={onClose}
      className="ml-auto rounded-md p-1 text-fg-2 hover:bg-hover"
    >
      <X className="size-4" aria-hidden />
    </button>
  </div>
)

// `compact` is the phone layout: a short main row of 44px buttons plus a "More" row, no keyboard shortcuts in labels.
export const Toolbar = ({
  editor,
  compact = false
}: {
  editor: Editor
  compact?: boolean
}): React.JSX.Element => {
  const { t } = useT()
  const [panel, setPanel] = useState<Panel>(null)
  const [more, setMore] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState(false)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      on: Object.fromEntries(ALL.map((tool) => [tool.id, tool.on?.(e) ?? false])),
      off: Object.fromEntries(ALL.map((tool) => [tool.id, tool.can ? !tool.can(e) : false])),
      style: e.isActive('heading', { level: 2 })
        ? 'h2'
        : e.isActive('heading', { level: 3 })
          ? 'h3'
          : 'p',
      textColor: String(e.getAttributes('textColor').color ?? ''),
      highlight: String(e.getAttributes('highlight').color ?? ''),
      link: String(e.getAttributes('link').href ?? '')
    })
  })

  const toggle = (p: Exclude<Panel, null>): void => {
    if (p === 'link') {
      setUrl(s.link)
      setUrlError(false)
    }
    setPanel(panel === p ? null : p)
  }
  const done = (fn: (c: ChainedCommands) => ChainedCommands): void => {
    exec(editor, fn)
    setPanel(null)
  }
  const label = (tool: Tool): string =>
    tool.keys && !compact ? `${t(tool.label)} (${tool.keys})` : t(tool.label)
  const tools = (list: readonly Tool[]): ReactNode =>
    list.map((tool) => (
      <Btn
        key={tool.id}
        icon={tool.icon}
        label={label(tool)}
        {...(tool.on && { on: s.on[tool.id] ?? false })}
        disabled={s.off[tool.id] ?? false}
        compact={compact}
        onClick={() => exec(editor, (c) => tool.run(c, editor))}
      />
    ))

  const applyLink = (): void => {
    const href = toUrl(url)
    if (!href) return setUrlError(true)
    done((c) =>
      editor.state.selection.empty && !s.link
        ? c.insertContent([
            { type: 'text', text: url.trim(), marks: [{ type: 'link', attrs: { href } }] },
            { type: 'text', text: ' ' }
          ])
        : c.extendMarkRange('link').setLink({ href })
    )
  }

  const colors = (mark: 'textColor' | 'highlight', palette: readonly string[]): ReactNode => (
    <>
      <span className="font-medium">{t(mark)}:</span>
      <button
        type="button"
        onClick={() => done((c) => c.unsetMark(mark))}
        className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-hover"
      >
        {t('noColor')}
      </button>
      {palette.map((color) => (
        <button
          key={color}
          type="button"
          title={t(COLOR_NAMES[color] ?? 'noColor')}
          aria-label={t(COLOR_NAMES[color] ?? 'noColor')}
          aria-pressed={s[mark] === color}
          onClick={() => done((c) => c.setMark(mark, { color }))}
          className={`${compact ? 'size-9' : 'size-6'} rounded-full ring-2 forced-color-adjust-none ${s[mark] === color ? 'ring-fg' : 'ring-transparent hover:ring-fg-3'}`}
          // Same CSS variables as the .rich palette, so a swatch always matches the colour it applies.
          style={{ background: `var(--${mark === 'textColor' ? 'rc' : 'hl'}-${color})` }}
        />
      ))}
    </>
  )

  const styleSelect = (
    <select
      aria-label={t('textStyle')}
      title={t('textStyle')}
      value={s.style}
      onChange={(e) => {
        const v = e.target.value
        exec(editor, (c) =>
          v === 'p' ? c.setParagraph() : c.setHeading({ level: v === 'h2' ? 2 : 3 })
        )
      }}
      className={`shrink-0 rounded-md border border-line bg-field px-2 text-xs text-fg ${compact ? 'h-11' : 'h-8'}`}
    >
      <option value="p">{t('styleNormal')}</option>
      <option value="h2">{t('styleHeading')}</option>
      <option value="h3">{t('styleSubheading')}</option>
    </select>
  )
  const colorBtns = (
    <>
      <Btn
        icon={Baseline}
        label={t('textColor')}
        on={panel === 'textColor' || !!s.textColor}
        compact={compact}
        onClick={() => toggle('textColor')}
      />
      <Btn
        icon={Highlighter}
        label={t('highlight')}
        on={panel === 'highlight' || !!s.highlight}
        compact={compact}
        onClick={() => toggle('highlight')}
      />
    </>
  )
  const linkBtn = (
    <Btn
      icon={Link}
      label={t('link')}
      on={panel === 'link' || !!s.link}
      compact={compact}
      onClick={() => toggle('link')}
    />
  )
  const iconsBtn = (
    <Btn
      icon={Sticker}
      label={t('icons')}
      on={panel === 'icons'}
      compact={compact}
      onClick={() => toggle('icons')}
    />
  )
  const clearBtn = (
    <Btn
      icon={RemoveFormatting}
      label={t('clearFormatting')}
      compact={compact}
      onClick={() => exec(editor, (c) => c.unsetAllMarks().clearNodes())}
    />
  )

  return (
    <>
      {compact ? (
        <div
          role="toolbar"
          aria-label={t('formatting')}
          className="sticky top-0 z-10 border-b border-line bg-panel"
        >
          <div className="flex items-center justify-between gap-0.5 overflow-x-auto px-1 py-1">
            {tools(PHONE_MAIN)}
            <Btn
              icon={Ellipsis}
              label={t('moreFormatting')}
              on={more}
              compact
              onClick={() => setMore(!more)}
            />
          </div>
          {more && (
            <div className="flex flex-wrap items-center gap-0.5 border-t border-line px-1 py-1">
              {styleSelect}
              {tools(PHONE_MORE)}
              {colorBtns}
              {linkBtn}
              {iconsBtn}
              {clearBtn}
            </div>
          )}
        </div>
      ) : (
        <div
          role="toolbar"
          aria-label={t('formatting')}
          className="flex flex-wrap items-center gap-0.5 border-b border-line bg-panel px-2 py-1.5"
        >
          {tools(HISTORY)}
          <Sep />
          {styleSelect}
          <Sep />
          {tools(MARKS)}
          {colorBtns}
          <Sep />
          {tools(LISTS)}
          <Sep />
          {linkBtn}
          {tools(BLOCKS)}
          {iconsBtn}
          <Sep />
          {clearBtn}
        </div>
      )}

      {panel === 'textColor' && (
        <PanelRow onClose={() => setPanel(null)} closeLabel={t('close')}>
          {colors('textColor', TEXT_COLORS)}
        </PanelRow>
      )}
      {panel === 'highlight' && (
        <PanelRow onClose={() => setPanel(null)} closeLabel={t('close')}>
          {colors('highlight', HIGHLIGHTS)}
        </PanelRow>
      )}
      {panel === 'icons' && (
        <PanelRow onClose={() => setPanel(null)} closeLabel={t('close')}>
          {ICONS.map(([emoji, key]) => (
            <button
              key={key}
              type="button"
              onClick={() => done((c) => c.insertContent(`${emoji} `))}
              className="rounded-md px-2 py-1 ring-1 ring-line hover:bg-hover"
            >
              {emoji} {t(key)}
            </button>
          ))}
        </PanelRow>
      )}
      {panel === 'link' && (
        <PanelRow onClose={() => setPanel(null)} closeLabel={t('close')}>
          {/* Not a <form>: it would nest inside the status form, and React bubbles submit up to it. */}
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setUrlError(false)
              }}
              placeholder={t('linkPlaceholder')}
              aria-label={t('link')}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                applyLink()
              }}
              className="min-w-64 flex-1 rounded-md border border-line bg-field px-2 py-1.5 text-xs text-fg placeholder:text-placeholder focus:border-accent-fg focus:ring-1 focus:ring-accent-fg focus:outline-hidden"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-md bg-accent px-2.5 py-1.5 font-medium text-on-accent hover:bg-accent-hover"
            >
              {t('linkApply')}
            </button>
            {s.link && (
              <button
                type="button"
                onClick={() => done((c) => c.extendMarkRange('link').unsetLink())}
                className="rounded-md px-2.5 py-1.5 text-bad-fg ring-1 ring-bad/30 hover:bg-bad/10"
              >
                {t('linkRemove')}
              </button>
            )}
            {urlError && <span className="w-full text-bad-fg">{t('linkInvalid')}</span>}
          </div>
        </PanelRow>
      )}
    </>
  )
}
