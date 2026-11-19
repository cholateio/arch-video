// figure: one big number with a unit and a label. A whole number counts up from zero.
// fields: { value, unit?, label, tone?: "ink" | "accent" | "accent2", at? }
import { esc } from '../lib/util.mjs'

const TONES = ['ink', 'accent', 'accent2']

export default function figure(d, w) {
  if (d.value == null || !d.label) w.fail('要有 value 與 label')
  const tone = d.tone ?? 'ink'
  if (!TONES.includes(tone)) w.fail(`tone 只能是 ${TONES.join('、')}，現在是「${tone}」`)
  w.fit(w.theme.type.stat + 45 + w.theme.type.label * 1.3)
  const t = d.at != null ? w.t(d.at) : w.enter
  w.from('.fig', { opacity: 0, y: 30, duration: 0.4, ease: 'power2.out' }, t)
  if (/^\d+$/.test(String(d.value))) w.fromTo('.fig b', { innerText: 0 }, { innerText: Number(d.value), snap: { innerText: 1 }, duration: 0.8, ease: 'power1.out' }, t)
  w.from('.fig .bar', { scaleX: 0, duration: 0.45, ease: 'power2.out' }, t + 0.3)
  return `<div class="fig tone-${tone}"><div class="num"><b>${esc(d.value)}</b>${d.unit ? `<span class="unit">${esc(d.unit)}</span>` : ''}</div><i class="bar"></i><div class="lab">${esc(d.label)}</div></div>`
}
