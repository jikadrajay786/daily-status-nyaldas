import { Mark } from '@tiptap/core'
import { HIGHLIGHTS, TEXT_COLORS } from '@daily-status/core/richText'

// Colours are a fixed palette stored as data-color and styled in CSS, never inline style attributes,
// so the sanitizer can keep style off its allowlist entirely.
const colorMark = (name: string, tag: 'span' | 'mark', palette: readonly string[]): Mark =>
  Mark.create({
    name,
    addAttributes: () => ({
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color })
      }
    }),
    parseHTML: () => [
      {
        tag: `${tag}[data-color]`,
        getAttrs: (el) => (palette.includes(el.getAttribute('data-color') ?? '') ? null : false)
      }
    ],
    renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes, 0]
  })

export const TextColor = colorMark('textColor', 'span', TEXT_COLORS)
export const Highlight = colorMark('highlight', 'mark', HIGHLIGHTS)
