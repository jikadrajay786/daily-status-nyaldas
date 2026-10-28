import { richTree, textOf, type RichNode } from '@daily-status/core/richText'
import { useT } from '@daily-status/core/i18n'
import { Fragment, useMemo, type ReactNode } from 'react'
import { Linking, StyleSheet } from 'react-native'
import { Box } from './gs/box'
import { HStack } from './gs/hstack'
import { Text } from './gs/text'

type El = Extract<RichNode, { type: 'el' }>

const BLOCKS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'div', 'label'])
const isBlock = (n: RichNode): boolean => n.type === 'el' && BLOCKS.has(n.tag)
const blank = (n: RichNode): boolean => n.type === 'text' && !n.text.trim()

// Fixed classes per allowed data-color, so Tailwind's scanner sees each one.
const TEXT_COLOR: Record<string, string> = {
  red: 'text-rc-red',
  orange: 'text-rc-orange',
  green: 'text-rc-green',
  blue: 'text-rc-blue',
  purple: 'text-rc-purple'
}
const HIGHLIGHT: Record<string, string> = {
  yellow: 'bg-hl-yellow',
  green: 'bg-hl-green',
  blue: 'bg-hl-blue',
  pink: 'bg-hl-pink'
}

const inlineClass = (n: El): string | undefined => {
  const color = n.attrs['data-color'] ?? ''
  switch (n.tag) {
    case 'strong':
      return 'font-semibold text-fg'
    case 'em':
      return 'italic'
    case 'u':
      return 'underline'
    case 's':
      return 'line-through text-fg-3'
    case 'span':
      return TEXT_COLOR[color]
    case 'mark':
      return HIGHLIGHT[color]
    case 'a':
      return 'text-accent-fg underline'
    default:
      return undefined
  }
}

// HTML collapses runs of whitespace; React Native would print them.
const inline = (nodes: RichNode[]): ReactNode[] =>
  nodes.map((n, i) => {
    if (n.type === 'text') return n.text.replace(/\s+/g, ' ')
    if (n.tag === 'br') return '\n'
    const href = n.tag === 'a' ? n.attrs.href : undefined
    return (
      <Text
        key={i}
        className={inlineClass(n)}
        // The tree only keeps http(s)/mailto hrefs; they open outside the app.
        {...(href && { accessibilityRole: 'link', onPress: () => void Linking.openURL(href) })}
      >
        {inline(n.children)}
      </Text>
    )
  })

// `strike` greys out a ticked checklist item; nested Text inherits it, so bold or coloured words keep their marks.
const Blocks = ({ nodes, strike = false }: { nodes: RichNode[]; strike?: boolean }): ReactNode => {
  const { t } = useT()
  const base = `my-0.5 text-[15px] leading-[22px] ${strike ? 'text-fg-3 line-through' : 'text-fg'}`
  // Consecutive inline nodes share one Text, like an anonymous block box in HTML.
  const groups = nodes
    .filter((n) => !blank(n))
    .reduce<RichNode[][]>((acc, n) => {
      const last = acc.at(-1)
      if (!isBlock(n) && last && !isBlock(last[0]!)) last.push(n)
      else acc.push([n])
      return acc
    }, [])

  return groups.map((group, i) => {
    const n = group[0]!
    if (!isBlock(n) || n.type !== 'el')
      return (
        <Text key={i} className={base}>
          {inline(group)}
        </Text>
      )
    switch (n.tag) {
      case 'p':
        return (
          <Text key={i} className={base}>
            {inline(n.children)}
          </Text>
        )
      case 'h2':
      case 'h3':
        return (
          <Text
            key={i}
            accessibilityRole="header"
            className={`font-semibold text-fg ${n.tag === 'h2' ? 'mt-3 mb-1 text-[18px]' : 'mt-2 mb-1 text-[16px]'}`}
          >
            {inline(n.children)}
          </Text>
        )
      case 'ul':
      case 'ol': {
        const task = n.attrs['data-type'] === 'taskList'
        const items = n.children.filter((li): li is El => li.type === 'el' && li.tag === 'li')
        return (
          <Box key={i} className={`my-0.5 ${task ? '-ml-0.5' : ''}`}>
            {items.map((li, j) => {
              const done = li.attrs['data-checked'] === 'true'
              const body = li.children.filter((m) => !(m.type === 'el' && m.tag === 'label'))
              return (
                <HStack
                  key={j}
                  className="gap-2"
                  {...(task && {
                    accessible: true,
                    accessibilityLabel: t(done ? 'taskDone' : 'taskTodo', {
                      text: textOf(li).trim()
                    })
                  })}
                >
                  {task ? (
                    <Box
                      className={`mt-[3px] h-4 w-4 items-center justify-center rounded border-[1.5px] ${done ? 'border-accent bg-accent' : 'border-fg-3'}`}
                    >
                      {done && (
                        <Text className="text-[11px] leading-[13px] font-bold text-on-accent">
                          ✓
                        </Text>
                      )}
                    </Box>
                  ) : (
                    <Text
                      className={`min-w-4 text-center leading-[22px] text-fg-2 ${n.tag === 'ul' ? 'text-[20px]' : 'text-[15px]'}`}
                    >
                      {n.tag === 'ol' ? `${j + 1}.` : '•'}
                    </Text>
                  )}
                  <Box className="flex-1">
                    <Blocks nodes={body} strike={strike || done} />
                  </Box>
                </HStack>
              )
            })}
          </Box>
        )
      }
      case 'blockquote':
        return (
          <Box key={i} className="my-2 border-l-[3px] border-line pl-3">
            <Blocks nodes={n.children} strike={strike} />
          </Box>
        )
      case 'hr':
        // Twice the hairline width: a class can give one hairline, not a multiple of it.
        return (
          <Box key={i} className="my-3 bg-line" style={{ height: StyleSheet.hairlineWidth * 2 }} />
        )
      default:
        return <Fragment key={i}>{<Blocks nodes={n.children} strike={strike} />}</Fragment>
    }
  })
}

// Renders a stored update natively from core's sanitized tree: only allowlisted nodes can reach the screen.
export const RichText = ({ html }: { html: string }): React.JSX.Element => {
  const nodes = useMemo(() => richTree(html), [html])
  return (
    <Box>
      <Blocks nodes={nodes} />
    </Box>
  )
}
