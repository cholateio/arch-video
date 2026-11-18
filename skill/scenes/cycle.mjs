// cycle: three to five steps on a circle joined by arrows, for loops that repeat until a condition holds.
// data: { center?: string | { text, at }, steps: [{ icon, label, tone?, at? }], loopAt?, note?: string | { text, at } }
//   loopAt: cue for the arrow that closes the loop (default: shortly after the last step)
import { esc, norm } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const TONES = ['ink', 'accent', 'accent2']
const rad = (deg) => (deg * Math.PI) / 180

export default function cycle(scene, ctx) {
  const d = scene.data
  const steps = d.steps ?? []
  const n = steps.length
  if (n < 3 || n > 5) throw new Error(`場景 ${scene.id}：循環要 3 到 5 步，現在是 ${n} 步`)
  const note = norm(d.note)
  const center = norm(d.center)
  const { width: W } = ctx.theme.stage
  const D = 130
  const R = 205
  const cx = W / 2
  const cy = note ? 315 : 365
  const gap = (Math.asin((D / 2 + 18) / R) * 180) / Math.PI // angular clearance around each disc
  const angle = (i) => -90 + (i * 360) / n
  const at = (deg, r = R) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))]
  const f = (v) => Math.round(v * 10) / 10

  const arcs = steps.map((_, i) => {
    const a0 = angle(i) + gap
    const a1 = angle(i + 1) - gap
    const [x0, y0] = at(a0)
    const [x1, y1] = at(a1)
    return `<path class="arc a${i}" d="M${f(x0)},${f(y0)} A${R},${R} 0 0 1 ${f(x1)},${f(y1)}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    <path class="hd h${i}" d="M-9,-8 L5,0 L-9,8" transform="translate(${f(x1)},${f(y1)}) rotate(${f(a1 + 90)})"/>`
  })
  const discs = steps.map((s, i) => {
    const tone = s.tone ?? 'ink'
    if (!TONES.includes(tone)) throw new Error(`場景 ${scene.id}：tone 只能是 ${TONES.join('、')}，現在是「${tone}」`)
    const [x, y] = at(angle(i))
    const [lx, ly] = at(angle(i), R + D / 2 + 26)
    const c = Math.cos(rad(angle(i)))
    // Label sits outside the circle: above or below near the vertical axis, otherwise to the outer side.
    const pos = Math.abs(c) < 0.3
      ? `left:${f(lx - 200)}px;width:400px;text-align:center;top:${f(Math.sin(rad(angle(i))) < 0 ? ly - 50 : ly)}px`
      : c > 0 ? `left:${f(lx)}px;top:${f(ly - 25)}px` : `right:${f(W - lx)}px;text-align:right;top:${f(ly - 25)}px`
    return `<div class="step s${i} tone-${tone}" style="left:${f(x - D / 2)}px;top:${f(y - D / 2)}px;width:${D}px">
    <div class="disc" style="height:${D}px"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 50 50)"/></svg><div class="ico">${icon(s.icon)}</div></div>
  </div>
  <div class="clab l${i} tone-${tone}" style="${pos}">${esc(s.label)}</div>`
  })

  const html = `<div class="stage cycle">
  <svg class="arcs" viewBox="0 0 ${W} ${ctx.theme.stage.height}">${arcs.join('\n    ')}</svg>
  ${discs.join('\n  ')}
  ${center ? `<div class="center" style="left:${cx - 150}px;top:${cy - 60}px">${esc(center.text)}</div>` : ''}
  ${note ? `<div class="pill"><span>${esc(note.text)}</span></div>` : ''}
</div>`

  const times = []
  steps.forEach((s, i) => times.push(s.at != null ? ctx.t(s.at) : i === 0 ? ctx.t() + 0.3 : times[i - 1] + 0.8))
  steps.forEach((s, i) => {
    const t = times[i]
    ctx.from(`.s${i} .disc`, { opacity: 0, duration: 0.2 }, t)
    ctx.to(`.s${i} circle`, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, t)
    ctx.from(`.s${i} .ico`, { opacity: 0, scale: 0.5, duration: 0.45, ease: 'back.out(1.8)' }, t + 0.15)
    ctx.from(`.l${i}`, { opacity: 0, duration: 0.35 }, t + 0.3)
    // The arc into the next step finishes as that step appears; the last arc closes the loop.
    const ta = i < n - 1 ? Math.max(t + 0.4, times[i + 1] - 0.5) : d.loopAt != null ? ctx.t(d.loopAt) : t + 0.9
    ctx.to(`.a${i}`, { strokeDashoffset: 0, duration: 0.5, ease: 'power1.inOut' }, ta)
    ctx.from(`.h${i}`, { opacity: 0, duration: 0.1 }, ta + 0.45)
  })
  const tLoop = d.loopAt != null ? ctx.t(d.loopAt) : times.at(-1) + 0.9
  if (center) ctx.from('.center', { opacity: 0, scale: 0.8, duration: 0.4, ease: 'back.out(1.6)' }, center.at != null ? ctx.t(center.at) : tLoop + 0.4)
  if (note) ctx.from('.pill span', { opacity: 0, y: 14, duration: 0.4, ease: 'power2.out' }, note.at != null ? ctx.t(note.at) : tLoop + 1.0)
  return html
}
