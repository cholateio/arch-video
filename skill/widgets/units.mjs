// units: a grid of small squares, one per item, filled batch by batch as the narration goes. Shows how many out of how
// many, and how fast a pile is worked through.
// fields: {
//   total,                                        1-400 squares
//   group?,                                       squares per row is a multiple of this (e.g. the batch size)
//   steps: [{ take, at?, tone?, rounds?, span? }], each step fills the next `take` squares; span = seconds the fill takes
//   left?: { label, unit? },                      counter of the squares not filled yet, counts down
//   tally?: { label, unit? }                      counter that goes up by `rounds` (default 1) at each step
// }
import { esc } from '../lib/util.mjs'

const TONES = ['accent', 'accent2']
const MAX_TOTAL = 400
const MAX_CELL = 76
const MIN_CELL = 12
const COUNTERS = 150 // height of the counter row under the grid

export default function units(d, w) {
  const total = d.total
  if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) w.fail(`total 要是 1 到 ${MAX_TOTAL} 的整數，現在是 ${total}`)
  if (d.group != null && (!Number.isInteger(d.group) || d.group < 1)) w.fail(`group 要是正整數，現在是 ${d.group}`)
  const steps = d.steps ?? []
  if (!steps.length) w.fail('steps 至少要一步')
  steps.forEach((s) => {
    if (!Number.isInteger(s.take) || s.take < 1) w.fail(`take 要是正整數，現在是 ${s.take}`)
    if (s.tone && !TONES.includes(s.tone)) w.fail(`tone 只能是 ${TONES.join('、')}，現在是「${s.tone}」`)
  })
  const taken = steps.reduce((n, s) => n + s.take, 0)
  if (taken > total) w.fail(`steps 的 take 加起來是 ${taken}，超過 total ${total}`)

  const hasCounters = Boolean(d.left || d.tally)
  const gridH = w.box.height - (hasCounters ? COUNTERS : 0)
  // Pick the column count that gives the largest square.
  const step = d.group ?? 1
  let cols = step
  let cell = 0
  for (let c = step; c <= Math.max(step, total); c += step) {
    const size = Math.min(Math.floor(w.box.width / c), Math.floor(gridH / Math.ceil(total / c)), MAX_CELL)
    if (size >= cell) { cell = size; cols = c }
  }
  if (cell < MIN_CELL) w.warn(`${total} 個格子在這個位置每格只有 ${cell}px，看不清楚；請減少 total 或給這個零件大一點的位置`)
  const gap = Math.max(2, Math.round(cell * 0.24))
  const side = cell - gap

  const owner = []
  steps.forEach((s, k) => { for (let i = 0; i < s.take; i++) owner.push(k) })
  const cells = Array.from({ length: total }, (_, i) => (owner[i] == null ? '<b class="u"></b>' : `<b class="u s${owner[i]} tone-${steps[owner[i]].tone ?? 'accent2'}"><i></i></b>`))
  const counter = (cls, c, start) => `<div class="cnt ${cls}"><div class="num"><b>${start}</b>${c.unit ? `<span class="unit">${esc(c.unit)}</span>` : ''}</div><div class="lab">${esc(c.label)}</div></div>`

  w.from('.u', { opacity: 0, duration: 0.2, stagger: 0.5 / total }, w.enter)
  if (hasCounters) w.from('.cnt', { opacity: 0, y: 14, duration: 0.35, stagger: 0.15, ease: 'power2.out' }, w.enter + 0.2)
  let t = w.enter + 0.6
  let remaining = total
  let tally = 0
  steps.forEach((s, k) => {
    const span = s.span ?? Math.min(1, s.take * 0.05)
    t = s.at != null ? w.t(s.at) : t
    w.from(`.s${k} i`, { opacity: 0, scale: 0.2, duration: 0.25, stagger: span / s.take, ease: 'power2.out' }, t)
    if (d.left) w.fromTo('.c-left b', { innerText: remaining }, { innerText: remaining - s.take, snap: { innerText: 1 }, duration: span + 0.25, ease: 'none', immediateRender: false }, t)
    const rounds = s.rounds ?? 1
    if (d.tally) w.fromTo('.c-tally b', { innerText: tally }, { innerText: tally + rounds, snap: { innerText: 1 }, duration: rounds > 1 ? span + 0.25 : 0.2, ease: 'none', immediateRender: false }, t)
    remaining -= s.take
    tally += rounds
    t += span + 0.4
  })

  return `<div class="grid" style="grid-template-columns:repeat(${cols},${side}px);grid-auto-rows:${side}px;gap:${gap}px">${cells.join('')}</div>
    ${hasCounters ? `<div class="cnts">${d.left ? counter('c-left', d.left, total) : ''}${d.tally ? counter('c-tally', d.tally, 0) : ''}</div>` : ''}`
}
