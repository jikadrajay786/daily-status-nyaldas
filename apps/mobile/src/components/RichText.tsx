import { richTree, textOf, type RichNode } from '@daily-status/core/richText'
import { useT } from '@daily-status/core/i18n'
import { Fragment, useMemo, type ReactNode } from 'react'
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native'
import type { Colors } from '@/lib/theme'
import { useTheme } from '@/lib/theme'

type El = Extract<RichNode, { type: 'el' }>

const BLOCKS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'div', 'label'])
const isBlock = (n: RichNode): boolean => n.type === 'el' && BLOCKS.has(n.tag)
const blank = (n: RichNode): boolean => n.type === 'text' && !n.text.trim()

const TEXT_COLOR: Record<string, keyof Colors> = {
  red: 'rcRed',
  orange: 'rcOrange',
  green: 'rcGreen',
  blue: 'rcBlue',
  purple: 'rcPurple'
}
const HIGHLIGHT: Record<string, keyof Colors> = {
  yellow: 'hlYellow',
  green: 'hlGreen',
  blue: 'hlBlue',
  pink: 'hlPink'
}

const inlineStyle = (n: El, c: Colors): TextStyle | undefined => {
  const color = n.attrs['data-color'] ?? ''
  switch (n.tag) {
    case 'strong':
      return { fontWeight: '600', color: c.fg }
    case 'em':
      return { fontStyle: 'italic' }
    case 'u':
      return { textDecorationLine: 'underline' }
    case 's':
      return { textDecorationLine: 'line-through', color: c.fg3 }
    case 'span':
      return TEXT_COLOR[color] ? { color: c[TEXT_COLOR[color]] } : undefined
    case 'mark':
      return HIGHLIGHT[color] ? { backgroundColor: c[HIGHLIGHT[color]] } : undefined
    case 'a':
      return { color: c.accentFg, textDecorationLine: 'underline' }
    default:
      return undefined
  }
}

// HTML collapses runs of whitespace; React Native would print them.
const inline = (nodes: RichNode[], c: Colors): ReactNode[] =>
  nodes.map((n, i) => {
    if (n.type === 'text') return n.text.replace(/\s+/g, ' ')
    if (n.tag === 'br') return '\n'
    const href = n.tag === 'a' ? n.attrs.href : undefined
    return (
      <Text
        key={i}
        style={inlineStyle(n, c)}
        // The tree only keeps http(s)/mailto hrefs; they open outside the app.
        {...(href && { accessibilityRole: 'link', onPress: () => void Linking.openURL(href) })}
      >
        {inline(n.children, c)}
      </Text>
    )
  })

// `strike` greys out a ticked checklist item; nested Text inherits it, so bold or coloured words keep their marks.
const Blocks = ({ nodes, strike = false }: { nodes: RichNode[]; strike?: boolean }): ReactNode => {
  const { colors: c } = useTheme()
  const { t } = useT()
  const base = [
    s.p,
    strike ? { color: c.fg3, textDecorationLine: 'line-through' as const } : { color: c.fg }
  ]
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
        <Text key={i} style={base}>
          {inline(group, c)}
        </Text>
      )
    switch (n.tag) {
      case 'p':
        return (
          <Text key={i} style={base}>
            {inline(n.children, c)}
          </Text>
        )
      case 'h2':
      case 'h3':
        return (
          <Text
            key={i}
            accessibilityRole="header"
            style={[n.tag === 'h2' ? s.h2 : s.h3, { color: c.fg }]}
          >
            {inline(n.children, c)}
          </Text>
        )
      case 'ul':
      case 'ol': {
        const task = n.attrs['data-type'] === 'taskList'
        const items = n.children.filter((li): li is El => li.type === 'el' && li.tag === 'li')
        return (
          <View key={i} style={[s.list, task && s.taskList]}>
            {items.map((li, j) => {
              const done = li.attrs['data-checked'] === 'true'
              const body = li.children.filter((m) => !(m.type === 'el' && m.tag === 'label'))
              return (
                <View
                  key={j}
                  style={s.item}
                  {...(task && {
                    accessible: true,
                    accessibilityLabel: t(done ? 'taskDone' : 'taskTodo', {
                      text: textOf(li).trim()
                    })
                  })}
                >
                  {task ? (
                    <View
                      style={[
                        s.box,
                        { borderColor: done ? c.accent : c.fg3 },
                        done && { backgroundColor: c.accent }
                      ]}
                    >
                      {done && <Text style={[s.tick, { color: c.onAccent }]}>✓</Text>}
                    </View>
                  ) : (
                    <Text style={[s.marker, n.tag === 'ul' && s.bullet, { color: c.fg2 }]}>
                      {n.tag === 'ol' ? `${j + 1}.` : '•'}
                    </Text>
                  )}
                  <View style={s.itemBody}>
                    <Blocks nodes={body} strike={strike || done} />
                  </View>
                </View>
              )
            })}
          </View>
        )
      }
      case 'blockquote':
        return (
          <View key={i} style={[s.quote, { borderLeftColor: c.line }]}>
            <Blocks nodes={n.children} strike={strike} />
          </View>
        )
      case 'hr':
        return <View key={i} style={[s.hr, { backgroundColor: c.line }]} />
      default:
        return <Fragment key={i}>{<Blocks nodes={n.children} strike={strike} />}</Fragment>
    }
  })
}

// Renders a stored update natively from core's sanitized tree: only allowlisted nodes can reach the screen.
export const RichText = ({ html }: { html: string }): React.JSX.Element => {
  const nodes = useMemo(() => richTree(html), [html])
  return (
    <View>
      <Blocks nodes={nodes} />
    </View>
  )
}

const s = StyleSheet.create({
  p: { fontSize: 15, lineHeight: 22, marginVertical: 2 },
  h2: { fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  h3: { fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  list: { marginVertical: 2 },
  taskList: { marginLeft: -2 },
  item: { flexDirection: 'row', gap: 8 },
  marker: { fontSize: 15, lineHeight: 22, minWidth: 16, textAlign: 'center' },
  bullet: { fontSize: 20 },
  box: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 4,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tick: { fontSize: 11, lineHeight: 13, fontWeight: '700' },
  itemBody: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: 12, marginVertical: 8 },
  hr: { height: StyleSheet.hairlineWidth * 2, marginVertical: 12 }
})
