import { describe, expect, it } from 'vitest'
import {
  extractPlan,
  parseDraft,
  PLAN_HEADINGS,
  richTree,
  textOf,
  type RichNode
} from '../src/richText'

// Compact view of a tree: tags with kept attributes, text as-is.
const show = (nodes: RichNode[]): string =>
  nodes
    .map((n) =>
      n.type === 'text'
        ? n.text
        : `<${n.tag}${Object.entries(n.attrs)
            .map(([k, v]) => ` ${k}="${v}"`)
            .join('')}>${show(n.children)}</${n.tag}>`
    )
    .join('')

describe('richTree', () => {
  it('keeps everything the editor produces', () => {
    const html =
      '<h2>Title</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <span data-color="red">r</span> <mark data-color="yellow">y</mark><br></p>' +
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>' +
      '<ol><li><p>one</p><ul><li><p>nested</p></li></ul></li></ol><blockquote><p>q</p></blockquote><hr>'
    expect(show(richTree(html))).toBe(
      html
        .replace('<hr>', '<hr></hr>')
        .replace('<br>', '<br></br>')
        .replace('checked="checked">', 'checked="checked"></input>')
    )
  })

  it('keeps safe links and strips unsafe ones', () => {
    expect(show(richTree('<a href="https://x.in" target="_top" rel="opener">ok</a>'))).toBe(
      '<a href="https://x.in">ok</a>'
    )
    expect(show(richTree('<a href="mailto:a@x.in">m</a>'))).toBe('<a href="mailto:a@x.in">m</a>')
    expect(
      show(richTree('<a href=" javascript:alert(1)">x</a><a href="data:text/html,x">y</a>'))
    ).toBe('<a>x</a><a>y</a>')
  })

  it('drops script-like content and unwraps unknown tags', () => {
    expect(
      show(
        richTree('<p>a<script>alert(1)</script><style>p{}</style><iframe src="x">f</iframe>b</p>')
      )
    ).toBe('<p>ab</p>')
    expect(show(richTree('<section><font color="red">kept text</font></section>'))).toBe(
      'kept text'
    )
    expect(show(richTree('<svg><text>no</text></svg><template><p>no</p></template>yes'))).toBe(
      'yes'
    )
  })

  it('removes event handlers, styles and off-palette colours', () => {
    expect(show(richTree('<p onclick="x()" style="color:red" class="c" id="i">t</p>'))).toBe(
      '<p>t</p>'
    )
    expect(
      show(richTree('<span data-color="#f00">a</span><mark data-color="orange">b</mark>'))
    ).toBe('<span>a</span><mark data-color="orange">b</mark>')
    expect(show(richTree('<img src=x onerror=alert(1)>'))).toBe('')
  })

  it('allows only checkbox inputs', () => {
    expect(show(richTree('<input type="text" value="x"><input type="checkbox">'))).toBe(
      '<input type="checkbox"></input>'
    )
  })

  it('decodes entities into plain text', () => {
    expect(textOf(richTree('<p>a &amp; b &lt;c&gt;</p>')[0]!)).toBe('a & b <c>')
  })
})

describe('extractPlan', () => {
  const plan = (items: string[], heading = '• Plan for tomorrow:'): string =>
    `<p><strong>${heading}</strong></p><ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`

  it('reads the last plan list in any UI language', () => {
    expect(extractPlan(plan(['old']) + plan(['a', 'b']), PLAN_HEADINGS)).toEqual(['a', 'b'])
    expect(extractPlan(plan(['x'], `• ${PLAN_HEADINGS[2]}:`), PLAN_HEADINGS)).toEqual(['x'])
  })

  it('skips whitespace between the heading and its list', () => {
    expect(extractPlan('<p>Plan for tomorrow</p>\n  <ol><li>one</li></ol>', PLAN_HEADINGS)).toEqual(
      ['one']
    )
  })

  it('finds headings nested inside other blocks, and includes nested item text', () => {
    const html =
      '<blockquote><p>Plan for tomorrow:</p><ul><li><p>top</p><ul><li><p>sub</p></li></ul></li><li><p> </p></li></ul></blockquote>'
    expect(extractPlan(html, PLAN_HEADINGS)).toEqual(['topsub'])
  })

  it('returns nothing without a list right after the heading', () => {
    expect(
      extractPlan('<p>Plan for tomorrow</p><p>text</p><ul><li>no</li></ul>', PLAN_HEADINGS)
    ).toEqual([])
    expect(extractPlan('<p>nothing here</p>', PLAN_HEADINGS)).toEqual([])
  })
})

describe('parseDraft', () => {
  it('accepts only the current shape', () => {
    expect(parseDraft('{"html":"<p>x</p>","hours":"7.5"}')).toEqual({
      html: '<p>x</p>',
      hours: '7.5'
    })
    expect(parseDraft('{"html":"x"}')).toBeNull()
    expect(parseDraft('not json')).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})
