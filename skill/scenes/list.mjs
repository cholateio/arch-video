// list: a titled list for agendas (numbered), recaps (checked) and rule lists (bulleted).
// data: { title?, style?: "number" | "check" | "bullet", items: [string | { text, sub?, at }] }   up to 5 items
import { esc, norm, isWide } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function list(scene, ctx) {
  const d = scene.data
  const style = d.style ?? 'bullet'
  if (!['number', 'check', 'bullet'].includes(style)) throw new Error(`場景 ${scene.id}：style 只能是 number、check、bullet，現在是「${style}」`)
  const items = (d.items ?? []).map(norm)
  if (!items.length || items.length > 5) throw new Error(`場景 ${scene.id}：清單要 1 到 5 項，現在是 ${items.length} 項`)
  items.forEach((it) => { if (units(it.text) > 24) ctx.warn(`清單項目「${it.text.slice(0, 10)}…」太長，會超出一行`) })
  const mark = (i) => (style === 'number' ? String(i + 1).padStart(2, '0') : style === 'check' ? icon('check-circle') : icon('caret-right'))

  const html = `<div class="stage list"><div class="col">
  ${d.title ? `<h2>${esc(d.title)}</h2><i class="rule"></i>` : ''}
  <ol class="st-${style}">
    ${items.map((it, i) => `<li class="i${i}"><span class="mk">${mark(i)}</span><div><p>${esc(it.text)}</p>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div></li>`).join('\n    ')}
  </ol>
</div></div>`

  const t0 = ctx.t()
  if (d.title) {
    ctx.from('h2', { opacity: 0, y: -14, duration: 0.4, ease: 'power2.out' }, t0)
    ctx.from('.rule', { scaleX: 0, transformOrigin: '0 50%', duration: 0.4, ease: 'power2.out' }, t0 + 0.25)
  }
  let t = t0 + 0.4
  items.forEach((it, i) => {
    t = it.at != null ? ctx.t(it.at) : i === 0 ? t : t + 0.6
    ctx.from(`.i${i}`, { opacity: 0, x: -24, duration: 0.4, ease: 'power2.out' }, t)
    ctx.from(`.i${i} .mk`, { scale: 0.4, transformOrigin: '50% 50%', duration: 0.4, ease: 'back.out(2)' }, t)
  })
  return html
}
