// layout: a title and one to three parts placed side by side or stacked. Each part holds one widget, so a small set of
// widgets gives many different frames instead of one frame per component.
// data: {
//   title?: string | { text, at },
//   arrange?: "single" | "split" | "stack" | "trio",   default by the number of parts: 1 single, 2 split, 3 trio
//   ratio?: [a, b],                                     split and stack only: share of each part, default [1, 1].
//                                                       Stacked, it is the height each part may use: shorter content is
//                                                       packed together, taller content is warned about.
//   parts: [{ widget, head?, mood?: "good" | "bad" | "plain", foot?: string | { text, at }, enter?, ...widget fields }]
// }
//   widget: one of widgets/index.mjs. head sits above the widget, foot below it; mood puts a tick or a cross on the head.
//   enter: cue for when the part enters. Default: with the scene, so no part of the frame waits empty; what a widget
//   shows inside still follows its own cues.
import { esc, norm, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'
import widgets from '../widgets/index.mjs'

const ARRANGE = { single: 1, split: 2, stack: 2, trio: 3 }
const BY_COUNT = [null, 'single', 'split', 'trio']
const MOOD = { bad: 'x-circle', good: 'check-circle', plain: null }
const HEAD = 150 // height taken by the title
const LABEL = 76 // height taken by a part's head
const CAPTION = 84 // height taken by a part's foot
const GAP = { split: 110, stack: 44, trio: 70 }
const SINGLE_MAX = 1320
const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

function boxes(arrange, ratio, W, H, top) {
  if (arrange === 'single') {
    const w = Math.min(W, SINGLE_MAX)
    return [{ x: (W - w) / 2, y: top, w, h: H }]
  }
  if (arrange === 'trio') {
    const w = (W - GAP.trio * 2) / 3
    return [0, 1, 2].map((k) => ({ x: k * (w + GAP.trio), y: top, w, h: H }))
  }
  const [a, b] = ratio
  if (arrange === 'split') {
    const wa = ((W - GAP.split) * a) / (a + b)
    return [{ x: 0, y: top, w: wa, h: H }, { x: wa + GAP.split, y: top, w: W - GAP.split - wa, h: H }]
  }
  const ha = ((H - GAP.stack) * a) / (a + b)
  return [{ x: 0, y: top, w: W, h: ha }, { x: 0, y: top + ha + GAP.stack, w: W, h: H - GAP.stack - ha }]
}

export default function layout(scene, ctx) {
  const d = scene.data
  const parts = d.parts ?? []
  if (!parts.length || parts.length > 3) throw new Error(`場景 ${scene.id}：parts 要 1 到 3 個，現在是 ${parts.length} 個`)
  const arrange = d.arrange ?? BY_COUNT[parts.length]
  if (!(arrange in ARRANGE)) throw new Error(`場景 ${scene.id}：arrange 只能是 ${Object.keys(ARRANGE).join('、')}，現在是「${arrange}」`)
  if (ARRANGE[arrange] !== parts.length) throw new Error(`場景 ${scene.id}：arrange「${arrange}」要 ${ARRANGE[arrange]} 個 parts，現在是 ${parts.length} 個`)
  const ratio = d.ratio ?? [1, 1]
  if (!Array.isArray(ratio) || ratio.length !== 2 || ratio.some((n) => !(n > 0))) throw new Error(`場景 ${scene.id}：ratio 要寫成兩個正數，例如 [3, 2]`)

  const title = norm(d.title)
  const { width: W, height: H } = ctx.theme.stage
  const top = title ? HEAD : 0
  const slots = boxes(arrange, ratio, W, H - top, top)
  const t0 = ctx.t()

  const html = parts.map((p, k) => {
    const { widget: name, head: label, mood = 'plain', foot, enter: at, ...fields } = p
    const where = `場景 ${scene.id} 第 ${k + 1} 個零件`
    const render = widgets[name]
    if (!render) throw new Error(`${where}：不認得的零件「${name}」（有：${Object.keys(widgets).join('、')}）`)
    if (!(mood in MOOD)) throw new Error(`${where}：mood 只能是 bad、good、plain，現在是「${mood}」`)
    const caption = norm(foot)
    const b = slots[k]
    if (caption && units(caption.text) * ctx.theme.type.label > b.w) ctx.warn(`「${caption.text.slice(0, 10)}…」比它的零件還寬，請縮短`)
    if (label && units(label) * ctx.theme.type.label > b.w - 60) ctx.warn(`「${label.slice(0, 10)}…」比它的零件還寬，請縮短`)

    const enter = at != null ? ctx.t(at) : t0 + (title ? 0.3 : 0) + k * 0.2
    const sel = (s) => s.split(',').map((q) => `.p${k} ${q.trim()}`).join(', ')
    const box = { width: Math.round(b.w), height: Math.round(b.h - (label ? LABEL : 0) - (caption ? CAPTION : 0)) }
    const inner = render(fields, {
      box, enter, theme: ctx.theme,
      t: ctx.t, lineOf: ctx.lineOf, deadline: ctx.deadline,
      warn: (m) => ctx.warn(`第 ${k + 1} 個零件（${name}）：${m}`),
      fail: (m) => { throw new Error(`${where}（${name}）：${m}`) },
      // A widget reports the height it needs; one that does not fit its part would run into its neighbour or the subtitles.
      fit: (h) => { if (h > box.height) ctx.warn(`第 ${k + 1} 個零件（${name}）需要 ${Math.round(h)}px 高，這個位置只有 ${box.height}px，會和旁邊的內容重疊；請調整 ratio 或換一種排法`) },
      to: (s, vars, t) => ctx.to(sel(s), vars, t),
      from: (s, vars, t) => ctx.from(sel(s), vars, t),
      fromTo: (s, a, z, t) => ctx.fromTo(sel(s), a, z, t),
    })
    if (label) ctx.from(`.p${k} .pl`, { opacity: 0, y: -12, duration: 0.35, ease: 'power2.out' }, enter)
    if (caption) ctx.from(`.p${k} .pc`, { opacity: 0, y: 12, duration: 0.35, ease: 'power2.out' }, caption.at != null ? ctx.t(caption.at) : enter + 0.6)
    // Stacked parts flow in one centred column, so the two read as one picture; the others sit in their own boxes.
    const place = arrange === 'stack' ? `width:${Math.round(b.w)}px` : `left:${Math.round(b.x)}px;top:${Math.round(b.y)}px;width:${Math.round(b.w)}px;height:${Math.round(b.h)}px`
    return `<div class="part p${k} mood-${mood}" style="${place}">
    ${label ? `<div class="pl">${MOOD[mood] ? `<span class="ci">${icon(MOOD[mood])}</span>` : ''}<span>${esc(label)}</span></div>` : ''}
    <div class="wg wg-${name}" style="width:${box.width}px">${inner}</div>
    ${caption ? `<div class="pc">${esc(caption.text)}</div>` : ''}
  </div>`
  })

  if (title) {
    const tt = title.at != null ? ctx.t(title.at) : t0
    ctx.from('.head h2', { opacity: 0, y: -14, duration: 0.4, ease: 'power2.out' }, tt)
    ctx.from('.head .rule', { scaleX: 0, duration: 0.4, ease: 'power2.out' }, tt + 0.25)
  }
  return `<div class="stage layout">
  ${title ? `<div class="head"><h2>${esc(title.text)}</h2><i class="rule"></i></div>` : ''}
  ${arrange === 'stack' ? `<div class="column" style="top:${top}px;height:${H - top}px;gap:${GAP.stack}px">${html.join('\n  ')}</div>` : html.join('\n  ')}
</div>`
}
