// Build: storyboard -> narration -> timeline -> HyperFrames project -> stills -> mp4 -> output check.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { synth } from './tts.mjs'
import { TEXT_WIDGETS } from '../widgets/index.mjs'
import { buildTimeline, LEAD } from './timeline.mjs'
import { compose } from './compose.mjs'
import { hf, ffmpeg } from './render.mjs'
import { ROOT } from './util.mjs'
import { scanBoard, mask } from './secrets.mjs'
import { gate, materialFile, basisProblems, shotFiles } from './material.mjs'

// The video is driven by the need and the architecture diagram; raw excerpts are only evidence.
// Short boards (component demos, clips) are exempt.
// What to do about lines that got no voice. None voiced: the service is unreachable and nothing in the storyboard can fix it,
// so the run goes on as a subtitle-only video. Some voiced: stop before rendering, because a half-silent video is not a result
// and the voiced lines are cached, so running again only fills the gaps.
export function voiceProblem(total, silent) {
  if (!silent.length) return null
  if (silent.length === total) return { fatal: false, message: `配音服務連不上（${silent[0].error}）：${silent.length} 句全部沒有聲音，成品會是純字幕版` }
  return { fatal: true, message: `有 ${silent.length} 句配音失敗（${silent[0].error}），已停止，沒有渲染。配好的句子留在快取；過幾分鐘再執行同一個指令，只會補配缺的句子。失敗的句子：${silent.map((x) => x.where).join('、')}` }
}

export function balanceWarnings(board) {
  const evidence = board.scenes.filter((s) => ['file', 'terminal', 'tree'].includes(s.type)).length
  if (board.scenes.length < 6 || evidence * 3 <= board.scenes.length) return []
  return [`佐證類場景（file、terminal、tree）有 ${evidence} 個，超過 ${board.scenes.length} 個場景的三分之一：影片會變成程式碼導讀，請改用架構圖、流程或對比來講，只留必要的範例`]
}

// "6:00", "90" or 90 -> seconds; anything else -> NaN.
export function parseLength(v) {
  if (typeof v === 'number') return v
  const m = String(v ?? '').trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/)
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN
}
const clock = (sec) => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

// Every rule that makes a part clearer also makes it longer, so the length agreed at the first checkpoint is checked
// here: a total more than 10% over it, or a chapter more than 20% over its own share, is a warning.
// Returns the per-chapter durations too, for the build log.
export function lengthReport(board, tl) {
  const warnings = []
  const chapters = board.chapters ?? []
  const spent = new Map(chapters.map((c) => [c.id, 0]))
  for (const s of tl.scenes) if (s.chapter) spent.set(s.chapter, (spent.get(s.chapter) ?? 0) + (s.end - s.start))
  const rows = chapters.map((c) => ({ id: c.id, seconds: spent.get(c.id) ?? 0, target: c.length == null ? null : parseLength(c.length) }))
  const target = board.meta?.length == null ? null : parseLength(board.meta.length)
  if (Number.isNaN(target)) warnings.push(`meta.length 要寫成「6:00」或秒數，現在是「${board.meta.length}」`)
  else if (target == null) {
    if (typeof board.meta?.material === 'string') warnings.push('分鏡沒有寫 meta.length：照編排在審核點一定的目標長度寫上（例如 "6:00"），build 才會檢查有沒有超過')
  } else if (tl.total > target * 1.1) {
    const over = rows.filter((r) => r.target != null && r.seconds > r.target).map((r) => `${r.id} 多 ${Math.round(r.seconds - r.target)} 秒`)
    warnings.push(`總長 ${clock(tl.total)}，超過目標 ${clock(target)} 的一成${over.length ? `（${over.join('、')}）` : ''}：拿掉場景或少講深一條弧，不要只靠加快語速`)
  }
  for (const r of rows) {
    if (Number.isNaN(r.target)) warnings.push(`章節「${r.id}」的 length 要寫成「1:30」或秒數`)
    else if (r.target == null && target != null) warnings.push(`章節「${r.id}」沒有寫 length：照編排的分段表寫上這一章分到的時間`)
    else if (r.target != null && r.seconds > r.target * 1.2) warnings.push(`章節「${r.id}」${clock(r.seconds)}，超過它分到的 ${clock(r.target)}`)
  }
  return { warnings, rows: rows.map((r) => ({ ...r, text: `${r.id} ${clock(r.seconds)}${r.target != null && !Number.isNaN(r.target) ? `／${clock(r.target)}` : ''}` })) }
}

// English words a line would speak, once the proper nouns are taken out. Longer names go first, so "GitHub Actions"
// is removed whole before "GitHub" can leave "Actions" behind.
export function englishWords(text, proper = []) {
  let rest = text
  for (const p of [...proper].sort((a, b) => b.length - a.length)) rest = rest.replaceAll(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  return (rest.match(/[A-Za-z][A-Za-z0-9_.\-/]*/g) ?? []).map((w) => w.replace(/[.\-/]+$/, ''))
}

// A name the audience may not know is introduced the first time it is spoken and replaced by a plain word after
// that; repeating it every sentence loses the viewer just as much as never explaining it. Only `say` counts: the
// subtitle may keep the name. `meta.terms`: { "Supabase": { intro, plain, again?: [scene ids] } | { known: true } }.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function termWarnings(board) {
  const terms = board.meta?.terms ?? {}
  const names = [...new Set([...(board.meta?.properNouns ?? []), ...Object.keys(terms)])].sort((a, b) => b.length - a.length)
  const pattern = (n) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(n)}(?![A-Za-z0-9])`, 'gi')
  const lines = board.scenes.flatMap((s) => (s.lines ?? []).map((l, j) => ({ scene: s.id, j, said: l.say ?? l.text ?? '' })))
  for (const l of lines) {
    // Longest first, and each match is taken out, so "GitHub Actions" does not also count as "GitHub".
    let rest = l.said
    l.names = new Map()
    for (const n of names) {
      const count = rest.match(pattern(n))?.length ?? 0
      if (count) { l.names.set(n, count); rest = rest.replace(pattern(n), ' ') }
    }
  }
  const out = []
  for (const n of names) {
    const hits = lines.filter((l) => l.names.has(n))
    if (!hits.length) continue
    const t = terms[n]
    if (!t) { out.push(`旁白唸到「${n}」，meta.terms 卻沒有它：寫上第一次出現時的介紹（intro）與之後的代稱（plain）；大家都認得的名字寫 { "known": true }`); continue }
    if (t.known) continue
    if (!t.intro || !t.plain) { out.push(`meta.terms 的「${n}」要有 intro 與 plain，或寫 "known": true`); continue }
    const first = hits[0]
    const next = lines[lines.indexOf(first) + 1]
    const near = first.said + (next?.scene === first.scene ? next.said : '')
    if (!near.includes(t.intro)) out.push(`「${n}」第一次唸到是在場景 ${first.scene} 第 ${first.j + 1} 句，這一句和下一句都沒有它的介紹「${t.intro}」：第一次出現就要用白話說它是什麼`)
    const again = new Set(t.again ?? [])
    // Every occurrence after the first counts, including a second one inside the introducing line.
    const extra = hits.flatMap((l, k) => Array(l.names.get(n) - (k === 0 ? 1 : 0)).fill(l)).filter((l) => !again.has(l.scene))
    if (extra.length) out.push(`「${n}」介紹過之後又唸了 ${extra.length} 次（${[...new Set(extra.map((l) => l.scene))].join('、')}）：改說代稱「${t.plain}」；要和別的東西對比、或換一章重新提起時，才把那個場景列進 again`)
  }
  const plains = new Map()
  for (const [n, t] of Object.entries(terms)) {
    if (!t.plain) continue
    if (plains.has(t.plain)) out.push(`「${plains.get(t.plain)}」和「${n}」的代稱都是「${t.plain}」：觀眾分不出指的是哪一個`)
    else plains.set(t.plain, n)
  }
  return out
}

export const shotScenes = (board) => board.scenes.filter((s) => s.type === 'shot').map((s) => s.id)

// Scenes that only arrange words and numbers. A video made mostly of them is a slide deck read aloud.
const TEXT_SCENES = ['statement', 'compare', 'list', 'stat']
const MAX_TEXT_SHARE = 0.4
const NUMBER_WIDGETS = ['figure', 'units', 'slots', 'meter']
const isText = (s) => TEXT_SCENES.includes(s.type) || (s.type === 'layout' && (s.data?.parts ?? []).length > 0 && s.data.parts.every((p) => TEXT_WIDGETS.includes(p.widget)))

export function pictureWarnings(board) {
  const out = []
  const scenes = board.scenes
  const text = scenes.filter(isText)
  if (scenes.length >= 8 && text.length > scenes.length * MAX_TEXT_SHARE) {
    out.push(`純文字的場景（大字、對照卡、清單、數字，以及只放文字零件的 layout）有 ${text.length} 個，超過 ${scenes.length} 個場景的四成：畫面會像在唸投影片。請把其中講數量、時間、進度、狀態、流程的場景改用 layout 的圖形零件、flow、cycle 或架構圖來畫`)
  }
  let run = []
  const flush = () => {
    if (run.length > 2) out.push(`連續 ${run.length} 個純文字的場景（${run.map((s) => s.id).join('、')}）：中間至少換一個有圖形的場景`)
    run = []
  }
  for (const s of scenes) {
    if (isText(s)) run.push(s)
    else flush()
  }
  flush()
  return out
}

// Words that mark a sentence as giving a reason or a consequence. A script that only reports what exists has almost none.
const REASON = /因為|所以|為了|否則|不然|這樣一來|代價是|才不會|才能|免得|以免|於是|因此|換來|好處是|壞處是|要是|導致|造成|使得|結果是|結果就|就會|由於|既然/
const MIN_REASON_SHARE = 0.15

// A video that only lists flows and settings teaches nothing: check that the narration explains why.
export function reasonWarnings(board) {
  const out = []
  const said = (l) => l.say ?? l.text ?? ''
  const lines = board.scenes.flatMap((s) => s.lines ?? [])
  const reasons = lines.filter((l) => REASON.test(said(l))).length
  if (lines.length >= 20 && reasons < lines.length * MIN_REASON_SHARE) {
    out.push(`旁白 ${lines.length} 句裡只有 ${reasons} 句帶有講原因或影響的連接詞（因為、為了、不然、這樣一來、就會…）：影片會變成流程與設定的報告。請照 script-rules.md 的「主題怎麼講」，補上為什麼這樣選、不這樣會怎樣`)
  }
  for (const s of board.scenes) {
    // A layout that shows quantities is held to the same rule as stat.
    const numbers = s.type === 'stat' || (s.type === 'layout' && (s.data?.parts ?? []).some((p) => NUMBER_WIDGETS.includes(p.widget)))
    if (numbers && !(s.lines ?? []).some((l) => REASON.test(said(l)))) {
      out.push(`場景 ${s.id}：旁白裡找不到講原因或影響的連接詞（因為、為了、不然、這樣一來、就會…）。每個上畫面的數字都要說它為什麼是這個值、或它造成什麼結果；講不出來就不要放`)
    }
  }
  return out
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

  // Where the content comes from. A name or path is the material the video is made from; `false` marks a board that
  // explains no real project (the component demo). Anything else is questioned, because the rule has no exception.
  const ref = board.meta?.material
  if (typeof ref === 'string' && ref) {
    const g = await gate(materialFile(ref, baseDir))
    if (!g.ok) throw new Error(`素材還不能用來做影片，已停止：\n${g.stops.map((s) => `  - ${s}`).join('\n')}\n先用 arch-material skill 整理或更新素材，再回來。`)
    step(`素材：${g.file}（審核 ${g.material.review}）`)
    for (const n of g.notes) console.log(`  ${n}`)
    const basis = basisProblems(board, g.entries)
    basis.errors.push(...shotFiles(board, g.material))
    if (basis.errors.length) throw new Error(`分鏡講到素材裡沒有、或不能講的內容：\n${basis.errors.map((s) => `  - ${s}`).join('\n')}`)
    basis.warnings.forEach(warn)
  } else if (ref !== false) {
    // Pixels escape the secret scan, so a screenshot is only trusted through the material (or in a component demo).
    const shots = shotScenes(board)
    if (shots.length) throw new Error(`這些場景放了截圖，分鏡卻沒有寫 meta.material：${shots.join('、')}。截圖要由素材登記、owner 看過才能用；只有元件示範（meta.material 寫 false）可以用相對路徑的圖`)
    warn('分鏡沒有寫 meta.material：正式的影片要寫上素材庫裡的專案名稱，build 才會確認素材審核過、沒有過期，並核對每個場景的 basis。元件示範這類不講真實專案的分鏡寫 false')
  }

  balanceWarnings(board).forEach(warn)
  reasonWarnings(board).forEach(warn)
  pictureWarnings(board).forEach(warn)
  // A component demo names its own parts; everything else explains a real project to people who have not seen it.
  if (ref !== false) termWarnings(board).forEach(warn)

  // Narration rule: only proper nouns stay in English. Other English words need a Chinese reading in `say`; the subtitle `text` may keep the original.
  const proper = [...(board.meta?.properNouns ?? []), ...Object.keys(board.meta?.terms ?? {})]
  for (const s of board.scenes) {
    for (const [j, line] of (s.lines ?? []).entries()) {
      // Long tokens are masked: a credential the scan missed must not be echoed into the log by this warning.
      const english = englishWords(line.say ?? line.text, proper).map((w) => (w.length > 20 ? mask(w) : w))
      if (english.length) warn(`場景 ${s.id} 第 ${j + 1} 句會唸出英文詞「${english.join('、')}」：不是專有名詞就在 say 改成中文說法，是專有名詞就加進 meta.properNouns`)
    }
  }

  step(offline ? `預覽不配音（不連配音服務），主題 ${themeName}` : `配音（${voice}），主題 ${themeName}`)
  const spoken = new Map()
  let fresh = 0
  const silent = []
  for (const s of board.scenes) {
    for (const [j, line] of (s.lines ?? []).entries()) {
      const r = await synth(line.say ?? line.text, { voice, rate: board.meta?.rate, cacheDir: path.join(ROOT, '.cache', 'tts'), offline, onWait: (sec) => console.log(`  配音服務要求放慢，等 ${sec} 秒再試`) })
      if (r.estimated && !r.offline) silent.push({ where: `${s.id} 第 ${j + 1} 句`, error: r.error })
      if (!r.cached && !r.estimated) fresh++
      spoken.set(`${s.id}:${j}`, r)
    }
  }
  const estimated = [...spoken.values()].filter((r) => r.offline).length
  if (offline) console.log(`  ${spoken.size} 句：${estimated} 句用字數估算時間、${spoken.size - estimated} 句用之前配過音的快取。長度是估計值，渲染時才會配音`)
  else console.log(`  ${spoken.size} 句：${fresh} 句新合成、${spoken.size - fresh - silent.length} 句來自快取、${silent.length} 句失敗`)
  const problem = voiceProblem(spoken.size, silent)
  if (problem?.fatal) fail(problem.message)
  if (problem) warn(problem.message)

  step('時間軸與合成')
  const tl = buildTimeline(board, spoken)
  fs.rmSync(buildDir, { recursive: true, force: true })
  fs.mkdirSync(buildDir, { recursive: true })
  const { animations } = compose(board, tl, { theme, buildDir, baseDir, warn })
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(tl, null, 2))
  console.log(`  總長 ${tl.total} 秒，${tl.scenes.length} 個場景，${animations} 個動畫`)
  for (const s of tl.scenes) console.log(`  ${String(s.start.toFixed(1)).padStart(6)}s  ${s.id.padEnd(12)} ${s.type.padEnd(10)} ${s.transition}`)
  const length = lengthReport(board, tl)
  if (length.rows.length) console.log(`  各章（實際／目標）：${length.rows.map((r) => r.text).join('、')}`)
  length.warnings.forEach(warn)

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
  // HyperFrames writes its own sheet (numbered when there are many frames); ours below is named by scene.
  for (const f of fs.readdirSync(stillsDir)) if (/^contact-sheet.*\.jpg$/.test(f)) fs.rmSync(path.join(stillsDir, f), { force: true })
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
