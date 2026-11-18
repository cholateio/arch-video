// map：藍圖地圖。直接使用 arch-blueprint 產出的 SVG：分區、節點、連線依序畫出來，
// 旁白講到某一區時鏡頭拉近那一區，其他部分淡掉。
// data: { svg, at?, title?: true, focus?: [{ zone: "<分區 id>" | null, at }] }
//   title 預設不顯示 SVG 自己的圖名（影片裡由旁白與章節標示交代）；寫 true 才顯示。
//   zone 寫 arch-blueprint SVG 裡分區的 id（例如 "zone-backend"）；寫 null 代表拉回全圖。
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'cheerio'

const num = (el, name) => Number(el.attr(name))

// 讀出路徑的起點與終點（arch-blueprint 的連線只用 M/H/V/L 與相對弧線 a）
function endpoints(d) {
  let x = 0, y = 0, start = null
  const pts = []
  for (const [, cmd, rest] of d.matchAll(/([MmHhVvLlAa])([^MmHhVvLlAa]*)/g)) {
    const n = rest.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (cmd === 'M') [x, y] = n.slice(-2)
    else if (cmd === 'm') { x += n.at(-2); y += n.at(-1) }
    else if (cmd === 'H') x = n.at(-1)
    else if (cmd === 'h') x += n.reduce((a, b) => a + b, 0)
    else if (cmd === 'V') y = n.at(-1)
    else if (cmd === 'v') y += n.reduce((a, b) => a + b, 0)
    else if (cmd === 'L') [x, y] = n.slice(-2)
    else if (cmd === 'l') for (let i = 0; i < n.length; i += 2) { x += n[i]; y += n[i + 1] }
    else if (cmd === 'A') [x, y] = n.slice(-2)
    else if (cmd === 'a') for (let i = 0; i < n.length; i += 7) { x += n[i + 5]; y += n[i + 6] }
    start ??= { x, y }
    pts.push({ x, y })
  }
  return { start, end: { x, y }, pts }
}

const inside = (p, r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

export default function map(scene, ctx) {
  const d = scene.data
  const file = path.resolve(ctx.baseDir, d.svg)
  // arch-blueprint 的圖固定用紙色與墨黑兩個顏色，這裡換成目前主題的底色與線條色
  const { paper, surface, ink } = ctx.theme.color
  const source = fs.readFileSync(file, 'utf8').replace(/#1a1a1a/gi, ink).replace(/#faf8f4/gi, paper)
  const $ = load(source, { xml: true })
  const svg = $('svg').first()
  const [, , vw, vh] = svg.attr('viewBox').split(/[\s,]+/).map(Number)
  const { accent } = ctx.theme.color
  const stage = ctx.theme.mapStage
  const aspect = stage.width / stage.height

  // 清掉背景底色與說明文字，只留圖本身
  svg.children('rect').filter((_, el) => !$(el).attr('class') && num($(el), 'width') >= vw).remove()
  svg.attr('color', ink)
  svg.children('title, desc').remove()
  svg.removeAttr('aria-labelledby').removeAttr('role')
  const heading = svg.children('text')
  const showTitle = d.title === true
  if (showTitle) heading.addClass('heading')
  else heading.remove()

  // 量出各分區、節點、連線的位置，決定拉近時誰留下、誰淡掉
  const zones = $('g.zone').toArray().map((el) => {
    const r = $(el).children('rect').first()
    return { id: $(el).attr('id'), x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }
  })
  const nodes = $('g.node').toArray().map((el) => {
    const r = $(el).children('rect').first()
    return { id: $(el).attr('id'), c: { x: num(r, 'x') + num(r, 'width') / 2, y: num(r, 'y') + num(r, 'height') / 2 } }
  })
  const edges = $('path.edge').toArray().map((el) => ({ id: $(el).attr('id'), dashed: !!$(el).attr('stroke-dasharray'), ...endpoints($(el).attr('d')) }))
  const labels = $('g.label').toArray().map((el) => ({ id: $(el).attr('id'), edge: $(el).attr('data-edge') }))

  // 實線改成可以「畫出來」的線；箭頭另外放一份，線畫完才顯示（否則箭頭會先出現在終點）
  $('path.edge').each((_, el) => {
    const e = $(el)
    if (e.attr('stroke-dasharray')) return
    if (e.attr('marker-end')) {
      const head = e.clone().attr('id', `${e.attr('id')}-head`).attr('class', 'head').attr('stroke', 'none')
      e.removeAttr('marker-end').after(head)
    }
    e.attr('pathLength', '1').attr('stroke-dasharray', '1').attr('stroke-dashoffset', '1')
  })
  $('g.node > rect').attr('fill', surface).attr('pathLength', '1').attr('stroke-dasharray', '1').attr('stroke-dashoffset', '1')

  // 同一支影片可能放好幾張圖，id 加上場景前綴避免互相衝突
  const P = `${ctx.id}-`
  $('[id]').each((_, el) => { $(el).attr('id', P + $(el).attr('id')) })
  $('[href]').each((_, el) => { const h = $(el).attr('href'); if (h.startsWith('#')) $(el).attr('href', `#${P}${h.slice(1)}`) })
  for (const a of ['marker-end', 'marker-start', 'fill', 'stroke']) {
    $(`[${a}]`).each((_, el) => { const v = $(el).attr(a); if (v.includes('url(#')) $(el).attr(a, v.replace(/url\(#/g, `url(#${P}`)) })
  }

  // 鏡頭：viewBox 一律補成舞台的長寬比，拉近拉遠時畫面才不會跳
  const fit = (r, pad) => {
    let w = r.w + pad * 2, h = r.h + pad * 2
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    return [r.x + r.w / 2 - w / 2, r.y + r.h / 2 - h / 2, w, h].map((n) => Math.round(n * 10) / 10).join(' ')
  }
  // 全圖：貼齊分區、節點與連線的外框，不含 SVG 四周的留白
  const xs = [], ys = []
  zones.forEach((z) => { xs.push(z.x, z.x + z.w); ys.push(z.y, z.y + z.h) })
  nodes.forEach((n) => { xs.push(n.c.x - 96, n.c.x + 96); ys.push(n.c.y - 32, n.c.y + 32) })
  edges.forEach((e) => e.pts.forEach((p) => { xs.push(p.x); ys.push(p.y) }))
  const box = xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : { x: 0, y: 0, w: vw, h: vh }
  if (showTitle) { box.h += box.y - 40; box.y = 40 }
  const full = fit(box, 16)
  svg.attr('viewBox', full).attr('preserveAspectRatio', 'xMidYMid meet')
  const html = `<div class="map" style="left:${stage.x}px;top:${stage.y}px;width:${stage.width}px;height:${stage.height}px">${$.xml(svg)}</div>`

  const S = (id) => `#${P}${id}`
  const t0 = ctx.t(d.at)
  if (showTitle && heading.length) ctx.from('.heading', { opacity: 0, duration: 0.4 }, t0)
  ctx.from('g.zone', { opacity: 0, duration: 0.35, stagger: 0.1, ease: 'power2.out' }, t0 + 0.1)
  const tN = t0 + 0.3 + zones.length * 0.1
  nodes.forEach((n, i) => {
    ctx.to(`${S(n.id)} > rect`, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, tN + i * 0.07)
    ctx.from(`${S(n.id)} > text, ${S(n.id)} > use`, { opacity: 0, duration: 0.3 }, tN + i * 0.07 + 0.25)
  })
  const tE = tN + nodes.length * 0.07 + 0.3
  edges.forEach((e, i) => {
    const t = tE + i * 0.08
    if (e.dashed) ctx.from(S(e.id), { opacity: 0, duration: 0.4 }, t)
    else {
      ctx.to(S(e.id), { strokeDashoffset: 0, duration: 0.4, ease: 'power1.inOut' }, t)
      ctx.from(S(`${e.id}-head`), { opacity: 0, duration: 0.08 }, t + 0.36)
    }
    labels.filter((l) => l.edge === e.id).forEach((l) => ctx.from(S(l.id), { opacity: 0, duration: 0.25 }, t + 0.4))
  })

  // 拉近：旁白講到某一區時
  const dim = ctx.theme.dim
  const steps = (d.focus ?? []).map((f) => ({ ...f, t: ctx.t(f.at) })).sort((a, b) => a.t - b.t)
  let lit = null
  for (const f of steps) {
    const z = f.zone ? zones.find((x) => x.id === f.zone) : null
    if (f.zone && !z) throw new Error(`場景 ${scene.id}：圖裡沒有分區「${f.zone}」（有：${zones.map((x) => x.id).join('、')}）`)
    ctx.to('svg', { attr: { viewBox: z ? fit(z, 40) : full }, duration: 0.9, ease: 'power2.inOut' }, f.t)
    if (lit) {
      ctx.to(`${S(lit.id)} > rect`, { stroke: ctx.theme.color.ink, strokeWidth: 1.2, duration: 0.3 }, f.t)
      ctx.to(`${S(lit.id)} > text`, { fill: ctx.theme.color.ink, duration: 0.3 }, f.t)
    }
    const keep = (on) => ({ opacity: on ? 1 : dim, duration: 0.5 })
    zones.forEach((x) => ctx.to(S(x.id), keep(!z || x.id === z.id), f.t))
    nodes.forEach((n) => ctx.to(S(n.id), keep(!z || inside(n.c, z)), f.t))
    edges.forEach((e) => {
      const on = !z || inside(e.start, z, 12) || inside(e.end, z, 12)
      ctx.to(e.dashed ? S(e.id) : `${S(e.id)}, ${S(`${e.id}-head`)}`, keep(on), f.t)
      labels.filter((l) => l.edge === e.id).forEach((l) => ctx.to(S(l.id), keep(on), f.t))
    })
    if (showTitle && heading.length) ctx.to('.heading', keep(!z), f.t)
    if (z) {
      ctx.to(`${S(z.id)} > rect`, { stroke: accent, strokeWidth: 2, duration: 0.4 }, f.t + 0.3)
      ctx.to(`${S(z.id)} > text`, { fill: accent, duration: 0.4 }, f.t + 0.3)
    }
    lit = z
  }
  return html
}
