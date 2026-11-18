// flow：流程。幾個圓圈一字排開，圈裡是彩色圖示，中間用箭頭連起來；旁白講到哪一步，那一步才出現。
// data: {
//   title?: string | { text, at },
//   steps: [{ icon, label, tone?: "ink" | "accent" | "accent2", at? }],   2–5 步；icon 是 Phosphor 圖示名稱
//   note?: string | { text, at }                                          下方的膠囊註解
// }
import { esc, norm, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const TONES = ['ink', 'accent', 'accent2']
const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function flow(scene, ctx) {
  const d = scene.data
  const steps = d.steps
  if (steps.length < 2 || steps.length > 5) throw new Error(`場景 ${scene.id}：流程要 2 到 5 步，現在是 ${steps.length} 步`)
  const title = norm(d.title)
  const note = norm(d.note)
  const n = steps.length
  const D = n <= 3 ? 200 : n === 4 ? 180 : 150 // 圓圈直徑
  const pitch = n <= 3 ? 440 : n === 4 ? 380 : 310 // 圓心間距
  const { width: W } = ctx.theme.stage
  const x0 = (W - pitch * (n - 1)) / 2
  const cy = title ? 330 : 290
  const L = pitch - D - 36 // 箭頭長度
  const labW = pitch - 20

  const parts = []
  steps.forEach((s, i) => {
    const tone = s.tone ?? 'ink'
    if (!TONES.includes(tone)) throw new Error(`場景 ${scene.id}：tone 只能是 ${TONES.join('、')}，現在是「${tone}」`)
    if (units(s.label) * ctx.theme.type.label > labW) ctx.warn(`步驟「${s.label}」太長，會和旁邊的字重疊`)
    const cx = x0 + i * pitch
    parts.push(`<div class="step s${i} tone-${tone}" style="left:${cx - D / 2}px;top:${cy - D / 2}px;width:${D}px">
    <div class="disc" style="height:${D}px">
      <svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 50 50)"/></svg>
      <div class="ico">${icon(s.icon)}</div>
    </div>
    <div class="lab" style="width:${labW}px;margin-left:${(D - labW) / 2}px">${esc(s.label)}</div>
  </div>`)
    if (i < n - 1) parts.push(`<div class="arrow a${i}" style="left:${cx + D / 2 + 18}px;top:${cy}px;width:${L}px"><i class="ln"></i><i class="hd"></i><i class="dot"></i></div>`)
  })

  const html = `<div class="stage flow">
  ${title ? `<div class="head"><h2>${esc(title.text)}</h2><i class="rule"></i></div>` : ''}
  ${parts.join('\n  ')}
  ${note ? `<div class="pill"><span>${esc(note.text)}</span></div>` : ''}
</div>`

  const t0 = ctx.t()
  if (title) {
    const tt = title.at != null ? ctx.t(title.at) : t0
    ctx.from('.head h2', { opacity: 0, y: -14, duration: 0.4, ease: 'power2.out' }, tt)
    ctx.from('.head .rule', { scaleX: 0, duration: 0.4, ease: 'power2.out' }, tt + 0.25)
  }
  const times = []
  steps.forEach((s, i) => {
    times.push(s.at != null ? ctx.t(s.at) : i === 0 ? t0 + 0.3 : times[i - 1] + 0.7)
  })
  steps.forEach((s, i) => {
    const t = times[i]
    ctx.from(`.s${i} .disc`, { opacity: 0, duration: 0.2 }, t)
    ctx.to(`.s${i} circle`, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, t)
    ctx.from(`.s${i} .ico`, { opacity: 0, scale: 0.5, duration: 0.45, ease: 'back.out(1.8)' }, t + 0.15)
    ctx.from(`.s${i} .lab`, { opacity: 0, y: 12, duration: 0.35, ease: 'power2.out' }, t + 0.3)
    if (i < n - 1) {
      // 箭頭在下一步出現前畫好，圓點沿著箭頭滑到中途
      const ta = Math.max(t + 0.5, times[i + 1] - 0.5)
      ctx.from(`.a${i} .ln`, { scaleX: 0, duration: 0.4, ease: 'power1.inOut' }, ta)
      ctx.from(`.a${i} .hd`, { opacity: 0, duration: 0.1 }, ta + 0.35)
      ctx.fromTo(`.a${i} .dot`, { x: 0, opacity: 0 }, { x: Math.round(L * 0.45), opacity: 1, duration: 0.5, ease: 'power2.out' }, ta)
    }
  })
  if (note) ctx.from('.pill span', { opacity: 0, y: 14, duration: 0.4, ease: 'power2.out' }, note.at != null ? ctx.t(note.at) : times.at(-1) + 0.9)
  return html
}
