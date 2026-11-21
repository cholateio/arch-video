// shot: a real screenshot in a phone or browser frame. As the narration reaches each mark, a box outlines that part
// of the screen, the view pans (and optionally zooms) to it, and a callout appears beside the frame.
// data: { image, frame?: "phone" | "browser", url?, top?, marks?: [{ at, box: [x, y, w, h], note?, zoom? }] }
// `image` is a material coordinate (data:screens/x.png); build resolves it into `file`. Boxes are in image pixels.
import fs from 'node:fs'
import path from 'node:path'
import { esc, isWide, round } from '../lib/util.mjs'

const PHONE_W = 560
const PHONE_BEZEL = 14
const BAR_H = 56
const BROWSER_MAX_W = 1180
const NOTE_GAP = 70
const NOTE_ROW = 120
const MAX_ZOOM = 3
const PAN = { duration: 0.7, ease: 'power2.inOut' }

export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

export default function shot(scene, ctx) {
  const d = scene.data ?? {}
  const fail = (m) => { throw new Error(`場景 ${scene.id}：${m}`) }
  let file = d.file
  if (!file) {
    if (!d.image) fail('要有 image')
    if (/^[a-z][a-z0-9-]*:/.test(d.image)) fail(`「${d.image}」是素材的座標：分鏡要寫 meta.material，build 才找得到這張截圖`)
    file = path.resolve(ctx.baseDir, d.image)
  }
  if (!fs.existsSync(file)) fail(`找不到截圖 ${file}`)
  const size = pngSize(fs.readFileSync(file))
  if (!size) fail('截圖要是 PNG')
  const { width: IW, height: IH } = size
  const stage = ctx.theme.stage
  const frame = d.frame ?? (IH > IW ? 'phone' : 'browser')
  if (!['phone', 'browser'].includes(frame)) fail(`frame 只能是 phone 或 browser，現在是「${frame}」`)

  const marks = (d.marks ?? []).map((m, i) => {
    if (m.at == null) fail(`第 ${i + 1} 個 mark 要有 at（旁白裡的觸發詞）`)
    const b = m.box
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number' || v < 0)) fail(`第 ${i + 1} 個 mark 的 box 要寫成 [x, y, 寬, 高]，單位是截圖的像素`)
    if (b[0] + b[2] > IW || b[1] + b[3] > IH) fail(`第 ${i + 1} 個 mark 的 box 超出截圖（${IW}x${IH}）`)
    const zoom = m.zoom ?? 1
    if (!(zoom >= 1 && zoom <= MAX_ZOOM)) fail(`第 ${i + 1} 個 mark 的 zoom 要在 1 到 ${MAX_ZOOM} 之間`)
    return { ...m, zoom, i }
  })
  const notes = marks.filter((m) => m.note)

  // The view: a phone keeps a fixed width and scrolls through a tall capture; a browser window fits the whole capture.
  const chrome = frame === 'phone' ? PHONE_BEZEL * 2 : BAR_H
  let VW, VH
  if (frame === 'phone') {
    VW = PHONE_W - PHONE_BEZEL * 2
    VH = Math.min(stage.height - PHONE_BEZEL * 2, Math.round((IH * VW) / IW))
  } else {
    const maxW = notes.length ? BROWSER_MAX_W : stage.width
    VW = Math.min(maxW, Math.round(((stage.height - BAR_H) * IW) / IH))
    VH = Math.round((IH * VW) / IW)
  }
  const s = VW / IW
  const FW = frame === 'phone' ? PHONE_W : VW
  const FH = VH + chrome
  const noteW = stage.width - FW - NOTE_GAP
  const left = notes.length ? Math.max(0, Math.round((stage.width - FW - NOTE_GAP - Math.min(noteW, 560)) / 2)) : Math.round((stage.width - FW) / 2)
  const top = Math.round((stage.height - FH) / 2)
  notes.forEach((m) => {
    const units = [...m.note].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)
    if (units * ctx.theme.type.note > noteW) ctx.warn(`註解「${m.note}」太長，會超出畫面（最多約 ${Math.floor(noteW / ctx.theme.type.note)} 個全形字）`)
  })

  const start = Math.max(0, Math.min(d.top ?? 0, IH - VH / s))
  // Where the picture sits for a mark: the box centred in the view, without showing anything past the capture's edges.
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v))
  const place = (m) => {
    const [bx, by, bw, bh] = m.box.map((v) => v * s)
    // A zoom that pushes the box past the view would hide the very part being pointed at.
    const fit = Math.max(1, Math.min(VW / bw, VH / bh) * 0.96)
    const z = Math.min(m.zoom, fit)
    if (z < m.zoom) ctx.warn(`第 ${m.i + 1} 個 mark 的 zoom ${m.zoom} 會讓框超出畫面，改成 ${round(z)}`)
    return { x: round(clamp(VW / 2 - (bx + bw / 2) * z, VW - VW * z)), y: round(clamp(VH / 2 - (by + bh / 2) * z, VH - IH * s * z)), scale: z }
  }

  const src = ctx.asset(file)
  const bar = frame === 'browser' ? `<div class="bar"><i></i><i></i><i></i>${d.url ? `<span class="url">${esc(d.url)}</span>` : ''}</div>` : ''
  const noteTop = (k) => Math.round(top + FH / 2 + (k - (notes.length - 1) / 2) * NOTE_ROW)
  const html = `<div class="stage shot">
  <div class="dev ${frame}" style="left:${left}px;top:${top}px;width:${FW}px;height:${FH}px">
    ${bar}<div class="view" style="width:${VW}px;height:${VH}px">
      <div class="pan" style="width:${VW}px;height:${round(IH * s)}px">
        <img src="${src}" alt="" style="width:${VW}px;height:${round(IH * s)}px">
        ${marks.map((m) => `<b class="box b${m.i}" style="left:${round(m.box[0] * s)}px;top:${round(m.box[1] * s)}px;width:${round(m.box[2] * s)}px;height:${round(m.box[3] * s)}px"></b>`).join('\n        ')}
      </div>
    </div>
  </div>
  ${notes.map((m, k) => `<div class="note n${m.i}" style="left:${left + FW + 24}px;top:${noteTop(k)}px;width:${noteW}px"><i></i><span>${esc(m.note)}</span></div>`).join('\n  ')}
</div>`

  const t0 = ctx.t()
  ctx.init('.pan', { x: 0, y: round(-start * s), scale: 1, transformOrigin: '0 0' })
  ctx.from('.dev', { opacity: 0, y: 24, duration: 0.45, ease: 'power2.out' }, t0)
  const timed = marks.map((m) => ({ ...m, t: ctx.t(m.at) })).sort((a, b) => a.t - b.t)
  timed.forEach((m, k) => {
    const prev = timed[k - 1]
    if (prev) ctx.to(`.b${prev.i}`, { opacity: 0, duration: 0.25 }, m.t)
    if (prev?.note) ctx.to(`.n${prev.i}`, { opacity: 0.35, duration: 0.3 }, m.t)
    ctx.to('.pan', { ...place(m), ...PAN }, m.t)
    ctx.from(`.b${m.i}`, { opacity: 0, scale: 1.08, duration: 0.35, ease: 'power2.out' }, m.t + PAN.duration * 0.6)
    if (m.note) {
      ctx.from(`.n${m.i}`, { opacity: 0, x: -12, duration: 0.3, ease: 'power2.out' }, m.t + 0.2)
      ctx.from(`.n${m.i} i`, { scaleX: 0, duration: 0.3, ease: 'power2.out' }, m.t + 0.2)
    }
  })
  return html
}
