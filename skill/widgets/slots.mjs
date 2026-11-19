// slots: strips of equal cells along one axis (the hours of a day, runs, days). Cells light up to show which ones
// happened, so "24 expected, 9 actual" is seen instead of read.
// fields: {
//   total,                                         2-48 cells per strip
//   ends?: [first, last],                          labels under the two ends of the axis
//   rows: [{ label?, on, tone?, at?, span? }],     1-3 strips; on = how many cells from the start, or the list of cell numbers (0-based)
//   sum?: { label, unit?, per? }                   counter beside the strips: lit cells of the last row times `per` (default 1)
// }
import { esc } from '../lib/util.mjs'

const TONES = ['ink', 'accent', 'accent2']
const SUM = 340 // width of the counter column
const MAX_CELL = 72
const MIN_CELL = 16
const CELL_H = 64 // matches .wg-slots .c in base.css

export default function slots(d, w) {
  const total = d.total
  if (!Number.isInteger(total) || total < 2 || total > 48) w.fail(`total 要是 2 到 48 的整數，現在是 ${total}`)
  const rows = d.rows ?? []
  if (!rows.length || rows.length > 3) w.fail(`rows 要 1 到 3 列，現在是 ${rows.length} 列`)
  if (d.ends && (!Array.isArray(d.ends) || d.ends.length !== 2)) w.fail('ends 要寫成兩個標籤，例如 ["0 時", "24 時"]')
  const lit = rows.map((r) => {
    if (r.tone && !TONES.includes(r.tone)) w.fail(`tone 只能是 ${TONES.join('、')}，現在是「${r.tone}」`)
    if (!Array.isArray(r.on) && !(Number.isInteger(r.on) && r.on >= 0 && r.on <= total)) w.fail(`on 要是 0 到 ${total} 的整數，或格子編號的陣列`)
    const on = Array.isArray(r.on) ? r.on : Array.from({ length: r.on }, (_, i) => i)
    if (on.some((i) => !Number.isInteger(i) || i < 0 || i >= total)) w.fail(`on 的格子編號要在 0 到 ${total - 1} 之間`)
    return new Set(on)
  })

  const width = w.box.width - (d.sum ? SUM : 0)
  // The strip spans the whole box when the cells allow it, so it lines up with a widget stacked above or below.
  const strip = Math.min(width, MAX_CELL * total)
  // A cell is what is left of its share of the strip after the gap.
  if (strip / total - Math.max(3, Math.round((strip / total) * 0.14)) < MIN_CELL) w.fail(`這個位置只有 ${Math.max(0, Math.round(width))}px 寬，放不下 ${total} 格${d.sum ? '和旁邊的計數' : ''}；請給它寬一點的位置，或減少 total`)
  const gap = Math.max(3, Math.round((strip / total) * 0.14))
  const { small, count } = w.theme.type
  const stripsH = rows.reduce((h, r) => h + CELL_H + (r.label ? small * 1.3 + 12 : 0), 0) + (rows.length - 1) * 26 + (d.ends ? small * 1.3 + 14 : 0)
  w.fit(Math.max(stripsH, d.sum ? count + 10 + small * 1.3 : 0))

  w.from('.c', { opacity: 0, duration: 0.2, stagger: 0.4 / (total * rows.length) }, w.enter)
  w.from('.rl, .ends', { opacity: 0, duration: 0.3 }, w.enter)
  if (d.sum) w.from('.cnt', { opacity: 0, y: 14, duration: 0.35, ease: 'power2.out' }, w.enter + 0.2)
  let t = w.enter + 0.6
  rows.forEach((r, k) => {
    const n = lit[k].size
    const span = r.span ?? Math.min(1.4, n * 0.08)
    t = r.at != null ? w.t(r.at) : t
    if (n) w.from(`.r${k} .on i`, { scaleY: 0, duration: 0.25, stagger: span / n, ease: 'power2.out' }, t)
    if (d.sum && k === rows.length - 1 && n) {
      w.fromTo('.cnt b', { innerText: 0 }, { innerText: n * (d.sum.per ?? 1), snap: { innerText: 1 }, duration: span + 0.25, ease: 'none', immediateRender: false }, t)
    }
    t += span + 0.4
  })

  const row = (r, k) => `<div class="row r${k} tone-${r.tone ?? 'accent2'}">
      ${r.label ? `<div class="rl">${esc(r.label)}</div>` : ''}
      <div class="strip" style="width:${strip}px;gap:${gap}px">${Array.from({ length: total }, (_, i) => `<b class="c${lit[k].has(i) ? ' on' : ''}"><i></i></b>`).join('')}</div>
    </div>`
  return `<div class="strips">
    ${rows.map(row).join('\n    ')}
    ${d.ends ? `<div class="ends" style="width:${strip}px"><span>${esc(d.ends[0])}</span><span>${esc(d.ends[1])}</span></div>` : ''}
  </div>
  ${d.sum ? `<div class="cnt"><div class="num"><b>0</b>${d.sum.unit ? `<span class="unit">${esc(d.sum.unit)}</span>` : ''}</div><div class="lab">${esc(d.sum.label)}</div></div>` : ''}`
}
