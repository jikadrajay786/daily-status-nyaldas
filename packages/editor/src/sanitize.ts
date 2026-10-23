import DOMPurify from 'dompurify'
import { ALLOWED_ATTR, ALLOWED_TAGS, PALETTE, SAFE_HREF } from '@daily-status/core/richText'

// The allowlist lives in core so the mobile renderer enforces exactly the same markup.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (
    data.tagName === 'input' &&
    node instanceof Element &&
    node.getAttribute('type') !== 'checkbox'
  )
    node.remove()
})
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Feed links always open in the system browser (main's window-open handler), never inside the app.
  if (node.tagName === 'A') {
    if (!SAFE_HREF.test(node.getAttribute('href') ?? '')) node.removeAttribute('href')
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
  if (node.tagName === 'INPUT') node.setAttribute('disabled', '')
  const color = node.getAttribute('data-color')
  if (color && !PALETTE.has(color)) node.removeAttribute('data-color')
})

export const sanitize = (html: string): string =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    // DOMPurify tests most attribute values against this, not just URLs, so plain words like "taskList"
    // must pass; the SAFE_HREF hook above is what restricts links to http(s)/mailto.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  })
