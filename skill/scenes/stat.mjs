// stat: one to three big numbers with labels. Whole numbers count up from zero.
// data: { title?: string | { text, at }, items: [{ value, unit?, label, tone?: "ink" | "accent" | "accent2", at? }] }
// The title is on screen from the start, so the scene is not empty while the narration leads up to the first number.
import { esc, norm } from '../lib/util.mjs'

const TONES = ['ink', 'accent', 'accent2']

export default function stat(scene, ctx) {
  const items = scene.data.items ?? []
  if (!items.length || items.length > 3) throw new Error(`場景 ${scene.id}：數字要 1 到 3 個，現在是 ${items.length} 個`)
  items.forEach((it) => {
    if (it.tone && !TONES.includes(it.tone)) throw new Error(`場景 ${scene.id}：tone 只能是 ${TONES.join('、')}，現在是「${it.tone}」`)
  })
  const title = norm(scene.data.title)
  const html = `<div class="stage stat">
  ${title ? `<div class="head"><h2>${esc(title.text)}</h2><i class="rule"></i></div>` : ''}
  ${items.map((it, i) => `<div class="blk s${i} tone-${it.tone ?? 'ink'}"><div class="num"><b>${esc(it.value)}</b>${it.unit ? `<span class="unit">${esc(it.unit)}</span>` : ''}</div><i class="bar"></i><div class="lab">${esc(it.label)}</div></div>`).join('\n  ')}
</div>`

  let t = ctx.t() + 0.1
  if (title) {
    const tt = title.at != null ? ctx.t(title.at) : t
    ctx.from('.head h2', { opacity: 0, y: 16, duration: 0.4, ease: 'power2.out' }, tt)
    ctx.from('.head .rule', { scaleX: 0, duration: 0.4, ease: 'power2.out' }, tt + 0.2)
    t += 0.5
  }
  items.forEach((it, i) => {
    t = it.at != null ? ctx.t(it.at) : i === 0 ? t : t + 0.7
    ctx.from(`.s${i}`, { opacity: 0, y: 30, duration: 0.4, ease: 'power2.out' }, t)
    if (/^\d+$/.test(String(it.value))) ctx.fromTo(`.s${i} b`, { innerText: 0 }, { innerText: Number(it.value), snap: { innerText: 1 }, duration: 0.8, ease: 'power1.out' }, t)
    ctx.from(`.s${i} .bar`, { scaleX: 0, duration: 0.45, ease: 'power2.out' }, t + 0.3)
  })
  return html
}
