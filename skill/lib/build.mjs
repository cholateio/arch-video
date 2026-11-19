// Build: storyboard -> narration -> timeline -> HyperFrames project -> stills -> mp4 -> output check.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { synth } from './tts.mjs'
import { buildTimeline, LEAD } from './timeline.mjs'
import { compose } from './compose.mjs'
import { hf, ffmpeg } from './render.mjs'
import { ROOT } from './util.mjs'
import { scanBoard, mask } from './secrets.mjs'

// The video is driven by the need and the architecture diagram; raw excerpts are only evidence.
// Short boards (component demos, clips) are exempt.
export function balanceWarnings(board) {
  const evidence = board.scenes.filter((s) => ['file', 'terminal', 'tree'].includes(s.type)).length
  if (board.scenes.length < 6 || evidence * 3 <= board.scenes.length) return []
  return [`佐證類場景（file、terminal、tree）有 ${evidence} 個，超過 ${board.scenes.length} 個場景的三分之一：影片會變成程式碼導讀，請改用架構圖、流程或對比來講，只留必要的範例`]
}

export async function build(file, flags) {
  const stillsOnly = flags.includes('--stills-only')
  // A preview never contacts the speech service unless asked to: a script is reviewed before its narration is sent anywhere.
  // Only a full build, or a preview with --voice, synthesises speech.
  if (flags.includes('--voice') && !stillsOnly) throw new Error('--voice 只用在 --stills-only：完整產片本來就會配音')
  const offline = stillsOnly && !flags.includes('--voice')
  const warnings = []
  const warn = (m) => warnings.push(m)
  // Print accumulated warnings: once before rendering so they are not delayed by minutes, and again at the end for later ones.
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
  // First thing after parsing: later validation echoes storyboard fields, and the narration is sent to the speech service.
  const sensitive = scanBoard(board, baseDir)
  if (sensitive.length) {
    throw new Error(`分鏡裡有疑似機密或個資的內容，已停止（還沒送出配音）：\n${sensitive.map((h) => `  - ${h.where}：${h.label}（${h.excerpt}）`).join('\n')}\n請從分鏡拿掉或改成遮蔽後的樣子（例如 ••••）。使用者同意公開的字串才加進 meta.allow。`)
  }
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

  const ids = new Set()
  for (const s of board.scenes) {
    if (!/^[a-z][a-z0-9-]*$/.test(s.id ?? '')) throw new Error(`場景 id「${s.id}」要用小寫英數與連字號，且以字母開頭`)
    if (ids.has(s.id)) throw new Error(`場景 id「${s.id}」重複`)
    ids.add(s.id)
    // Checked here, not only when the timeline is built: a typo should fail before any narration is synthesised.
    if (!((s.transition ?? 'cut') in LEAD)) throw new Error(`場景 ${s.id}：不認得的轉場「${s.transition}」`)
  }

  balanceWarnings(board).forEach(warn)

  // Narration rule: only proper nouns stay in English. Other English words need a Chinese reading in `say`; the subtitle `text` may keep the original.
  const proper = board.meta?.properNouns ?? []
  for (const s of board.scenes) {
    for (const [j, line] of (s.lines ?? []).entries()) {
      let rest = line.say ?? line.text
      for (const p of proper) rest = rest.replaceAll(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
      // Long tokens are masked: a credential the scan missed must not be echoed into the log by this warning.
      const english = (rest.match(/[A-Za-z][A-Za-z0-9_.\-/]*/g) ?? []).map((w) => w.replace(/[.\-/]+$/, '')).map((w) => (w.length > 20 ? mask(w) : w))
      if (english.length) warn(`場景 ${s.id} 第 ${j + 1} 句會唸出英文詞「${english.join('、')}」：不是專有名詞就在 say 改成中文說法，是專有名詞就加進 meta.properNouns`)
    }
  }

  step(offline ? `預覽不配音（不連配音服務），主題 ${themeName}` : `配音（${voice}），主題 ${themeName}`)
  const spoken = new Map()
  let fresh = 0
  const silent = []
  for (const s of board.scenes) {
    for (const [j, line] of (s.lines ?? []).entries()) {
      const r = await synth(line.say ?? line.text, { voice, rate: board.meta?.rate, cacheDir: path.join(ROOT, '.cache', 'tts'), offline })
      if (r.estimated && !r.offline) silent.push({ where: `${s.id} 第 ${j + 1} 句`, error: r.error })
      if (!r.cached && !r.estimated) fresh++
      spoken.set(`${s.id}:${j}`, r)
    }
  }
  const estimated = [...spoken.values()].filter((r) => r.offline).length
  if (offline) console.log(`  ${spoken.size} 句：${estimated} 句用字數估算時間、${spoken.size - estimated} 句用之前配過音的快取。長度是估計值，渲染時才會配音`)
  else console.log(`  ${spoken.size} 句：${fresh} 句新合成、${spoken.size - fresh - silent.length} 句來自快取、${silent.length} 句失敗`)
  // One warning for the whole run rather than one per line: nothing in the storyboard can fix a connection problem.
  if (silent.length === spoken.size && silent.length) warn(`配音服務連不上（${silent[0].error}）：${silent.length} 句全部沒有聲音，成品會是純字幕版`)
  else if (silent.length) warn(`有 ${silent.length} 句配音失敗、沒有聲音，時間改用估算：${silent.map((x) => x.where).join('、')}（${silent[0].error}）`)

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
  // Capture each scene just after its last line: every element is on screen and the next transition has not started.
  const times = tl.scenes.map((s) => (s.lines.length ? s.lines.at(-1).end + 0.15 : s.end - 0.3).toFixed(2))
  const snap = hf(['snapshot', '--at', times.join(','), '--no-end', '-o', stillsDir], buildDir)
  if (!snap.ok) fail(snap.out)
  fs.rmSync(path.join(stillsDir, 'contact-sheet.jpg'), { force: true }) // HyperFrames writes its own sheet; ours below is named by scene
  const pngs = fs.readdirSync(stillsDir).filter((f) => f.endsWith('.png')).sort((a, b) => parseFloat(a.replace(/[^0-9.]/g, '')) - parseFloat(b.replace(/[^0-9.]/g, '')))
  tl.scenes.forEach((s, i) => { if (pngs[i]) fs.renameSync(path.join(stillsDir, pngs[i]), path.join(stillsDir, `${String(i + 1).padStart(2, '0')}-${s.id}.png`)) })
  const cols = Math.min(3, tl.scenes.length)
  // List the inputs explicitly: ffmpeg on Windows has no -pattern_type glob.
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

    step('成品檢查')
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', mp4], { encoding: 'utf8' })
    if (probe.status !== 0) fail(`讀不到成品的資訊：${probe.stderr}`)
    const info = JSON.parse(probe.stdout)
    const kinds = (info.streams ?? []).map((x) => x.codec_type)
    const seconds = Number(info.format?.duration)
    if (!kinds.includes('video')) fail('成品沒有畫面')
    if (Math.abs(seconds - tl.total) > 0.5) fail(`成品長度 ${seconds.toFixed(1)} 秒，和時間軸的 ${tl.total} 秒不符`)
    const voiced = [...spoken.values()].filter((r) => r.file).length
    if (voiced && !kinds.includes('audio')) fail('成品沒有聲音，但有配音成功的句子')
    console.log(`  長度 ${seconds.toFixed(1)} 秒；畫面有；聲音${kinds.includes('audio') ? `有（${voiced}/${spoken.size} 句有配音）` : '沒有'}`)
  }

  flushWarnings()
}
