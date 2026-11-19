// points: short lines of text, one under another. With a frame it is a card; without, a plain list.
// fields: {
//   items: [string | { text, sub?, at }],                    1-5 lines, each at most two rows of text
//   style?: "bullet" | "check" | "cross" | "number",         the mark in front of each line, default "bullet"
//   frame?: boolean                                          draw a card around the lines
// }
import { esc, norm, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const MARK = { bullet: 'caret-right', check: 'check', cross: 'x' }
const STYLES = [...Object.keys(MARK), 'number']
const MARK_W = 58 // mark column plus its gap
const FRAME_PAD = 44
const GAP = 24
const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function points(d, w) {
  const style = d.style ?? 'bullet'
  if (!STYLES.includes(style)) w.fail(`style 只能是 ${STYLES.join('、')}，現在是「${style}」`)
  const items = (d.items ?? []).map(norm)
  if (!items.length || items.length > 5) w.fail(`items 要 1 到 5 項，現在是 ${items.length} 項`)
  const { body, small } = w.theme.type
  const room = w.box.width - MARK_W - (d.frame ? FRAME_PAD * 2 : 0)
  let height = (d.frame ? FRAME_PAD * 2 : 0) + (items.length - 1) * GAP
  items.forEach((it) => {
    if (!it.text) w.fail('每一項都要有 text')
    const rows = Math.ceil((units(it.text) * body) / room)
    if (rows > 2) w.warn(`「${it.text.slice(0, 10)}…」在這個寬度會超過兩行，請縮短`)
    height += rows * body * 1.4 + (it.sub ? small * 1.3 + 4 : 0)
  })
  w.fit(height)

  // The card arrives just ahead of its first line, so it never sits on screen empty.
  const first = items[0].at != null ? w.t(items[0].at) : w.enter + (d.frame ? 0.3 : 0)
  if (d.frame) w.from('.box', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, Math.max(w.enter, first - 0.3))
  let t = first
  items.forEach((it, i) => {
    t = i === 0 ? first : it.at != null ? w.t(it.at) : t + 0.6
    w.from(`.i${i}`, { opacity: 0, x: -16, duration: 0.35, ease: 'power2.out' }, t)
  })
  const mark = (i) => (style === 'number' ? String(i + 1).padStart(2, '0') : icon(MARK[style]))
  return `<ul class="box st-${style}${d.frame ? ' frame' : ''}">
    ${items.map((it, i) => `<li class="i${i}"><span class="mk">${mark(i)}</span><div><p>${esc(it.text)}</p>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div></li>`).join('\n    ')}
  </ul>`
}
