// terminal: a terminal window. Commands are typed out; output lines appear after them.
// data: { title?, prompt?: "$", lines: [{ type?: "cmd" | "out" | "ok" | "err", text, at? }] }   up to 8 lines
import { esc, textPx } from '../lib/util.mjs'

const TYPES = ['cmd', 'out', 'ok', 'err']
const WIDTH = 1180 // window width minus padding and the prompt column

export default function terminal(scene, ctx) {
  const d = scene.data
  const lines = d.lines ?? []
  if (!lines.length || lines.length > 8) throw new Error(`場景 ${scene.id}：終端機要 1 到 8 行，現在是 ${lines.length} 行`)
  const size = ctx.theme.type.code
  lines.forEach((l) => {
    if (l.type && !TYPES.includes(l.type)) throw new Error(`場景 ${scene.id}：type 只能是 ${TYPES.join('、')}，現在是「${l.type}」`)
    if (textPx(l.text, size) > WIDTH) ctx.warn(`終端機這一行太長，會超出視窗：${l.text.slice(0, 20)}…`)
  })
  const html = `<div class="stage term"><div class="win">
  <div class="bar"><i></i><i></i><i></i><span class="path">${esc(d.title ?? 'terminal')}</span></div>
  <div class="body">
    ${lines.map((l, i) => {
      const cmd = (l.type ?? 'out') === 'cmd'
      return `<div class="trow t${i} ty-${l.type ?? 'out'}">${cmd ? `<span class="pr">${esc(d.prompt ?? '$')}</span><span class="tx" style="width:0px">${esc(l.text)}</span><i class="caret"></i>` : `<span class="tx">${esc(l.text)}</span>`}</div>`
    }).join('\n    ')}
  </div>
</div></div>`

  const t0 = ctx.t()
  ctx.from('.win', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, t0)
  let t = t0 + 0.4
  lines.forEach((l, i) => {
    const cmd = (l.type ?? 'out') === 'cmd'
    t = l.at != null ? ctx.t(l.at) : t
    if (cmd) {
      const chars = [...l.text].length
      const typing = Math.min(1.6, chars * 0.035)
      ctx.from(`.t${i}`, { opacity: 0, duration: 0.01 }, t)
      ctx.to(`.t${i} .tx`, { width: Math.ceil(textPx(l.text, size)) + 2, duration: typing, ease: `steps(${chars})` }, t + 0.1)
      ctx.to(`.t${i} .caret`, { opacity: 0, duration: 0.15 }, t + typing + 0.5)
      t += typing + 0.7
    } else {
      ctx.from(`.t${i}`, { opacity: 0, y: 8, duration: 0.25, ease: 'power2.out' }, t)
      t += 0.35
    }
  })
  return html
}
