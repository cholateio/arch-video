#!/usr/bin/env node
// 用法：node scripts/arch-video.mjs build <storyboard.json> [--stills-only] [--theme <主題>] [--out <資料夾>]
//   產出 <out>/<name>/<name>.mp4，以及 <out>/<name>/stills/（每個場景一張靜態預覽圖與一張總表）。
//   --out 預設是目前資料夾底下的 out/。
//   主題預設讀分鏡的 meta.theme（沒寫就是 night）；用 --theme 指定時輸出到 <out>/<name>-<主題>/。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { synth } from '../lib/tts.mjs'
import { buildTimeline } from '../lib/timeline.mjs'
import { compose } from '../lib/compose.mjs'
import { hf, ffmpeg } from '../lib/render.mjs'
import { ROOT } from '../lib/util.mjs'

const [cmd, file, ...flags] = process.argv.slice(2)
if (cmd !== 'build' || !file) {
  console.error('用法：node scripts/arch-video.mjs build <storyboard.json> [--stills-only] [--theme <主題>] [--out <資料夾>]')
  process.exit(2)
}
const stillsOnly = flags.includes('--stills-only')
const warnings = []
const warn = (m) => warnings.push(m)
// 把累積的警告印出來。渲染前先印一次，使用者不必等幾分鐘才看到；之後新增的在結束前再印。
const flushWarnings = () => {
  if (!warnings.length) return
  console.log(`\n⚠ ${warnings.length} 個警告`)
  for (const w of warnings.splice(0)) console.log(`  - ${w}`)
}
const fail = (out) => { console.error(out); flushWarnings(); process.exit(1) }
const step = (m) => console.log(`\n▸ ${m}`)

const boardPath = path.resolve(file)
const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'))
const baseDir = path.dirname(boardPath)
const name = board.meta?.name ?? path.basename(baseDir)
const voice = board.meta?.voice ?? 'zh-TW-HsiaoChenNeural'
const themeFlag = flags.includes('--theme') ? flags[flags.indexOf('--theme') + 1] : null
const themeName = themeFlag ?? board.meta?.theme ?? 'night'
const themeFile = path.join(ROOT, 'themes', `${themeName}.mjs`)
if (!fs.existsSync(themeFile)) {
  const have = fs.readdirSync(path.join(ROOT, 'themes')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4))
  throw new Error(`沒有「${themeName}」這個主題（有：${have.join('、')}）`)
}
const theme = (await import(pathToFileURL(themeFile).href)).default
const outName = themeFlag ? `${name}-${themeFlag}` : name
const outRoot = path.resolve(flags.includes('--out') ? flags[flags.indexOf('--out') + 1] : 'out')
const outDir = path.join(outRoot, outName)
const rel = (p) => path.relative(process.cwd(), p) || '.'
const buildDir = path.join(outDir, 'project')
const stillsDir = path.join(outDir, 'stills')

// 分鏡的基本檢查
const ids = new Set()
for (const s of board.scenes) {
  if (!/^[a-z][a-z0-9-]*$/.test(s.id ?? '')) throw new Error(`場景 id「${s.id}」要用小寫英數與連字號，且以字母開頭`)
  if (ids.has(s.id)) throw new Error(`場景 id「${s.id}」重複`)
  ids.add(s.id)
}

// 旁白規則：只有專有名詞保留英文，其餘英文詞要在 say 改成中文說法（字幕 text 可以保留英文原詞）
const proper = board.meta?.properNouns ?? []
for (const s of board.scenes) {
  for (const [j, line] of (s.lines ?? []).entries()) {
    let rest = line.say ?? line.text
    for (const p of proper) rest = rest.replaceAll(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    const english = (rest.match(/[A-Za-z][A-Za-z0-9_.\-/]*/g) ?? []).map((w) => w.replace(/[.\-/]+$/, ''))
    if (english.length) warn(`場景 ${s.id} 第 ${j + 1} 句會唸出英文詞「${english.join('、')}」：不是專有名詞就在 say 改成中文說法，是專有名詞就加進 meta.properNouns`)
  }
}

step(`配音（${voice}），主題 ${themeName}`)
const spoken = new Map()
let fresh = 0
for (const s of board.scenes) {
  for (const [j, line] of (s.lines ?? []).entries()) {
    const r = await synth(line.say ?? line.text, { voice, rate: board.meta?.rate, cacheDir: path.join(ROOT, '.cache', 'tts') })
    if (r.estimated) warn(`場景 ${s.id} 第 ${j + 1} 句配音失敗（${r.error}），改用估算時間，這一句沒有聲音`)
    if (!r.cached && !r.estimated) fresh++
    spoken.set(`${s.id}:${j}`, r)
  }
}
console.log(`  ${spoken.size} 句，其中 ${fresh} 句新合成，其餘來自快取`)

step('時間軸與合成')
const tl = buildTimeline(board, spoken)
fs.rmSync(buildDir, { recursive: true, force: true })
fs.mkdirSync(buildDir, { recursive: true })
const { animations } = compose(board, tl, { theme, buildDir, baseDir, warn })
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(tl, null, 2))
console.log(`  總長 ${tl.total} 秒，${tl.scenes.length} 個場景，${animations} 個動畫`)
for (const s of tl.scenes) console.log(`  ${String(s.start.toFixed(1)).padStart(6)}s  ${s.id.padEnd(12)} ${s.type.padEnd(10)} ${s.transition}`)

step('檢查')
const lint = hf(['lint', '--json'], buildDir)
try {
  const j = JSON.parse(lint.out.slice(lint.out.indexOf('{')))
  const errors = (j.findings ?? j.results ?? []).filter((f) => (f.severity ?? f.level) === 'error')
  console.log(`  lint：${errors.length} 個錯誤`)
  if (errors.length) process.exitCode = 1
  for (const e of errors) warn(`lint：${e.code ?? e.rule}：${e.message}`)
} catch {
  console.log(lint.out.split('\n').filter((l) => /✗|error\(s\)/.test(l)).join('\n') || '  lint 完成')
}

flushWarnings()

step('靜態預覽圖')
fs.rmSync(stillsDir, { recursive: true, force: true })
// 每個場景取「最後一句剛講完」的那一刻：所有元素都已出現，下一個轉場還沒開始
const times = tl.scenes.map((s) => (s.lines.length ? s.lines.at(-1).end + 0.15 : s.end - 0.3).toFixed(2))
const snap = hf(['snapshot', '--at', times.join(','), '--no-end', '-o', stillsDir], buildDir)
if (!snap.ok) fail(snap.out)
fs.rmSync(path.join(stillsDir, 'contact-sheet.jpg'), { force: true }) // HyperFrames 自己產的總表，改用下面依場景命名的版本
const pngs = fs.readdirSync(stillsDir).filter((f) => f.endsWith('.png')).sort((a, b) => parseFloat(a.replace(/[^0-9.]/g, '')) - parseFloat(b.replace(/[^0-9.]/g, '')))
tl.scenes.forEach((s, i) => { if (pngs[i]) fs.renameSync(path.join(stillsDir, pngs[i]), path.join(stillsDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`)) })
const cols = Math.min(3, tl.scenes.length)
// 逐一列出輸入檔，不用 glob：Windows 的 ffmpeg 不支援 -pattern_type glob
const shots = tl.scenes.map((s, i) => path.join(stillsDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`)).filter((f) => fs.existsSync(f))
if (shots.length !== tl.scenes.length) fail(`預覽圖只產出 ${shots.length} 張，應該有 ${tl.scenes.length} 張`)
const sheet = ffmpeg([
  ...shots.flatMap((f) => ['-i', f]),
  '-filter_complex', `${shots.map((_, i) => `[${i}:v]`).join('')}concat=n=${shots.length}:v=1:a=0,scale=960:-1,tile=${cols}x${Math.ceil(shots.length / cols)}:padding=6:color=0x1a1a1a`,
  '-frames:v', '1', path.join(stillsDir, 'sheet.jpg'),
])
if (!sheet.ok) fail(`預覽總表產生失敗：${sheet.out}`)
console.log(`  ${rel(path.join(stillsDir, 'sheet.jpg'))}`)

if (!stillsOnly) {
  step('渲染')
  const mp4 = path.join(outDir, `${outName}.mp4`)
  const t0 = Date.now()
  const r = hf(['render', '-o', mp4, '--fps', String(board.meta?.fps ?? 30), '--quiet'], buildDir)
  if (!r.ok || !fs.existsSync(mp4)) fail(r.out)
  console.log(`  ${rel(mp4)}（${((Date.now() - t0) / 1000).toFixed(1)} 秒渲染完）`)
}

flushWarnings()
