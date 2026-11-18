// statement: a large phrase revealed segment by segment from behind a mask, with an engineering dimension line and label below.
// data: { kicker?, segments: [{ text, at?, tone?: "accent" | "accent2", break? }], note?: string | { text, at } }
//   kicker: small label above the phrase, shown as soon as the scene starts so the frame is not empty during the lead-in.
import { esc, norm, isWide } from '../lib/util.mjs'

const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function statement(scene, ctx) {
  const d = scene.data
  const segs = d.segments.map(norm)
  segs.forEach((s) => { if (s.tone && !['accent', 'accent2'].includes(s.tone)) throw new Error(`場景 ${scene.id}：tone 只能是 accent 或 accent2，現在是「${s.tone}」`) })
  const note = norm(d.note)
  const rows = []
  segs.forEach((s, i) => {
    if (i === 0 || s.break) rows.push([])
    rows.at(-1).push({ ...s, k: i })
  })
  const longest = Math.max(...rows.map((r) => units(r.map((s) => s.text).join(''))))
  const sizes = ctx.theme.type.statement
  const size = longest <= 7 ? sizes[0] : longest <= 10 ? sizes[1] : longest <= 13.5 ? sizes[2] : sizes[3]
  if (longest * size > ctx.theme.stage.width - 200) ctx.warn(`標語一行有 ${Math.round(longest)} 個全形字寬，會超出畫面，請拆成兩行或縮短`)

  const html = `<div class="stage statement"><div class="box"><div class="wrap">
  ${d.kicker ? `<div class="kicker">${esc(d.kicker)}</div>` : ''}
  ${rows.map((r) => `<div class="row" style="font-size:${size}px">${r.map((s) => `<span class="seg sg${s.k}${s.tone ? ` tone-${s.tone}` : ''}"><span class="in">${esc(s.text)}</span>${s.tone ? '<i class="ul"></i>' : ''}</span>`).join('')}</div>`).join('\n  ')}
  <div class="dimline"></div>
  ${note ? `<div class="dimnote">${esc(note.text)}</div>` : ''}
</div></div></div>`

  let t = ctx.t() + 0.1
  if (d.kicker) ctx.from('.kicker', { opacity: 0, x: -16, duration: 0.35, ease: 'power2.out' }, t)
  segs.forEach((s, k) => {
    t = s.at != null ? ctx.t(s.at) : k === 0 ? t : t + 0.4
    ctx.from(`.sg${k} .in`, { yPercent: 108, duration: 0.5, ease: 'power3.out' }, t)
    if (s.tone) ctx.from(`.sg${k} .ul`, { scaleX: 0, duration: 0.35, ease: 'power2.out' }, t + 0.35)
  })
  ctx.from('.dimline', { scaleX: 0, duration: 0.5, ease: 'power2.inOut' }, t + 0.55)
  if (note) ctx.from('.dimnote', { opacity: 0, y: 8, duration: 0.3, ease: 'power2.out' }, note.at != null ? ctx.t(note.at) : t + 0.9)
  return html
}
