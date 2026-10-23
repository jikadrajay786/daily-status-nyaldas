import { isLang, type Lang } from '@daily-status/core/i18n'
import type { EditorChange } from '@daily-status/editor/DescriptionEditor'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject
} from 'react'
import { Keyboard, Platform, useWindowDimensions, type ScrollViewInstance } from 'react-native'
import type { EditorHandle } from '@/dom/EditorPage'
import { prefs } from './storage'

// The "Write in" choice, shared by every editor screen so a change in one reaches the others.
let writeLang: Lang | null = null
const listeners = new Set<() => void>()
const readWriteLang = (fallback: Lang): Lang => {
  if (writeLang) return writeLang
  const saved = prefs.get('writeLang')
  return isLang(saved) ? saved : fallback
}
export const setWriteLang = (l: Lang): void => {
  writeLang = l
  prefs.set('writeLang', l)
  listeners.forEach((f) => f())
}
export const useWriteLang = (fallback: Lang): Lang =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => readWriteLang(fallback)
  )

// Editor changes live in a ref, not state: each re-render re-sends every prop into the WebView.
export type EditorContent = {
  editor: RefObject<EditorHandle | null>
  content: RefObject<EditorChange>
  onChange: (c: EditorChange) => Promise<void>
  flush: () => Promise<EditorChange>
}

export const useEditorContent = (onEdit?: (c: EditorChange) => void): EditorContent => {
  const content = useRef<EditorChange>({ html: '', empty: true, edited: false })
  const editor = useRef<EditorHandle>(null)
  const next = useRef<() => void>(undefined)
  const onChange = async (c: EditorChange): Promise<void> => {
    content.current = c
    next.current?.()
    if (c.edited) onEdit?.(c)
  }
  // Blurring converts a last "Write in" word; wait for that change, or give up quickly if there was none.
  const flush = async (): Promise<EditorChange> => {
    await Promise.race([
      new Promise<void>((r) => {
        next.current = r
        editor.current?.blur()
      }),
      new Promise((r) => setTimeout(r, 600))
    ])
    next.current = undefined
    Keyboard.dismiss()
    return content.current
  }
  return { editor, content, onChange, flush }
}

// Android 14+ grows large text less than small (non-linear font scaling), so its 2x setting puts native body text
// at about 1.5x; a plain 2x in the WebView would dwarf everything around it. iOS scales linearly, like this.
export const editorFontScale = (fontScale: number): number =>
  Platform.OS === 'android' ? Math.min(fontScale, 1.5) : fontScale

export type EditorFit = {
  height: number
  // The page's minimum height at rest, so a short update still gets a roomy box.
  rest: number
  typing: boolean
  onEditorFocus: (focused: boolean, boxTop: number) => Promise<void>
  onContentHeight: (h: number) => Promise<void>
}

// Two modes. At rest the WebView grows with its text, so nothing scrolls inside it and a drag anywhere on it scrolls
// the screen (the page sets nestedScrollEnabled from `typing`). While the writing area has focus and the keyboard is
// up, the page instead sizes its box to exactly fill the space above the keyboard and scrolls inside it, and the
// screen scrolls to that box: the cursor, toolbar and Write-in suggestions all stay in view.
export const useEditorFit = (
  scroll: RefObject<ScrollViewInstance | null>,
  // Where the WebView starts in the screen's scroll content.
  editorY: () => number
): EditorFit => {
  const { height } = useWindowDimensions()
  // Room between the top of the scroll view and the keyboard; 0 while the keyboard is down. Measured rather than
  // computed, so a navigation header above the screen (the admin edit screen) is accounted for.
  const [room, setRoom] = useState(0)
  const [boxTop, setBoxTop] = useState<number | null>(null)
  const [content, setContent] = useState(0)
  useEffect(() => {
    const subs = [
      Keyboard.addListener('keyboardDidShow', (e) =>
        scroll.current?.measureInWindow((_x, y) => setRoom(e.endCoordinates.screenY - y))
      ),
      Keyboard.addListener('keyboardDidHide', () => setRoom(0))
    ]
    return () => subs.forEach((sub) => sub.remove())
  }, [scroll])
  const typing = boxTop !== null && room > 0
  const toBox = useEffectEvent((at: number) => scroll.current?.scrollTo({ y: editorY() + at - 8 }))
  useEffect(() => {
    if (!typing) return
    toBox(boxTop)
    // Again once the keyboard padding and the WebView's new height have landed: the first can be clamped short.
    const t = setTimeout(() => toBox(boxTop), 250)
    return () => clearTimeout(t)
  }, [typing, boxTop])
  const rest = Math.round(Math.max(420, height * 0.6))
  return {
    height: typing ? boxTop + Math.max(200, room - 16) : Math.max(rest, content),
    rest,
    typing,
    onEditorFocus: async (focused, at) => setBoxTop(focused ? at : null),
    onContentHeight: async (h) => setContent(h)
  }
}
