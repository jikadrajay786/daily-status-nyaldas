import { parseDocument } from 'htmlparser2'
import { LANG_LIST, translator } from './i18n'
import { getLastStatusBefore } from './statusService'

export const TEXT_COLORS = ['red', 'orange', 'green', 'blue', 'purple'] as const
export const HIGHLIGHTS = ['yellow', 'green', 'blue', 'pink'] as const
export const PALETTE: ReadonlySet<string> = new Set([...TEXT_COLORS, ...HIGHLIGHTS])
export const SAFE_HREF = /^(https?|mailto):/i

// Exactly the markup the editor can produce: anything missing here silently vanishes from cards, anything
// extra widens what a crafted row (written straight to the API) can inject. Desktop's DOMPurify and the
// mobile renderer both read these lists.
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'mark',
  'span',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'label',
  'input',
  'div'
] as const
export const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'data-type',
  'data-checked',
  'data-color',
  'type',
  'checked'
] as const

export type RichTag = (typeof ALLOWED_TAGS)[number]
export type RichAttr = (typeof ALLOWED_ATTR)[number]
export type RichNode =
  | { type: 'text'; text: string }
  | { type: 'el'; tag: RichTag; attrs: Partial<Record<RichAttr, string>>; children: RichNode[] }

type DomNode = ReturnType<typeof parseDocument>['children'][number]

const TAGS: ReadonlySet<string> = new Set(ALLOWED_TAGS)
const ATTRS: ReadonlySet<string> = new Set(ALLOWED_ATTR)
// DOMPurify's FORBID_CONTENTS: these lose their text too; any other unknown tag is unwrapped.
const DROP_CONTENT = new Set([
  'annotation-xml',
  'audio',
  'colgroup',
  'desc',
  'foreignobject',
  'head',
  'iframe',
  'math',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'script',
  'selectedcontent',
  'style',
  'svg',
  'template',
  'thead',
  'title',
  'video',
  'xmp'
])
const isTag = (t: string): t is RichTag => TAGS.has(t)
const isAttr = (a: string): a is RichAttr => ATTRS.has(a)

const keepAttr = (tag: RichTag, name: RichAttr, value: string): boolean =>
  name === 'href'
    ? tag === 'a' && SAFE_HREF.test(value)
    : name === 'data-color'
      ? PALETTE.has(value)
      : name !== 'target' && name !== 'rel'

const clean = (nodes: DomNode[]): RichNode[] =>
  nodes.flatMap((n): RichNode[] => {
    if (n.type === 'text') return [{ type: 'text', text: n.data }]
    if (!('name' in n) || !('children' in n)) return []
    const name = n.name.toLowerCase()
    if (DROP_CONTENT.has(name)) return []
    if (!isTag(name)) return clean(n.children)
    if (name === 'input' && n.attribs.type !== 'checkbox') return []
    const attrs = Object.fromEntries(
      Object.entries(n.attribs).flatMap(([k, v]) => {
        const a = k.toLowerCase()
        return isAttr(a) && keepAttr(name, a, v) ? [[a, v]] : []
      })
    )
    return [{ type: 'el', tag: name, attrs, children: clean(n.children) }]
  })

// The sanitized structure of a stored update. Platform-free, so the mobile app renders it without a WebView.
export const richTree = (html: string): RichNode[] => clean(parseDocument(html).children)

export const textOf = (n: RichNode): string =>
  n.type === 'text' ? n.text : n.children.map(textOf).join('')

const norm = (s: string): string => s.replace(/^[•\s]+|[:\s]+$/g, '').toLowerCase()

// Items of the last "Plan for tomorrow" list in an update, as plain text. `headings` covers every UI
// language because people switch languages between days.
export const extractPlan = (html: string, headings: readonly string[]): string[] => {
  const want = new Set(headings.map(norm))
  // Every p/h2/h3 at any depth in document order, with the element after it (text nodes skipped).
  const heads: { el: RichNode; next: RichNode | undefined }[] = []
  const walk = (nodes: RichNode[]): void =>
    nodes.forEach((n, i) => {
      if (n.type !== 'el') return
      if (n.tag === 'p' || n.tag === 'h2' || n.tag === 'h3')
        heads.push({ el: n, next: nodes.slice(i + 1).find((m) => m.type === 'el') })
      walk(n.children)
    })
  walk(richTree(html))
  const list = heads.findLast(({ el }) => want.has(norm(textOf(el))))?.next
  return list?.type === 'el' && (list.tag === 'ul' || list.tag === 'ol')
    ? list.children.flatMap((li) => (li.type === 'el' ? [textOf(li).trim()] : [])).filter(Boolean)
    : []
}

// The heading may have been written in any language the person used that day.
export const PLAN_HEADINGS = LANG_LIST.map((l) => translator(l)('chipPlan'))

// "Copy plan from last update": the list under the plan heading of the most recent earlier update.
export const loadPlanBefore = async (userId: string, date: string): Promise<string[]> => {
  const last = await getLastStatusBefore(userId, date)
  return last ? extractPlan(last.description, PLAN_HEADINGS) : []
}

export type Draft = { html: string; hours: string }

// Drafts live in user-writable storage and may hold an older shape, so parse defensively.
export const parseDraft = (raw: string | null): Draft | null => {
  try {
    const d: unknown = JSON.parse(raw ?? 'null')
    return typeof d === 'object' &&
      d !== null &&
      'html' in d &&
      typeof d.html === 'string' &&
      'hours' in d &&
      typeof d.hours === 'string'
      ? { html: d.html, hours: d.hours }
      : null
  } catch {
    return null
  }
}
