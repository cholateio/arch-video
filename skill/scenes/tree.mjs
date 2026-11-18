// tree: a file tree; each entry lights up with a note when the narration reaches it.
// data: { root, items: [{ name, depth?: 1, note?, at?, icon? }] }   up to 8 rows; a name ending in "/" is a folder
import { esc } from '../lib/util.mjs'
import { icon } from '../lib/icons.mjs'

export default function tree(scene, ctx) {
  const d = scene.data
  const items = d.items ?? []
  if (!items.length || items.length > 8) throw new Error(`場景 ${scene.id}：檔案樹要 1 到 8 列，現在是 ${items.length} 列`)
  const pick = (it) => it.icon ?? (it.name.endsWith('/') ? 'folder' : 'file-text')
  const html = `<div class="stage tree"><div class="box">
  <div class="root"><span class="ic">${icon('folder-open')}</span><span class="nm">${esc(d.root)}</span></div>
  ${items.map((it, i) => `<div class="row r${i}" style="padding-left:${((it.depth ?? 1) - 1) * 58 + 20}px"><i class="elbow"></i><span class="ic">${icon(pick(it))}</span><span class="nm">${esc(it.name)}</span>${it.note ? `<span class="nt">${esc(it.note)}</span>` : ''}</div>`).join('\n  ')}
</div></div>`

  const t0 = ctx.t()
  const dim = 0.4
  ctx.from('.root', { opacity: 0, x: -16, duration: 0.35, ease: 'power2.out' }, t0)
  ctx.fromTo('.row', { opacity: 0, x: -16 }, { opacity: dim, x: 0, duration: 0.3, stagger: 0.06, ease: 'power2.out' }, t0 + 0.2)
  const accent = ctx.theme.color.accent
  const ink = ctx.theme.color.ink
  let prev = null
  items.map((it, i) => ({ ...it, i })).filter((it) => it.at != null).map((it) => ({ ...it, t: ctx.t(it.at) })).sort((a, b) => a.t - b.t).forEach((it) => {
    ctx.to(`.r${it.i}`, { opacity: 1, duration: 0.3 }, it.t)
    ctx.to(`.r${it.i} .nm, .r${it.i} .ic`, { color: accent, duration: 0.3 }, it.t)
    if (it.note) ctx.from(`.r${it.i} .nt`, { opacity: 0, x: 14, duration: 0.35, ease: 'power2.out' }, it.t + 0.1)
    if (prev != null) ctx.to(`.r${prev} .nm, .r${prev} .ic`, { color: ink, duration: 0.3 }, it.t)
    prev = it.i
  })
  return html
}
