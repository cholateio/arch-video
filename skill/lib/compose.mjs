// 合成：分鏡 + 時間軸 + 場景元件 + 主題 → 一個 HyperFrames 專案（index.html 與它用到的字型、音檔）。
import fs from 'node:fs'
import path from 'node:path'
import scenes from '../scenes/index.mjs'
import { LEAD, cueTime } from './timeline.mjs'
import { ROOT, esc, round, isWide } from './util.mjs'

const FONTS = [
  ['@fontsource/jetbrains-mono', ['latin-400.css', 'latin-600.css', 'latin-700.css']],
  ['@fontsource/noto-sans-tc', ['400.css', '700.css']],
]

// 字型隨專案附帶：從 npm 套件複製到專案裡，渲染時不需要連網
function installFonts(buildDir) {
  const dir = path.join(buildDir, 'fonts')
  fs.mkdirSync(dir, { recursive: true })
  let css = ''
  for (const [pkg, files] of FONTS) {
    const base = path.join(ROOT, 'node_modules', pkg)
    for (const f of files) {
      css += fs.readFileSync(path.join(base, f), 'utf8')
        .replace(/src:\s*url\(\.\/files\/([^)]+\.woff2)\)\s*format\('woff2'\)[^;]*;/g, (_, name) => {
          const dest = path.join(dir, name)
          if (!fs.existsSync(dest)) fs.copyFileSync(path.join(base, 'files', name), dest)
          return `src: url(fonts/${name}) format('woff2');`
        })
        .replace(/font-display:\s*swap/g, 'font-display: block')
    }
  }
  return css
}

const rootVars = (theme) => `:root {
  --paper: ${theme.color.paper}; --surface: ${theme.color.surface}; --ink: ${theme.color.ink}; --accent: ${theme.color.accent}; --accent2: ${theme.color.accent2};
  --wipe: ${theme.color.wipe}; --progress: ${theme.color.progress}; --chip-bg: ${theme.color.chipBg}; --rule: ${theme.color.rule};
  --glow: ${theme.glow}; --scrim: ${theme.scrim};
  --sub-size: ${theme.sub.size}px; --sub-weight: ${theme.sub.weight}; --sub-bg: ${theme.sub.bg}; --sub-fg: ${theme.sub.fg}; --sub-shadow: ${theme.sub.shadow};
  --align-items: ${theme.layout.align === 'center' ? 'center' : 'flex-start'}; --text-align: ${theme.layout.align}; --inset: ${theme.layout.inset}px;
  --ink-soft: color-mix(in srgb, ${theme.color.ink} 62%, transparent);
  --font-mono: ${theme.font.mono}; --font-tc: ${theme.font.tc};
  --w: ${theme.frame.width}px; --h: ${theme.frame.height}px;
  --stage-x: ${theme.stage.x}px; --stage-y: ${theme.stage.y}px; --stage-w: ${theme.stage.width}px; --stage-h: ${theme.stage.height}px;
  --line: ${theme.line.main}px; --line-thin: ${theme.line.thin}px; --radius: 16px;
  ${Object.entries(theme.type).filter(([, v]) => typeof v === 'number').map(([k, v]) => `--fs-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}px;`).join(' ')}
}`

const subtitleUnits = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.5), 0)

export function compose(board, tl, { theme, buildDir, baseDir, warn }) {
  fs.mkdirSync(path.join(buildDir, 'audio'), { recursive: true })
  const W = theme.frame.width
  const anims = []
  const inits = []
  const body = []

  // 場景
  board.scenes.forEach((s, i) => {
    const ts = tl.scenes[i]
    const render = scenes[s.type]
    if (!render) throw new Error(`場景 ${s.id}：不認得的元件類型「${s.type}」（有：${Object.keys(scenes).join('、')}）`)
    const scope = (sel) => sel.split(',').map((p) => `#${s.id} ${p.trim()}`).join(', ')
    const check = (t, sel) => {
      if (t > ts.end + 0.01) warn(`場景 ${s.id}：${sel} 的動畫排在 ${round(t)} 秒，晚於場景結束（${ts.end} 秒）`)
      return round(t)
    }
    const ctx = {
      id: s.id, theme, baseDir, scene: ts,
      t: (at) => cueTime(ts, at),
      warn: (m) => warn(`場景 ${s.id}：${m}`),
      to: (sel, vars, t) => anims.push(['to', scope(sel), vars, check(t, sel)]),
      from: (sel, vars, t) => anims.push(['from', scope(sel), vars, check(t, sel)]),
      init: (sel, vars) => inits.push([scope(sel), vars]),
      fromTo: (sel, a, b, t) => anims.push(['fromTo', scope(sel), a, b, check(t, sel)]),
    }
    const before = anims.length
    const inner = render(s, ctx)
    // 場景開始後畫面不能空白太久：第一個元素要在 1.5 秒內出現
    const first = Math.min(...anims.slice(before).map((a) => a.at(-1)))
    if (first - ts.contentStart > 1.5) warn(`場景 ${s.id}：開場後 ${round(first - ts.contentStart)} 秒畫面才有東西，請讓第一個元素早點出現`)
    const next = tl.scenes[i + 1]
    const duration = round(ts.end - ts.start + (next?.transition === 'push' ? LEAD.push : 0))
    body.push(`<section id="${s.id}" class="scene clip" data-start="${ts.start}" data-duration="${duration}">\n${inner}\n</section>`)

    // 進場轉場
    const T = ts.start
    const prev = tl.scenes[i - 1]
    if (ts.transition === 'push') {
      anims.push(['to', `#${prev.id}`, { x: -W, duration: 0.6, ease: 'power3.inOut' }, T])
      anims.push(['fromTo', `#${s.id}`, { x: W }, { x: 0, duration: 0.6, ease: 'power3.inOut' }, T])
    } else if (ts.transition === 'wipe') {
      anims.push(['fromTo', '#wipe i', { xPercent: -101 }, { xPercent: 0, duration: 0.3, stagger: 0.04, ease: 'power3.in', immediateRender: false }, round(T - 0.5)])
      anims.push(['to', '#wipe i', { xPercent: 101, duration: 0.3, stagger: 0.04, ease: 'power3.out' }, round(T + 0.05)])
    } else if (ts.transition === 'zoom') {
      anims.push(['to', `#${prev.id}`, { opacity: 0, scale: 0.96, duration: 0.25, ease: 'power2.in' }, round(T - 0.25)])
      anims.push(['from', `#${s.id}`, { opacity: 0, scale: 1.06, duration: 0.45, ease: 'power2.out' }, T])
    }
  })
  inits.push(['#wipe i', { xPercent: -101 }])

  // 章節標示：同一章的連續場景共用一個
  const chapters = board.chapters ?? []
  let run = null
  const runs = []
  tl.scenes.forEach((ts) => {
    if (run && run.chapter === ts.chapter) run.end = ts.end
    else { run = { chapter: ts.chapter, start: ts.start, end: ts.end, lead: LEAD[ts.transition] }; runs.push(run) }
  })
  const pad = (n) => String(n).padStart(2, '0')
  runs.filter((r) => r.chapter).forEach((r, k) => {
    const idx = chapters.findIndex((c) => c.id === r.chapter)
    if (idx < 0) throw new Error(`章節「${r.chapter}」沒有列在 chapters 裡`)
    body.push(`<div id="chip-${k}" class="chip clip" data-start="${r.start}" data-duration="${round(r.end - r.start)}"><b>${pad(idx + 1)} / ${pad(chapters.length)}</b>${esc(chapters[idx].label)}</div>`)
    anims.push(['from', `#chip-${k}`, { opacity: 0, x: -12, duration: 0.3, ease: 'power2.out' }, round(r.start + r.lead)])
  })
  body.push('<div id="glow"></div>')
  body.push('<div id="scrim"></div>')
  body.push('<div id="progress"></div>')
  anims.push(['fromTo', '#progress', { scaleX: 0 }, { scaleX: 1, duration: tl.total, ease: 'none' }, 0])
  body.push(`<div id="wipe">${'<i></i>'.repeat(6)}</div>`)

  // 字幕與旁白：一句旁白 = 一行字幕 = 一段音檔
  const flat = tl.scenes.flatMap((ts) => ts.lines.map((line, j) => ({ ts, line, j })))
  flat.forEach(({ ts, line, j }, n) => {
    const text = line.text.replace(/[。．.]\s*$/, '')
    if (subtitleUnits(text) > 30) warn(`場景 ${ts.id} 第 ${j + 1} 句字幕有 ${Math.round(subtitleUnits(text))} 個全形字寬，超過 30 會超出一行`)
    const start = round(line.start - 0.05)
    const until = Math.min(line.end + 0.25, flat[n + 1] ? flat[n + 1].line.start - 0.07 : tl.total)
    body.push(`<div id="sub-${ts.id}-${j}" class="sub clip" data-start="${start}" data-duration="${round(until - start)}"><span>${esc(text)}</span></div>`)
    if (line.file) {
      const name = path.basename(line.file)
      fs.copyFileSync(line.file, path.join(buildDir, 'audio', name))
      body.push(`<audio id="vo-${ts.id}-${j}" data-start="${round(line.start)}" data-duration="${round(line.duration)}" data-volume="1" src="audio/${name}"></audio>`)
    }
  })

  fs.copyFileSync(path.join(ROOT, 'node_modules/gsap/dist/gsap.min.js'), path.join(buildDir, 'gsap.min.js'))
  const css = [installFonts(buildDir), rootVars(theme), fs.readFileSync(path.join(ROOT, 'themes/base.css'), 'utf8')].join('\n')
  const markup = body.join('\n')
  // 畫面上會出現的所有字，用來在第一格之前把字型載完
  const glyphs = [...new Set(markup.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot);/g, '&<>"'))].filter((c) => c.trim()).join('')
  const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c')

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${theme.frame.width}, height=${theme.frame.height}" />
<title>${esc(board.meta?.title ?? board.meta?.name ?? 'arch-video')}</title>
<script src="gsap.min.js"></script>
<style>
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${theme.frame.width}" data-height="${theme.frame.height}" data-fps="${theme.frame.fps}">
${markup}
</div>
<script>
const GLYPHS = ${json(glyphs)};
for (const f of ['400 32px "JetBrains Mono"', '600 32px "JetBrains Mono"', '700 32px "JetBrains Mono"', '400 32px "Noto Sans TC"', '700 32px "Noto Sans TC"']) document.fonts.load(f, GLYPHS);
for (const [sel, vars] of ${json(inits)}) gsap.set(sel, vars);
const tl = gsap.timeline({ paused: true });
for (const [method, sel, ...rest] of ${json(anims)}) {
  if (!document.querySelector(sel)) console.error("arch-video: 找不到動畫對象 " + sel);
  tl[method](sel, ...rest);
}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`
  fs.writeFileSync(path.join(buildDir, 'index.html'), html)
  return { animations: anims.length }
}
