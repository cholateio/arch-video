// terminal: a terminal window. Commands are typed out; output lines appear after them.
// data: { title?, prompt?: "$", lines: [{ type?: "cmd" | "out" | "ok" | "err", text, at? }] }   up to 8 lines
import { esc, textPx } from '../lib/util.mjs'

const TYPES = ['cmd', 'out', 'ok', 'err']
const WIDTH = 1180 // window width minus padding and the prompt column

// The window and its typing, shared by the scene and the `term` widget.
// api: { t, deadline, warn, fail, from, to }; size: font size in px; width: room for one line of text; t0: when the window appears.
export function terminalWindow(d, api, { size, width, t0, max = 8 }) {
  const lines = d.lines ?? []
  if (!lines.length || lines.length > max) api.fail(`終端機要 1 到 ${max} 行，現在是 ${lines.length} 行`)
  lines.forEach((l) => {
    if (l.type && !TYPES.includes(l.type)) api.fail(`type 只能是 ${TYPES.join('、')}，現在是「${l.type}」`)
    if (textPx(l.text, size) > width) api.warn(`終端機這一行太長，會超出視窗：${l.text.slice(0, 20)}…`)
  })
  const html = `<div class="win">
  <div class="bar"><i></i><i></i><i></i><span class="path">${esc(d.title ?? 'terminal')}</span></div>
  <div class="body">
    ${lines.map((l, i) => {
      const cmd = (l.type ?? 'out') === 'cmd'
      return `<div class="trow t${i} ty-${l.type ?? 'out'}">${cmd ? `<span class="pr">${esc(d.prompt ?? '$')}</span><span class="tx" style="width:0px">${esc(l.text)}</span><i class="caret"></i>` : `<span class="tx">${esc(l.text)}</span>`}</div>`
    }).join('\n    ')}
  </div>
</div>`

  api.from('.win', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, t0)
  let t = t0 + 0.15
  lines.forEach((l, i) => {
    const cmd = (l.type ?? 'out') === 'cmd'
    const chars = [...l.text].length
    const natural = cmd ? Math.min(1.0, chars * 0.025) : 0
    let typing = natural
    if (l.at != null) {
      // An object cue is an exact start time chosen by hand: it gets no lead and nothing has to finish before it.
      const exact = typeof l.at === 'object'
      const deadline = api.deadline(l.at)
      t = Math.max(api.t(l.at), t) // a line never appears before the one above it has finished
      // A cued command is fully typed by the time the voice reaches it, so it types faster when the lead is short.
      if (cmd && !exact) typing = Math.min(natural, Math.max(0.3, deadline - t))
      const late = (exact ? t : t + typing) - deadline
      if (late > 0.001) api.warn(`終端機第 ${i + 1} 行要等上一行打完，會比旁白晚 ${late.toFixed(1)} 秒；請把兩行的觸發點拉開，或縮短上一行`)
    }
    if (cmd) {
      api.from(`.t${i}`, { opacity: 0, duration: 0.01 }, t)
      api.to(`.t${i} .tx`, { width: Math.ceil(textPx(l.text, size)) + 2, duration: typing, ease: `steps(${chars})` }, t)
      api.to(`.t${i} .caret`, { opacity: 0, duration: 0.15 }, t + typing + 0.5)
      t += typing + 0.4
    } else {
      api.from(`.t${i}`, { opacity: 0, y: 8, duration: 0.25, ease: 'power2.out' }, t)
      t += 0.35
    }
  })
  return html
}

export default function terminal(scene, ctx) {
  const api = { ...ctx, fail: (m) => { throw new Error(`場景 ${scene.id}：${m}`) } }
  return `<div class="stage term">${terminalWindow(scene.data, api, { size: ctx.theme.type.code, width: WIDTH, t0: ctx.t() })}</div>`
}
