'use dom'
// The shared desktop editor running in a WebView. Supabase stays native: plan items arrive through loadPlan.
import { I18nContext, LOCALE, translator, type I18n, type Lang } from '@daily-status/core/i18n'
import { DescriptionEditor, type EditorChange } from '@daily-status/editor/DescriptionEditor'
import { sanitize } from '@daily-status/editor/sanitize'
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom'
import { useEffect, useLayoutEffect, useMemo, useRef, type Ref } from 'react'
import './editor.css'

export type EditorHandle = DOMImperativeFactory & {
  // Tapping a native button leaves focus in the WebView; blurring makes the editor convert a pending
  // "Write in" word, which then arrives through onChange.
  blur: () => void
}

type Props = {
  ref: Ref<EditorHandle>
  // Changing it remounts the editor (not the WebView) with initialHtml, e.g. on a new date.
  docKey: string
  initialHtml: string
  lang: Lang
  vars: Record<string, string>
  fontScale: number
  initialWriteLang: Lang
  onWriteLangChange: (l: Lang) => Promise<void>
  onChange: (c: EditorChange) => Promise<void>
  loadPlan: () => Promise<string[]>
  // Focus moving into or out of the editor box, with where the box starts on the page (CSS px).
  onEditorFocus: (focused: boolean, boxTop: number) => Promise<void>
  // Typing: the page fills the WebView and the writing area scrolls. At rest: the page is at least minHeight (px)
  // and grows with its text, reporting its height so the WebView can match it.
  typing: boolean
  minHeight: number
  onContentHeight: (h: number) => Promise<void>
  dom?: DOMProps
}

export default function EditorPage({
  ref,
  docKey,
  initialHtml,
  lang,
  vars,
  fontScale,
  initialWriteLang,
  onWriteLangChange,
  onChange,
  loadPlan,
  onEditorFocus,
  typing,
  minHeight,
  onContentHeight
}: Props): React.JSX.Element {
  // Before paint, so the page never flashes unthemed. lang also drives checklist screen-reader labels.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.lang = lang
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    // Rem-based sizes follow the phone's text size setting.
    root.style.fontSize = `${16 * fontScale}px`
  }, [lang, vars, fontScale])

  useEffect(() => {
    // Only the editor box (writing area, link box): tapping a chip or the language picker shouldn't move the screen.
    const box = (): Element | null => document.querySelector('[data-editor-box]')
    const inBox = (t: EventTarget | null): boolean => t instanceof Node && !!box()?.contains(t)
    const report = (focused: boolean): void =>
      void onEditorFocus(focused, (box()?.getBoundingClientRect().top ?? 0) + window.scrollY)
    const focus = (e: FocusEvent): void => {
      if (inBox(e.target)) report(true)
    }
    // Moving between the writing area and the link box keeps the editor fitted above the keyboard.
    const blur = (e: FocusEvent): void => {
      if (inBox(e.target) && !inBox(e.relatedTarget)) report(false)
    }
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', blur)
    return () => {
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', blur)
    }
  }, [onEditorFocus])

  useLayoutEffect(() => void document.documentElement.toggleAttribute('data-fit', typing), [typing])

  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = page.current
    if (typing || !el) return
    let [last, frame] = [0, 0]
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const h = Math.ceil(el.getBoundingClientRect().height)
        if (h !== last) void onContentHeight((last = h))
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [typing, onContentHeight])

  useEffect(() => {
    if (!typing) return
    // The writing area turns into a scroller that starts at the top; once the WebView has its new size, bring the
    // caret back into view (someone may have tapped a line far down a long update).
    const show = (): void =>
      window.getSelection()?.focusNode?.parentElement?.scrollIntoView({ block: 'nearest' })
    show()
    window.addEventListener('resize', show)
    return () => window.removeEventListener('resize', show)
  }, [typing])

  useDOMImperativeHandle(
    ref,
    () => ({
      blur: () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      }
    }),
    []
  )

  const i18n = useMemo<I18n>(
    () => ({ lang, locale: LOCALE[lang], t: translator(lang), setLang: () => {} }),
    [lang]
  )

  return (
    <I18nContext value={i18n}>
      {/* Expo's root is a flex container that sizes children to their content; pin the editor to the page. */}
      <div
        ref={page}
        className={`flex w-full min-w-0 flex-col p-px ${typing ? 'h-full' : ''}`}
        style={typing ? undefined : { minHeight }}
      >
        <DescriptionEditor
          key={docKey}
          compact
          grow={!typing}
          // Stored HTML may be someone else's (admin edits): clean it like every rendered card.
          initialHtml={sanitize(initialHtml)}
          onChange={(c) => void onChange(c)}
          loadPlan={loadPlan}
          initialWriteLang={initialWriteLang}
          onWriteLangChange={(l) => void onWriteLangChange(l)}
        />
      </div>
    </I18nContext>
  )
}
