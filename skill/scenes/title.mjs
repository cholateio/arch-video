// title: the project name is typed out; engineering crop marks sit in the four corners.
// data: { kicker?, title, subtitle?, tags?: [] }   each field may be { text, at }
import { esc, norm, isWide, textPx } from '../lib/util.mjs'

export default function title(scene, ctx) {
  const d = scene.data
  const T = norm(d.title)
  const K = norm(d.kicker)
  const S = norm(d.subtitle)
  const tags = (d.tags ?? []).map(norm)
  const chars = [...T.text]
  const typed = chars.every((c) => !isWide(c)) // the typing effect needs fixed-width (half-width) chars
  // Pick the largest size that fits. Full-width chars are wider, so measure the rendered width instead of counting chars.
  const sizes = ctx.theme.type.title
  const room = (size) => ctx.theme.stage.width - ctx.theme.layout.inset * 2 - size * 0.7
  const size = sizes.find((sz) => textPx(T.text, sz) <= room(sz)) ?? sizes.at(-1)
  if (textPx(T.text, size) > room(size)) ctx.warn(`標題「${T.text}」太長，用最小字級仍會超出畫面`)
  const width = Math.ceil(textPx(T.text, size)) + 2
  const { width: W, height: H } = ctx.theme.stage
  const m = 44
  const marks = [`M0 ${m} V0 H${m}`, `M${W - m} 0 H${W} V${m}`, `M${W} ${H - m} V${H} H${W - m}`, `M${m} ${H} H0 V${H - m}`]

  const html = `<div class="stage title">
  <svg class="crop" viewBox="0 0 ${W} ${H}">${marks.map((p) => `<path class="cm" d="${p}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')}</svg>
  <div class="box">
    ${K ? `<div class="kicker">${esc(K.text)}</div>` : ''}
    <h1 class="tt" style="font-size:${size}px"><span class="line"${typed ? ` style="width:${width + Math.ceil(size * 0.58)}px"` : ''}><span class="mask"${typed ? ' style="width:0px"' : ''}>${esc(T.text)}</span>${typed ? '<i class="caret"></i>' : ''}</span></h1>
    <div class="rule"></div>
    ${S ? `<p class="st">${esc(S.text)}</p>` : ''}
    ${tags.length ? `<ul class="tags">${tags.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul>` : ''}
  </div>
</div>`

  const t0 = ctx.t()
  ctx.to('.cm', { strokeDashoffset: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' }, t0)
  if (K) ctx.from('.kicker', { opacity: 0, x: -16, duration: 0.35, ease: 'power2.out' }, K.at != null ? ctx.t(K.at) : t0 + 0.1)

  const tT = T.at != null ? ctx.t(T.at) : t0 + 0.1
  let tDone = tT + 0.5
  if (typed) {
    // The title is fully typed by the time the voice reaches it (its cue, or the first line), so a short lead types faster.
    // An object cue is an exact start time chosen by hand: it types at the natural speed from that moment.
    const said = T.at == null ? ctx.scene.lines[0]?.start : typeof T.at === 'object' ? null : ctx.deadline(T.at)
    const typing = Math.min(chars.length * 0.055, said != null ? Math.max(0.4, said - tT) : Infinity)
    ctx.from('.caret', { opacity: 0, duration: 0.01 }, tT - 0.05)
    ctx.to('.mask', { width, duration: typing, ease: `steps(${chars.length})` }, tT)
    ctx.to('.caret', { opacity: 0, duration: 0.25 }, tT + typing + 0.7)
    tDone = tT + typing
  } else {
    ctx.from('.mask', { opacity: 0, y: 30, duration: 0.5, ease: 'power3.out' }, tT)
  }
  ctx.from('.rule', { scaleX: 0, duration: 0.4, ease: 'power2.out' }, tDone + 0.05)
  const tS = S?.at != null ? ctx.t(S.at) : tDone + 0.25
  if (S) ctx.from('.st', { opacity: 0, y: 18, duration: 0.45, ease: 'power2.out' }, tS)
  let tTag = tS + 0.28
  tags.forEach((tag, i) => {
    tTag = Math.max(tag.at != null ? ctx.t(tag.at) : tTag, tTag + 0.12) // tags that share a cue are staggered
    ctx.from(`.tags li:nth-child(${i + 1})`, { opacity: 0, y: 14, duration: 0.3, ease: 'power2.out' }, tTag)
  })
  return html
}
