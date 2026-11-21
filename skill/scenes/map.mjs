// map: animates the SVG that arch-blueprint produces. Zones, nodes and edges draw in order;
// when the narration reaches a zone the camera zooms to it and everything else dims.
// data: { svg, at?, draw?: false, title?: true, focus?: [Step] }
//   draw: false shows the finished diagram at once, for a scene that continues from an earlier map scene.
//   title: the SVG's own heading is hidden unless true (the narration covers it).
//   Step: { at, zone?, nodes?, trace? }
//     zone:  a zone id (e.g. "zone-backend"); the camera zooms to it and its border turns accent.
//     nodes: node ids to keep lit (e.g. ["n-api", "n-query"]); the camera frames them.
//     trace: edge ids to follow (e.g. ["e-api-query"]); the edge turns accent, a pulse runs along it,
//            and the nodes at both ends stay lit.
//     A step with none of the three zooms back out to the full diagram.
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'cheerio'

const num = (el, name) => Number(el.attr(name))

// Start and end points of a path (arch-blueprint edges only use M/H/V/L and the relative arc a).
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
  // arch-blueprint diagrams hard-code two colours (paper and ink); swap them for the theme's ground and line colours.
  const { paper, surface, ink } = ctx.theme.color
  const source = fs.readFileSync(file, 'utf8').replace(/#1a1a1a/gi, ink).replace(/#faf8f4/gi, paper)
  const $ = load(source, { xml: true })
  const svg = $('svg').first()
  const [, , vw, vh] = svg.attr('viewBox').split(/[\s,]+/).map(Number)
  const { accent } = ctx.theme.color
  const stage = ctx.theme.mapStage
  const aspect = stage.width / stage.height

  // Drop the background and metadata; keep the drawing.
  svg.children('rect').filter((_, el) => !$(el).attr('class') && num($(el), 'width') >= vw).remove()
  svg.attr('color', ink)
  svg.children('title, desc').remove()
  svg.removeAttr('aria-labelledby').removeAttr('role')
  const heading = svg.children('text')
  const showTitle = d.title === true
  if (showTitle) heading.addClass('heading')
  else heading.remove()

  // Measure zones, nodes and edges to decide what stays lit when zooming.
  const zones = $('g.zone').toArray().map((el) => {
    const r = $(el).children('rect').first()
    return { id: $(el).attr('id'), x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }
  })
  const nodes = $('g.node').toArray().map((el) => {
    const r = $(el).children('rect').first()
    const box = { x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }
    return { id: $(el).attr('id'), r: box, c: { x: box.x + box.w / 2, y: box.y + box.h / 2 } }
  })
  const edges = $('path.edge').toArray().map((el) => ({ id: $(el).attr('id'), dashed: !!$(el).attr('stroke-dasharray'), head: !!$(el).attr('marker-end'), ...endpoints($(el).attr('d')) }))
  const labels = $('g.label').toArray().map((el) => ({ id: $(el).attr('id'), edge: $(el).attr('data-edge') }))

  const animate = d.draw !== false
  if (!animate) ctx.present()
  for (const f of d.focus ?? []) {
    for (const key of ['trace', 'nodes']) {
      if (f[key] != null && !Array.isArray(f[key])) throw new Error(`場景 ${scene.id}：focus 的 ${key} 要寫成陣列，例如 ["${f[key]}"]`)
    }
  }
  const steps = (d.focus ?? []).map((f) => ({ ...f, t: ctx.t(f.at) })).sort((a, b) => a.t - b.t)
  const tracedIds = new Set(steps.flatMap((f) => f.trace ?? []))
  for (const id of tracedIds) {
    if (!edges.some((e) => e.id === id)) throw new Error(`場景 ${scene.id}：圖裡沒有連線「${id}」（有：${edges.map((e) => e.id).join('、')}）`)
  }

  // An accent copy of the arrowhead marker, for edges that are being traced.
  const marker = $('marker').first()
  if (marker.length) {
    const copy = marker.clone().attr('id', `${marker.attr('id')}-accent`)
    copy.find('[stroke]').each((_, el) => { if ($(el).attr('stroke').toLowerCase() === ink.toLowerCase()) $(el).attr('stroke', accent) })
    marker.after(copy)
  }

  // Solid edges become drawable strokes. The arrowhead is a separate copy shown once the stroke finishes; otherwise it would sit at the end point from the start.
  $('path.edge').each((_, el) => {
    const e = $(el)
    const id = e.attr('id')
    const dashed = !!e.attr('stroke-dasharray')
    const end = e.attr('marker-end')
    e.removeAttr('marker-end')
    if (tracedIds.has(id)) {
      // The pulse: a short accent dash that travels along the edge while it is traced.
      e.after(e.clone().attr('id', `${id}-pulse`).attr('class', 'pulse').attr('stroke', accent).attr('stroke-width', '4').attr('stroke-linecap', 'round')
        .attr('pathLength', '1').attr('stroke-dasharray', '0.14 1').attr('stroke-dashoffset', '0.14').attr('opacity', '0'))
    }
    if (end) {
      const head = e.clone().attr('id', `${id}-head`).attr('class', 'head').attr('stroke', 'none').removeAttr('stroke-dasharray').attr('marker-end', end)
      const lit = head.clone().attr('id', `${id}-head2`).attr('class', 'head2').attr('marker-end', end.replace(')', '-accent)')).attr('opacity', '0')
      e.after(lit).after(head)
    }
    if (!dashed && animate) e.attr('pathLength', '1').attr('stroke-dasharray', '1').attr('stroke-dashoffset', '1')
  })
  $('g.node > rect').attr('fill', surface)
  if (animate) $('g.node > rect').attr('pathLength', '1').attr('stroke-dasharray', '1').attr('stroke-dashoffset', '1')

  // A video may hold several diagrams: prefix ids with the scene id so they cannot collide.
  const P = `${ctx.id}-`
  $('[id]').each((_, el) => { $(el).attr('id', P + $(el).attr('id')) })
  $('[href]').each((_, el) => { const h = $(el).attr('href'); if (h.startsWith('#')) $(el).attr('href', `#${P}${h.slice(1)}`) })
  for (const a of ['marker-end', 'marker-start', 'fill', 'stroke']) {
    $(`[${a}]`).each((_, el) => { const v = $(el).attr(a); if (v.includes('url(#')) $(el).attr(a, v.replace(/url\(#/g, `url(#${P}`)) })
  }

  // Camera: every viewBox is padded to the stage aspect ratio so zooming does not jump.
  const MIN_W = 560 // do not zoom in further than this many diagram units across
  const fit = (r, pad) => {
    let w = r.w + pad * 2, h = r.h + pad * 2
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    if (w < MIN_W) { h *= MIN_W / w; w = MIN_W }
    return [r.x + r.w / 2 - w / 2, r.y + r.h / 2 - h / 2, w, h].map((n) => Math.round(n * 10) / 10).join(' ')
  }
  const bounds = (xs, ys) => ({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
  // Full view: fit the bounds of zones, nodes and edges, without the SVG's outer margin.
  const xs = [], ys = []
  zones.forEach((z) => { xs.push(z.x, z.x + z.w); ys.push(z.y, z.y + z.h) })
  nodes.forEach((n) => { xs.push(n.r.x, n.r.x + n.r.w); ys.push(n.r.y, n.r.y + n.r.h) })
  edges.forEach((e) => e.pts.forEach((p) => { xs.push(p.x); ys.push(p.y) }))
  const box = xs.length ? bounds(xs, ys) : { x: 0, y: 0, w: vw, h: vh }
  if (showTitle) { box.h += box.y - 40; box.y = 40 }
  const full = fit(box, 16)
  svg.attr('viewBox', full).attr('preserveAspectRatio', 'xMidYMid meet')
  const html = `<div class="map" style="left:${stage.x}px;top:${stage.y}px;width:${stage.width}px;height:${stage.height}px">${$.xml(svg)}</div><div class="map-fade"></div>`

  const S = (id) => `#${P}${id}`
  const t0 = ctx.t(d.at)
  if (animate) {
    if (showTitle && heading.length) ctx.from('.heading', { opacity: 0, duration: 0.4 }, t0)
    ctx.from('g.zone', { opacity: 0, duration: 0.35, stagger: 0.1, ease: 'power2.out' }, t0 + 0.1)
    const tN = t0 + 0.3 + zones.length * 0.1
    nodes.forEach((n, i) => {
      // The node rect has a fill, so keep the whole node hidden until its outline starts drawing.
      ctx.from(S(n.id), { opacity: 0, duration: 0.12 }, tN + i * 0.07)
      ctx.to(`${S(n.id)} > rect`, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, tN + i * 0.07)
      ctx.from(`${S(n.id)} > text, ${S(n.id)} > use`, { opacity: 0, duration: 0.3 }, tN + i * 0.07 + 0.25)
    })
    const tE = tN + nodes.length * 0.07 + 0.3
    edges.forEach((e, i) => {
      const t = tE + i * 0.08
      if (e.dashed) ctx.from(S(e.id), { opacity: 0, duration: 0.4 }, t)
      else ctx.to(S(e.id), { strokeDashoffset: 0, duration: 0.4, ease: 'power1.inOut' }, t)
      if (e.head) ctx.from(S(`${e.id}-head`), { opacity: 0, duration: 0.08 }, t + 0.36)
      labels.filter((l) => l.edge === e.id).forEach((l) => ctx.from(S(l.id), { opacity: 0, duration: 0.25 }, t + 0.4))
    })
  }

  // Camera steps: zoom to a zone, frame a few nodes, or follow an edge.
  const dim = ctx.theme.dim
  const nodeAt = (p) => nodes.find((n) => inside(p, n.r, 14))
  let litZone = null
  let wasTraced = new Set()
  for (const [k, f] of steps.entries()) {
    const until = Math.min(steps[k + 1]?.t ?? Infinity, ctx.scene.end)
    const z = f.zone ? zones.find((x) => x.id === f.zone) : null
    if (f.zone && !z) throw new Error(`場景 ${scene.id}：圖裡沒有分區「${f.zone}」（有：${zones.map((x) => x.id).join('、')}）`)
    const traced = new Set(f.trace ?? [])
    for (const id of f.nodes ?? []) {
      if (!nodes.some((n) => n.id === id)) throw new Error(`場景 ${scene.id}：圖裡沒有節點「${id}」（有：${nodes.map((n) => n.id).join('、')}）`)
    }
    const reset = !z && !f.nodes && !traced.size
    const tracedEdges = edges.filter((e) => traced.has(e.id))
    const lit = new Set(
      f.nodes ? f.nodes
        : traced.size ? tracedEdges.flatMap((e) => [nodeAt(e.start), nodeAt(e.end)]).filter(Boolean).map((n) => n.id)
        : nodes.filter((n) => !z || inside(n.c, z)).map((n) => n.id),
    )

    let view = full
    if (z && !f.nodes && !traced.size) view = fit(z, 40)
    else if (!reset) {
      const px = [], py = []
      nodes.filter((n) => lit.has(n.id)).forEach((n) => { px.push(n.r.x, n.r.x + n.r.w); py.push(n.r.y, n.r.y + n.r.h) })
      tracedEdges.forEach((e) => e.pts.forEach((p) => { px.push(p.x); py.push(p.y) }))
      if (px.length) view = fit(bounds(px, py), 70)
    }
    ctx.to('svg', { attr: { viewBox: view }, duration: 0.9, ease: 'power2.inOut' }, f.t)

    if (litZone && litZone !== z) {
      ctx.to(`${S(litZone.id)} > rect`, { stroke: ink, strokeWidth: 1.2, duration: 0.3 }, f.t)
      ctx.to(`${S(litZone.id)} > text`, { fill: ink, duration: 0.3 }, f.t)
    }
    const level = (on) => (on ? 1 : dim)
    zones.forEach((x) => ctx.to(S(x.id), { opacity: level(reset || x === z || nodes.some((n) => lit.has(n.id) && inside(n.c, x))), duration: 0.5 }, f.t))
    nodes.forEach((n) => ctx.to(S(n.id), { opacity: level(reset || lit.has(n.id)), duration: 0.5 }, f.t))
    edges.forEach((e) => {
      const tr = traced.has(e.id)
      const on = reset || tr || (z && !f.nodes && !traced.size && (inside(e.start, z, 12) || inside(e.end, z, 12)))
      ctx.to(S(e.id), { opacity: level(on), duration: 0.5 }, f.t)
      if (e.head) {
        ctx.to(S(`${e.id}-head`), { opacity: tr ? 0 : level(on), duration: 0.3 }, f.t)
        ctx.to(S(`${e.id}-head2`), { opacity: tr ? 1 : 0, duration: 0.3 }, f.t)
      }
      if (tr) {
        ctx.to(S(e.id), { stroke: accent, duration: 0.3 }, f.t)
        // The pulse runs twice when there is room before the next step (or the end of the scene), once otherwise.
        const room = until - (f.t + 0.5)
        const twice = room >= 2.7
        if (room >= 1.2) {
          ctx.fromTo(S(`${e.id}-pulse`), { strokeDashoffset: 0.14, opacity: 1 }, { strokeDashoffset: -1, duration: 1.1, ease: 'power1.inOut', repeat: twice ? 1 : 0, repeatDelay: 0.25, immediateRender: false }, f.t + 0.5)
          ctx.to(S(`${e.id}-pulse`), { opacity: 0, duration: 0.15 }, f.t + 0.5 + (twice ? 2.45 : 1.1))
        }
      } else if (wasTraced.has(e.id)) {
        ctx.to(S(e.id), { stroke: ink, duration: 0.3 }, f.t)
      }
      // Dim only the text: the label's backing rect stays opaque so the lines under it never show through.
      labels.filter((l) => l.edge === e.id).forEach((l) => ctx.to(`${S(l.id)} text`, { opacity: level(on), duration: 0.5 }, f.t))
    })
    if (showTitle && heading.length) ctx.to('.heading', { opacity: level(reset), duration: 0.5 }, f.t)
    if (z && z !== litZone) {
      ctx.to(`${S(z.id)} > rect`, { stroke: accent, strokeWidth: 2, duration: 0.4 }, f.t + 0.3)
      ctx.to(`${S(z.id)} > text`, { fill: accent, duration: 0.4 }, f.t + 0.3)
    }
    litZone = z
    wasTraced = traced
  }
  return html
}
