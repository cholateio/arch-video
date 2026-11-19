// panel: a plain window with rows, the generic shape of a list in some tool: run history, a queue, a table.
// It draws the thing being talked about; it does not imitate any real product.
// fields: {
//   title,                                             window title; say so here when the content is made up
//   rows: [{ text, state?, badge?, at?, then?: { state?, badge?, at } }],   1-7 rows
//   buttons?: [string | { text, at }]                  up to 3, the first one is the main action
// }
//   state: "ok" | "fail" | "wait" | "off". then: the row changes to this state or badge at that cue.
import { esc, norm, textPx } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const STATE = { ok: 'check-circle', fail: 'x-circle', wait: 'circle-dashed', off: 'minus-circle' }
const BAR = 64
const ROW = 66
const PAD = 16
const FOOT = 92

export default function panel(d, w) {
  if (!d.title) w.fail('要有 title')
  const rows = d.rows ?? []
  if (!rows.length || rows.length > 7) w.fail(`rows 要 1 到 7 列，現在是 ${rows.length} 列`)
  const buttons = (d.buttons ?? []).map(norm)
  if (buttons.length > 3) w.fail(`buttons 最多 3 個，現在是 ${buttons.length} 個`)
  const { row: size, small } = w.theme.type
  const check = (s) => { if (s != null && !(s in STATE)) w.fail(`state 只能是 ${Object.keys(STATE).join('、')}，現在是「${s}」`) }
  rows.forEach((r) => {
    if (!r.text) w.fail('每一列都要有 text')
    check(r.state)
    check(r.then?.state)
    if (r.then && r.then.at == null) w.fail('then 要有 at，說明什麼時候改變')
    const badge = Math.max(textPx(r.badge ?? '', small), textPx(r.then?.badge ?? '', small))
    const used = 56 + (r.state || r.then?.state ? 52 : 0) + textPx(r.text, size) + (badge ? badge + 56 : 0)
    if (used > w.box.width) w.warn(`「${r.text.slice(0, 10)}…」這一列太長，會超出視窗`)
  })
  w.fit(BAR + PAD * 2 + rows.length * ROW + (buttons.length ? FOOT : 0))

  w.from('.win', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, w.enter)
  let t = w.enter + 0.3
  rows.forEach((r, i) => {
    t = r.at != null ? w.t(r.at) : i === 0 ? t : t + 0.25
    w.from(`.r${i}`, { opacity: 0, x: -14, duration: 0.3, ease: 'power2.out' }, t)
    if (r.then) {
      const tt = w.t(r.then.at)
      // The old state leaves as the new one arrives; `to` with opacity 0 is an exit, so only the arrival is checked against the narration.
      if (r.then.state) {
        if (r.state) w.to(`.r${i} .st.a`, { opacity: 0, duration: 0.2 }, tt)
        w.from(`.r${i} .st.b`, { opacity: 0, scale: 0.4, duration: 0.35, ease: 'back.out(2)' }, tt)
      }
      if (r.then.badge) {
        if (r.badge) w.to(`.r${i} .bd.a`, { opacity: 0, duration: 0.2 }, tt)
        w.from(`.r${i} .bd.b`, { opacity: 0, y: 8, duration: 0.3, ease: 'power2.out' }, tt)
      }
    }
  })
  buttons.forEach((b, i) => {
    t = b.at != null ? w.t(b.at) : t + 0.4
    w.from(`.bt${i}`, { opacity: 0, y: 10, duration: 0.3, ease: 'power2.out' }, t)
  })

  const state = (s, cls) => (s ? `<span class="st ${cls} s-${s}">${icon(STATE[s])}</span>` : '')
  const badge = (s, cls) => (s ? `<span class="bd ${cls}">${esc(s)}</span>` : '')
  return `<div class="win">
    <div class="bar"><i></i><i></i><i></i><span class="path">${esc(d.title)}</span></div>
    <ul class="rows">
      ${rows.map((r, i) => `<li class="r${i}">${r.state || r.then?.state ? `<span class="sts">${state(r.state, 'a')}${state(r.then?.state, 'b')}</span>` : ''}<span class="tx">${esc(r.text)}</span>${r.badge || r.then?.badge ? `<span class="bds">${badge(r.badge, 'a')}${badge(r.then?.badge, 'b')}</span>` : ''}</li>`).join('\n      ')}
    </ul>
    ${buttons.length ? `<div class="foot">${buttons.map((b, i) => `<span class="bt bt${i}${i === 0 ? ' main' : ''}">${esc(b.text)}</span>`).join('')}</div>` : ''}
  </div>`
}
