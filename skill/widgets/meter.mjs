// meter: horizontal bars on one scale, with an optional limit line. Shows how a measured amount sits against a ceiling.
// fields: {
//   unit?,
//   max?,                                          end of the scale; default leaves a little room past the largest value
//   bars: [{ label, value, tone?, at? }],          1-4 bars
//   limit?: { value, label, at? }                  vertical line across all bars
// }
import { esc } from '../lib/util.mjs'

const TONES = ['ink', 'accent', 'accent2']

export default function meter(d, w) {
  const bars = d.bars ?? []
  if (!bars.length || bars.length > 4) w.fail(`bars 要 1 到 4 條，現在是 ${bars.length} 條`)
  bars.forEach((b) => {
    if (!b.label || !(b.value >= 0)) w.fail('每一條都要有 label 和不小於 0 的 value')
    if (b.tone && !TONES.includes(b.tone)) w.fail(`tone 只能是 ${TONES.join('、')}，現在是「${b.tone}」`)
  })
  if (d.limit && (!(d.limit.value > 0) || !d.limit.label)) w.fail('limit 要有大於 0 的 value 和 label')
  const top = Math.max(...bars.map((b) => b.value), d.limit?.value ?? 0)
  const max = d.max ?? top * 1.08
  if (!(max > 0) || max < top) w.fail(`max（${max}）要大於 0，而且不能小於最大的數值 ${top}`)
  const { label, lead } = w.theme.type
  w.fit(bars.length * (Math.max(label, lead) * 1.3 + 12 + 30) + (bars.length - 1) * 34 + (d.limit ? 60 : 0))
  const pct = (v) => Math.round((v / max) * 10000) / 100

  let t = w.enter
  bars.forEach((b, k) => {
    t = b.at != null ? w.t(b.at) : k === 0 ? t : t + 0.6
    w.from(`.b${k}`, { opacity: 0, duration: 0.3 }, t)
    w.from(`.b${k} .fill`, { scaleX: 0, duration: 0.8, ease: 'power2.out' }, t + 0.1)
    if (Number.isInteger(b.value)) w.fromTo(`.b${k} .val b`, { innerText: 0 }, { innerText: b.value, snap: { innerText: 1 }, duration: 0.8, ease: 'power1.out' }, t + 0.1)
  })
  if (d.limit) {
    const tl = d.limit.at != null ? w.t(d.limit.at) : w.enter
    w.from('.limit i', { scaleY: 0, duration: 0.4, ease: 'power2.out' }, tl)
    w.from('.limit span', { opacity: 0, duration: 0.3 }, tl + 0.2)
  }

  return `<div class="bars${d.limit ? ' has-limit' : ''}">
    ${bars.map((b, k) => `<div class="bar b${k} tone-${b.tone ?? 'ink'}">
      <div class="bh"><span class="lab">${esc(b.label)}</span><span class="val"><b>${esc(b.value)}</b>${d.unit ? `<span class="unit">${esc(d.unit)}</span>` : ''}</span></div>
      <div class="track"><i class="fill" style="width:${pct(b.value)}%"></i></div>
    </div>`).join('\n    ')}
    ${d.limit ? `<div class="limit${d.limit.value / max < 0.5 ? " near" : ""}" style="left:${pct(d.limit.value)}%"><span>${esc(d.limit.label)}</span><i></i></div>` : ''}
  </div>`
}
