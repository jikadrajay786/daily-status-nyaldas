// Shows a container's scrollbar while it scrolls (wheel, trackpad, keyboard), not only while hovered.
// Scroll events don't bubble, so one capturing listener on the document sees every scroller.
const timers = new WeakMap<Element, number>()

export const initScrollbars = (): void =>
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target instanceof Element ? e.target : document.documentElement
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '')
      clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute('data-scrolling'), 800)
      )
    },
    { capture: true, passive: true }
  )
