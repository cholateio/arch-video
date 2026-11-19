// term: a small terminal window. Commands are typed out; output lines appear after them.
// fields: { title?, prompt?: "$", lines: [{ type?: "cmd" | "out" | "ok" | "err", text, at? }] }   up to 6 lines
import { textPx } from '../lib/util.mjs'
import { terminalWindow } from '../scenes/terminal.mjs'

const PAD = 124 // window padding plus the prompt column
const ROW = 58 // matches .term .trow in base.css
const MAX = 6

export default function term(d, w) {
  // The larger code size when every line fits the part, the smaller one otherwise.
  const { code, codeNum } = w.theme.type
  const width = w.box.width - PAD
  const size = (d.lines ?? []).every((l) => textPx(l.text ?? '', code) <= width) ? code : codeNum
  w.fit(64 + 64 + (d.lines ?? []).length * ROW)
  return `<div class="term" style="--term-size:${size}px">${terminalWindow(d, w, { size, width, t0: w.enter, max: MAX })}</div>`
}
