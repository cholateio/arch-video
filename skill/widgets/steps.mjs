// steps: a short flow of two to five icon discs joined by arrows, in a row or in a column.
// fields: { steps: [{ icon, label, tone?: "ink" | "accent" | "accent2", at? }], direction?: "row" | "column" }
//   direction: default "row" when the part is wide enough for it, otherwise "column".
import { esc, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const TONES = ['ink', 'accent', 'accent2']
const MIN_PITCH = 200 // narrowest a step can be in a row
const COL_DISC = 92
const COL_GAP = 34
const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function steps(d, w) {
  const list = d.steps ?? []
  const n = list.length
  if (n < 2 || n > 5) w.fail(`steps 要 2 到 5 步，現在是 ${n} 步`)
  if (d.direction && !['row', 'column'].includes(d.direction)) w.fail(`direction 只能是 row 或 column，現在是「${d.direction}」`)
  list.forEach((s) => {
    if (!s.icon || !s.label) w.fail('每一步都要有 icon 與 label')
    if (s.tone && !TONES.includes(s.tone)) w.fail(`tone 只能是 ${TONES.join('、')}，現在是「${s.tone}」`)
  })
  const row = (d.direction ?? (w.box.width >= n * MIN_PITCH ? 'row' : 'column')) === 'row'
  const { label } = w.theme.type
  const pitch = w.box.width / n
  const disc = row ? Math.round(Math.min(160, pitch - 90)) : COL_DISC
  const room = row ? pitch - 16 : w.box.width - COL_DISC - 28
  list.forEach((s) => { if (units(s.label) * label > room) w.warn(`步驟「${s.label}」太長，會超出它的位置`) })
  if (row && disc < 70) w.warn(`這個位置放 ${n} 步太擠，請改成 direction: "column" 或給它寬一點的位置`)
  w.fit(row ? disc + 22 + label * 1.3 : n * COL_DISC + (n - 1) * COL_GAP)

  const times = []
  list.forEach((s, i) => times.push(s.at != null ? w.t(s.at) : i === 0 ? w.enter : times[i - 1] + 0.7))
  list.forEach((s, i) => {
    const t = times[i]
    w.from(`.s${i} .disc`, { opacity: 0, duration: 0.2 }, t)
    w.to(`.s${i} circle`, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, t)
    w.from(`.s${i} .ico`, { opacity: 0, scale: 0.5, duration: 0.45, ease: 'back.out(1.8)' }, t + 0.15)
    w.from(`.s${i} .lab`, { opacity: 0, duration: 0.35, ease: 'power2.out' }, t + 0.3)
    // The arrow is drawn just before the next step appears.
    if (i < n - 1) w.from(`.a${i}`, { [row ? 'scaleX' : 'scaleY']: 0, duration: 0.4, ease: 'power1.inOut' }, Math.max(t + 0.5, times[i + 1] - 0.5))
  })

  const parts = []
  list.forEach((s, i) => {
    parts.push(`<div class="step s${i} tone-${s.tone ?? 'ink'}"${row ? ` style="width:${Math.round(pitch)}px"` : ''}>
      <div class="disc" style="width:${disc}px;height:${disc}px"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 50 50)"/></svg><div class="ico">${icon(s.icon)}</div></div>
      <div class="lab">${esc(s.label)}</div>
    </div>`)
    if (i < n - 1) parts.push(row
      ? `<i class="arrow a${i}" style="left:${Math.round(pitch * (i + 0.5) + disc / 2 + 14)}px;top:${disc / 2}px;width:${Math.round(pitch - disc - 28)}px"></i>`
      : `<i class="arrow a${i}" style="left:${COL_DISC / 2}px;top:${(i + 1) * COL_DISC + i * COL_GAP + 5}px;height:${COL_GAP - 10}px"></i>`)
  })
  return `<div class="chain ${row ? 'row' : 'col'}"${row ? '' : ` style="gap:${COL_GAP}px"`}>
    ${parts.join('\n    ')}
  </div>`
}
