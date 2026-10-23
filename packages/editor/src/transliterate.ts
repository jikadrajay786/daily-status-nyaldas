import { Extension } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/react'
import type { Lang } from '@daily-status/core/i18n'

type Pending = { from: number; to: number; word: string }
type Job = Pending & { id: number }
type Range = { from: number; to: number }
type PluginState = { jobs: Job[]; fresh: Range | null }
type Meta = { add?: Job; remove?: number; fresh?: Range | null }
type TransliterateStorage = { lang: Lang; dismissed: string | null }

declare module '@tiptap/core' {
  interface Storage {
    transliterate: TransliterateStorage
  }
}

const key = new PluginKey<PluginState>('transliterate')
// Space and punctuation arrive as text input: Android keyboards report their keydown as "Unidentified", so a
// keydown trigger never fires there. Enter is the only commit key, since it inserts a paragraph, not text.
const COMMIT_TEXT = /^[ .,?!;:]$/
const cache = new Map<string, string[]>()
const inflight = new Map<string, Promise<string[] | null>>()
let nextId = 0

const at = (v: unknown, i: number): unknown => (Array.isArray(v) ? v[i] : undefined)

// Google Input Tools is free but unofficial, so any failure resolves to null and the typed letters stay as they are.
export const lookup = (lang: Lang, word: string): Promise<string[] | null> => {
  const k = `${lang}:${word.toLowerCase()}`
  const hit = cache.get(k)
  if (hit) return Promise.resolve(hit)
  const req =
    inflight.get(k) ??
    fetch(
      `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${lang}-t-i0-und&num=5`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => r.json())
      .then((j: unknown) => {
        // Response shape: ["SUCCESS", [[word, [candidates…], …]]]
        const opts = at(at(at(j, 1), 0), 1)
        const list =
          at(j, 0) === 'SUCCESS' && Array.isArray(opts)
            ? opts.filter((o): o is string => typeof o === 'string')
            : []
        cache.set(k, list)
        return list
      })
      .catch(() => null)
      .finally(() => inflight.delete(k))
  inflight.set(k, req)
  return req
}

// The run of Latin letters ending at the cursor, if the cursor sits at the end of that word.
const wordAtCursor = (state: EditorState): Pending | null => {
  const { $from, empty } = state.selection
  if (!empty) return null
  const block = $from.parent
  // A word glued to @ . / : _ or a digit is part of an email, link or code; leave it in English.
  const m = block
    .textBetween(0, $from.parentOffset, undefined, ' ')
    .match(/(^|[^@./:_\dA-Za-z])([A-Za-z]+)$/)
  const word = m?.[2]
  const next = block.textBetween($from.parentOffset, block.content.size, undefined, ' ')
  return word && !/^[A-Za-z]/.test(next)
    ? { from: $from.pos - word.length, to: $from.pos, word }
    : null
}

// Only words typed in Hindi/Gujarati mode qualify, so old English text, pastes and words typed in
// English mode are never rewritten just because the cursor lands after them.
export const pendingWord = (state: EditorState): Pending | null => {
  const p = wordAtCursor(state)
  const fresh = key.getState(state)?.fresh
  return p && fresh?.from === p.from && fresh.to === p.to ? p : null
}

// insertText over a range keeps that range's marks, so a bold word stays bold once converted.
// closeHistory makes each conversion its own undo step, so Ctrl+Z right after brings the English letters back.
const replace = (view: EditorView, { from, to }: Pending, text: string): void =>
  view.dispatch(closeHistory(view.state.tr.insertText(text, from, to)))

export const pick = (editor: Editor, text: string): void => {
  const p = pendingWord(editor.state)
  if (p) replace(editor.view, p, text)
  editor.view.focus()
}

const convert = (view: EditorView, lang: Lang, p: Pending): void => {
  const first = cache.get(`${lang}:${p.word.toLowerCase()}`)?.[0]
  if (first) return replace(view, p, first)
  // Not fetched yet: let the key through now and swap the word in when the answer arrives.
  // The plugin state maps the job's range through every edit made in the meantime.
  const job = { ...p, id: nextId++ }
  view.dispatch(view.state.tr.setMeta(key, { add: job } satisfies Meta))
  void lookup(lang, p.word).then((opts) => {
    if (view.isDestroyed) return
    const live = key.getState(view.state)?.jobs.find((j) => j.id === job.id)
    const tr = view.state.tr.setMeta(key, { remove: job.id } satisfies Meta)
    const text = opts?.[0]
    if (live && text && view.state.doc.textBetween(live.from, live.to) === live.word)
      closeHistory(tr.insertText(text, live.from, live.to))
    view.dispatch(tr)
  })
}

export const Transliterate = Extension.create<object, TransliterateStorage>({
  name: 'transliterate',
  addStorage: () => ({ lang: 'en', dismissed: null }),
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<PluginState>({
        key,
        state: {
          init: () => ({ jobs: [], fresh: null }),
          apply: (tr, { jobs, fresh }) => {
            const meta: Meta | undefined = tr.getMeta(key)
            const map = <R extends Range>(r: R): R => ({
              ...r,
              from: tr.mapping.map(r.from, 1),
              to: tr.mapping.map(r.to, -1)
            })
            const mapped = jobs.filter((j) => j.id !== meta?.remove).map(map)
            return {
              jobs: meta?.add ? [...mapped, meta.add] : mapped,
              // Meta ranges are already in post-transaction coordinates.
              fresh: meta && 'fresh' in meta ? (meta.fresh ?? null) : fresh && map(fresh)
            }
          }
        },
        props: {
          // Tags typed letters (via the default transaction, so input rules and marks behave as usual).
          handleTextInput: (view, from, _to, text, deflt) => {
            if (storage.lang === 'en') return false
            if (COMMIT_TEXT.test(text)) {
              const p = pendingWord(view.state)
              if (!p) return false
              if (storage.dismissed === p.word) {
                storage.dismissed = null
                return false
              }
              // A cached conversion changes the word's length, so the default insert at `from` would land in the
              // wrong place: insert at the cursor, which the conversion moved to the end of the new word.
              convert(view, storage.lang, p)
              view.dispatch(view.state.tr.insertText(text))
              return true
            }
            if (!/^[A-Za-z]+$/.test(text)) return false
            const prev = key.getState(view.state)?.fresh
            const start = prev?.to === from ? prev.from : from
            view.dispatch(
              deflt().setMeta(key, {
                fresh: { from: start, to: from + text.length }
              } satisfies Meta)
            )
            return true
          },
          handleKeyDown: (view, e) => {
            const p = storage.lang === 'en' || e.isComposing ? null : pendingWord(view.state)
            if (!p) return false
            if (e.key === 'Escape') {
              storage.dismissed = p.word
              view.dispatch(view.state.tr)
              return true
            }
            if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return false
            if (storage.dismissed === p.word) storage.dismissed = null
            else convert(view, storage.lang, p)
            return false
          },
          handleDOMEvents: {
            // Clicking Submit blurs the editor first, so the last word is converted before saving.
            blur: (view) => {
              const p = storage.lang === 'en' ? null : pendingWord(view.state)
              if (p && storage.dismissed !== p.word) convert(view, storage.lang, p)
              return false
            }
          }
        }
      })
    ]
  }
})

export const setWriteLang = (editor: Editor, l: Lang): void => {
  editor.storage.transliterate.lang = l
}
