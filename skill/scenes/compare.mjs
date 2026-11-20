// compare: two cards side by side, e.g. before / after, fits / does not fit, two kinds of pain.
// data: { left: Card, right: Card }
//   Card: { title, mood?: "bad" | "good" | "plain", at?, items: [string | { text, at }] }   up to 4 items
import { esc, norm, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const MOOD = { bad: ['x-circle', 'x'], good: ['check-circle', 'check'], plain: ['circle', 'dot-outline'] }
const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function compare(scene, ctx) {
  const cards = [scene.data.left, scene.data.right]
  cards.forEach((c, k) => {
    if (!c?.title || !c.items?.length) throw new Error(`場景 ${scene.id}：${k ? 'right' : 'left'} 要有 title 與 items`)
    if (c.mood && !MOOD[c.mood]) throw new Error(`場景 ${scene.id}：mood 只能是 bad、good、plain，現在是「${c.mood}」`)
    // A card item is a string or { text, at }. Anything else (a `sub` line copied from a list) would be dropped unseen.
    for (const it of c.items) {
      const extra = typeof it === 'object' && it ? Object.keys(it).filter((k) => !['text', 'at'].includes(k)) : []
      if (extra.length) ctx.warn(`場景 ${scene.id}：對比卡片的項目只有 text 與 at，「${extra.join('、')}」不會顯示；把它併進 text 或拿掉`)
    }
    if (c.items.length > 4) ctx.warn(`「${c.title}」有 ${c.items.length} 項，超過 4 項會太擠`)
    c.items.map(norm).forEach((it) => { if (units(it.text) > 34) ctx.warn(`「${it.text.slice(0, 10)}…」超過兩行，請縮短`) })
  })
  const html = `<div class="stage compare">
  ${cards.map((c, k) => {
    const [head, bullet] = MOOD[c.mood ?? 'plain']
    return `<div class="card c${k} mood-${c.mood ?? 'plain'}">
    <div class="ct"><span class="ci">${icon(head)}</span><h3>${esc(c.title)}</h3></div>
    <ul>${c.items.map(norm).map((it, i) => `<li class="i${i}"><span class="b">${icon(bullet)}</span><span>${esc(it.text)}</span></li>`).join('')}</ul>
  </div>`
  }).join('\n  ')}
</div>`

  let t = ctx.t()
  cards.forEach((c, k) => {
    const items = c.items.map(norm)
    // The left card opens the scene so the frame is never empty. The right one arrives before the line that first
    // mentions one of its items: its title is usually said at the start of that line, ahead of the items.
    const tc = c.at != null ? ctx.t(c.at) : k === 0 ? ctx.t() : items[0].at != null ? ctx.t(ctx.lineOf(items[0].at)) : t + 0.5
    ctx.from(`.c${k}`, { opacity: 0, y: 30, duration: 0.45, ease: 'power2.out' }, tc)
    t = tc + 0.4
    items.forEach((it, i) => {
      t = it.at != null ? ctx.t(it.at) : i === 0 ? t : t + 0.6
      ctx.from(`.c${k} .i${i}`, { opacity: 0, x: -16, duration: 0.35, ease: 'power2.out' }, t)
    })
  })
  return html
}
