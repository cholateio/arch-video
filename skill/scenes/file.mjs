// file: a window showing a file excerpt; the lines being narrated are highlighted and get a callout on the right.
// data: { path, lines: [string], at?, highlights?: [{ from, to?, at, note? }] }
import { esc, isWide, textPx } from '../lib/util.mjs'

const MAX_ROWS = 11
const ROW_H = 54
const TEXT_W = 1048 // window width minus the line-number column and right padding
const NOTE_W = 424 // width available to callout text (500px column minus the leader line)

export default function file(scene, ctx) {
  const d = scene.data
  const type = ctx.theme.type
  let lines = d.lines
  if (lines.length > MAX_ROWS) {
    ctx.warn(`檔案節錄有 ${lines.length} 行，只顯示前 ${MAX_ROWS} 行`)
    lines = lines.slice(0, MAX_ROWS)
  }
  lines = lines.map((line, i) => {
    if (textPx(line, type.code) <= TEXT_W) return line
    ctx.warn(`第 ${i + 1} 行太長，已截斷`)
    let cut = [...line]
    while (textPx(cut.join('') + '…', type.code) > TEXT_W) cut.pop()
    return cut.join('') + '…'
  })
  const hs = (d.highlights ?? []).map((h) => ({ ...h, to: h.to ?? h.from }))
  hs.forEach((h) => {
    if (h.from < 1 || h.to > lines.length) throw new Error(`場景 ${scene.id}：標示範圍 ${h.from}–${h.to} 超出節錄的行數`)
    if (h.note && [...h.note].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0) * type.note > NOTE_W) ctx.warn(`註解「${h.note}」太長，會超出畫面（最多約 ${Math.floor(NOTE_W / type.note)} 個全形字）`)
  })
  // The window is vertically centred in the stage.
  const winH = 3 + 64 + 22 + lines.length * ROW_H + 22 + 3
  const winTop = Math.max(0, Math.round((ctx.theme.stage.height - winH) / 2))
  const rowTop = (n) => winTop + 3 + 64 + 22 + (n - 1) * ROW_H

  const html = `<div class="stage file">
  <div class="win" style="top:${winTop}px">
    <div class="bar"><i></i><i></i><i></i><span class="path">${esc(d.path)}</span></div>
    <ol class="code">
${lines.map((line, i) => `      <li class="lrow r${i + 1}${/^#+\s/.test(line) ? ' h' : ''}"><b class="mark"></b><span class="n">${i + 1}</span><span class="c">${esc(line)}</span></li>`).join('\n')}
    </ol>
  </div>
  ${hs.map((h, k) => (h.note ? `<div class="note nt${k}" style="top:${rowTop(h.from) + ((h.to - h.from) * ROW_H) / 2}px"><i></i><span>${esc(h.note)}</span></div>` : '')).join('\n  ')}
</div>`

  const t0 = ctx.t()
  ctx.init('.mark', { scaleY: 0 })
  ctx.from('.win', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, t0)
  ctx.from('.lrow', { opacity: 0, x: -14, duration: 0.3, stagger: 0.07, ease: 'power2.out' }, d.at != null ? ctx.t(d.at) : t0 + 0.25)

  const rowsOf = (h, suffix = '') => Array.from({ length: h.to - h.from + 1 }, (_, i) => `.r${h.from + i}${suffix}`).join(', ')
  const timed = hs.map((h) => ({ ...h, t: ctx.t(h.at) })).sort((a, b) => a.t - b.t)
  timed.forEach((h, k) => {
    const inside = new Set(Array.from({ length: h.to - h.from + 1 }, (_, i) => h.from + i))
    const others = lines.map((_, i) => i + 1).filter((n) => !inside.has(n)).map((n) => `.r${n}`).join(', ')
    if (others) ctx.to(others, { opacity: 0.28, duration: 0.3 }, h.t)
    ctx.to(rowsOf(h), { opacity: 1, duration: 0.3 }, h.t)
    ctx.to(rowsOf(h, ' .mark'), { scaleY: 1, duration: 0.25, ease: 'power2.out' }, h.t)
    const idx = hs.findIndex((x) => x.from === h.from && x.at === h.at)
    if (h.note) {
      ctx.from(`.nt${idx}`, { opacity: 0, x: -12, duration: 0.3, ease: 'power2.out' }, h.t + 0.1)
      ctx.from(`.nt${idx} i`, { scaleX: 0, duration: 0.3, ease: 'power2.out' }, h.t + 0.1)
    }
    const prev = timed[k - 1]
    if (prev) {
      ctx.to(rowsOf(prev, ' .mark'), { scaleY: 0, duration: 0.2 }, h.t)
      const pidx = hs.findIndex((x) => x.from === prev.from && x.at === prev.at)
      if (prev.note) ctx.to(`.nt${pidx}`, { opacity: 0.35, duration: 0.3 }, h.t)
    }
  })
  return html
}
