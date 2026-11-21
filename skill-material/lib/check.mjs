// Format and coordinate check for one material file. It answers two questions a reader cannot answer by eye:
// does every claim follow the format, and does every coordinate still point at something in the recorded version.
import fs from 'node:fs'
import path from 'node:path'
import { parseMaterial, parseBackground, SECTIONS, OVERVIEW, REQUIRED_ROLES, needsStatus, validDate } from './material.mjs'
import { openRepo, lookup, localPrint, hasCommit } from './repo.mjs'
import { expectedPrints } from './local.mjs'
import { scanText } from './secrets.mjs'

export const FORMAT = '1'
// A background entry older than this is checked against its source again before it is used.
export const BACKGROUND_TTL_DAYS = 180
const MAX_PURPOSE = 400
const ENDS = ['結果', '推翻', '未決']

const daysBetween = (from, to) => Math.floor((to - new Date(`${from}T00:00:00Z`)) / 86400000)

// Everything check and status both need: the parsed file, the opened repos and each coordinate resolved against them.
export function load(file, { repos: override = {} } = {}) {
  const text = fs.readFileSync(file, 'utf8')
  const material = parseMaterial(text)
  const repos = Object.fromEntries(material.repos.map((row) => [row.code, openRepo(row, override)]))
  return { file, text, material, repos, library: path.dirname(path.resolve(file)), project: path.basename(file, '.md') }
}

export async function check(file, options = {}) {
  const today = options.today ?? new Date()
  const { text, material: m, repos, library, project } = load(file, options)
  const errors = []
  const warnings = []
  const notes = []
  const questions = []
  const at = (line) => (line ? `第 ${line} 行：` : '')
  const error = (msg, line) => errors.push(at(line) + msg)
  const warn = (msg, line) => warnings.push(at(line) + msg)
  for (const p of m.problems) (p.level === 'error' ? error : warn)(p.msg, p.line)

  // Structure
  if (!m.title) error('第一行要是標題：# 素材：<專案名稱>')
  if (m.format !== FORMAT) error(`「總覽」要有一行「格式版本：${FORMAT}」${m.format ? `，現在是「${m.format}」` : ''}`)
  for (const s of SECTIONS) if (!m.sections.includes(s)) error(`少了「## ${s}」這一節`)
  for (const s of OVERVIEW) if (!m.overview.includes(s)) error(`「總覽」少了「### ${s}」`)
  const purpose = m.purpose.join('')
  if (!purpose) error('主旨是空的；寫不出一到兩段話的主旨，代表還沒讀懂，不要往下做')
  else if (purpose.length > MAX_PURPOSE) warn(`主旨有 ${purpose.length} 個字；一到兩段話說完（${MAX_PURPOSE} 字以內）`)
  if (m.date != null && !validDate(m.date)) error(`「整理日期：」後面要是日期（2026-11-20），現在是「${m.date}」`)
  if (!m.scope) error('「總覽」要有一行「範圍：…」，寫明這份素材涵蓋什麼、不涵蓋什麼')
  if (!m.review) error('「總覽」要有一行「審核：還沒」；owner 在審核點看過之後改成「審核：<日期>」')
  else if (m.review === '還沒') notes.push('這份素材還沒有經過 owner 審核（審核：還沒）；審核過才能拿去做影片')
  else if (!validDate(m.review)) error(`「審核：」後面只能是「還沒」或一個日期（2026-11-20），現在是「${m.review}」`)
  if (!m.storylines.length) error('「故事線」至少要有一條（- **S1** 一句話…）')

  // Repos
  if (!m.repos.length) error('「整理時的版本」的表格是空的；至少列一個來源（代號、位置、commit、日期）')
  const codes = new Set()
  for (const row of m.repos) {
    const repo = repos[row.code]
    if (!/^[a-z][a-z0-9-]*$/.test(row.code) || row.code === 'bg') error(`來源的代號「${row.code}」不能用；用小寫英數與連字號，而且不可以是 bg`, row.line)
    if (codes.has(row.code)) error(`來源的代號「${row.code}」重複了`, row.line)
    codes.add(row.code)
    if (!validDate(row.date)) error(`來源 ${row.code} 的日期「${row.date}」不是日期；跑 stamp 取得`, row.line)
    if (!/^(~|\/)/.test(row.location)) error(`來源 ${row.code} 的位置要寫成 ~/… 開頭`, row.line)
    if (!repo.exists) { error(`找不到來源 ${row.code} 的資料夾（${row.location}）；在別台電腦上可以用 --repo ${row.code}=<路徑> 指定`, row.line); continue }
    if (repo.isGit && !repo.known) error(`來源 ${row.code} 記錄的 commit「${row.commit}」在這個 repo 裡找不到；跑 stamp 取得現在的版本再填`, row.line)
    if (!repo.isGit && row.commit !== '無') error(`來源 ${row.code} 不是 git repo，commit 那一格寫「無」`, row.line)
    if (repo.known && !repo.atHead) notes.push(`來源 ${row.code} 現在的版本（${repo.head}）和素材記錄的（${row.commit}）不同；跑 status 看哪些主張受影響`)
  }

  // Ids, statuses, pointers
  const ids = new Map()
  for (const it of [...m.storylines, ...m.arcs, ...m.items]) {
    if (ids.has(it.id)) error(`編號 ${it.id} 重複了（第一次在第 ${ids.get(it.id)} 行）`, it.line)
    else ids.set(it.id, it.line)
  }
  let linesOnly = 0
  for (const it of m.items) {
    if (!needsStatus(it)) continue
    if (!it.text) error(`${it.id} 沒有內容`, it.line)
    if (!it.status) { error(`${it.id} 沒有狀態標記；在句子後面加上〔有出處〕、〔推得〕、〔口述 日期〕或〔不明〕`, it.line); continue }
    if (it.status === '查不到') error(`${it.id}：〔查不到〕只用在背景知識；專案裡找不到原因的主張標〔不明〕`, it.line)
    if (it.status === '有出處' && !it.coords.length) error(`${it.id} 標了〔有出處〕卻沒有座標；座標寫在狀態標記後面，放在反引號裡`, it.line)
    if (it.status === '推得' && !it.derive) error(`${it.id} 標了〔推得〕，下一行要寫怎麼推的（縮排兩格：- 推法：…）`, it.line)
    if (it.status === '口述' && !validDate(it.date)) error(`${it.id} 的〔口述〕要帶日期，例如〔口述 2026-11-20〕`, it.line)
    if (it.status === '不明') questions.push(`${it.id} ${it.text}`)
    if (it.coords.length && it.coords.every((c) => c.path && c.from != null)) linesOnly++
  }
  // A data flow belongs to a storyline: that is what lets a walkthrough follow one thing at a time.
  const lineIds = new Set(m.storylines.map((x) => x.id))
  for (const it of m.items.filter((x) => x.id[0] === 'D')) {
    const named = it.text.match(/S\d+/g) ?? []
    if (!named.length) error(`${it.id} 沒有標明屬於哪一條故事線；在句子後面加上（S1）`, it.line)
    for (const s of named) if (!lineIds.has(s)) error(`${it.id} 標的故事線 ${s} 不存在`, it.line)
  }
  for (const p of m.pointers) if (!ids.has(p.id)) error(`「→${p.id}」指到的編號不存在`, p.line)

  // Arcs
  if (!m.arcs.length) error('「因果弧」至少要有一條（### A1 <一句因果問題>）')
  const storylines = new Set(m.storylines.map((s) => s.id))
  const told = new Set()
  for (const arc of m.arcs) {
    if (!arc.storylines.length) error(`${arc.id} 沒有寫屬於哪一條故事線（- 故事線：S1）`, arc.line)
    for (const s of arc.storylines) {
      if (!storylines.has(s)) error(`${arc.id} 的故事線 ${s} 不存在`, arc.line)
      told.add(s)
    }
    if (!arc.start) error(`${arc.id} 沒有起點（- 起點：當時的痛點）`, arc.line)
    if (!arc.end) error(`${arc.id} 沒有終點（- 終點：結果／推翻／未決：…）`, arc.line)
    else if (!ENDS.some((e) => arc.end.startsWith(e))) error(`${arc.id} 的終點要以「${ENDS.join('」「')}」其中一個開頭，現在是「${arc.end.slice(0, 12)}」`, arc.line)
    for (const role of REQUIRED_ROLES) if (!arc.roles.includes(role)) error(`${arc.id} 少了「${role}：」開頭的主張`, arc.line)
    if (!arc.evidence) warn(`${arc.id} 沒有物證；找一個可以直接拿給人看的實物（一個常數、一行紀錄、一段設定、一筆數據）`, arc.line)
  }
  for (const s of m.storylines) if (!told.has(s.id)) warn(`故事線 ${s.id} 沒有任何一條弧`, s.line)

  // Coordinates
  const backgrounds = new Map()
  const loose = new Map()
  const unacknowledged = new Set()
  const moved = new Set()
  const stamped = new Map(m.stamps.map((s) => [`${s.coord.repo}:${s.coord.path}`, s]))
  for (const { coord: c, where, line } of m.uses) {
    if (c.bg) {
      if (!backgrounds.has(c.bg)) {
        const f = path.join(library, 'background', `${c.bg}.md`)
        backgrounds.set(c.bg, fs.existsSync(f) ? parseBackground(fs.readFileSync(f, 'utf8')) : null)
      }
      const bg = backgrounds.get(c.bg)
      if (!bg) { error(`${where}：找不到背景知識 background/${c.bg}.md`, line); continue }
      if (!c.entry) { error(`${where}：背景知識要指到條目，例如 bg:${c.bg}#B1`, line); continue }
      if (!bg.entries.some((e) => e.id === c.entry)) error(`${where}：background/${c.bg}.md 裡沒有 ${c.entry}`, line)
      continue
    }
    const repo = repos[c.repo]
    if (!repo) { error(`${where}：座標「${c.raw}」的代號 ${c.repo} 不在版本表裡`, line); continue }
    if (!repo.exists) continue
    if (c.commit) {
      if (!hasCommit(repo, c.commit)) error(`${where}：來源 ${c.repo} 裡找不到 commit ${c.commit}`, line)
      continue
    }
    const hit = lookup(repo, c.path)
    if (hit.kind === 'credential') { error(`${where}：座標「${c.raw}」指向存放憑證的檔案；這類檔案不讀，也不當成出處`, line); continue }
    if (hit.kind === 'link') { error(`${where}：「${c.raw}」是符號連結，不會被讀取；座標改指它連過去的實際檔案`, line); continue }
    if (hit.kind === 'missing') { error(`${where}：「${c.raw}」的檔案在素材記錄的版本裡找不到`, line); continue }
    if (hit.kind === 'dir') {
      if (c.anchor || c.from != null) error(`${where}：「${c.raw}」是資料夾，不能再指定小節或行號`, line)
    } else {
      if (c.anchor && !hit.text.includes(c.anchor)) error(`${where}：「${c.path}」裡找不到「${c.anchor}」；# 後面要是檔案裡實際出現的小節標題、函式或設定的名稱`, line)
      if (c.to && c.to > hit.text.split('\n').length) error(`${where}：「${c.path}」沒有第 ${c.to} 行`, line)
    }
  }
  // Sources the commit does not pin are tied down by a fingerprint of what was on disk when the material was stamped.
  for (const [key, want] of expectedPrints(m, repos)) {
    // A source that is nowhere to be found is already an error on the coordinate that names it.
    if (want.kind === 'missing') continue
    const s = stamped.get(key)
    if (!s) (want.kind === 'edited' ? unacknowledged.add(key) : loose.set(key, want.print))
    else if (s.print !== want.print) moved.add(key)
  }
  for (const s of m.stamps) {
    const repo = repos[s.coord.repo]
    if (repo?.exists && localPrint(repo, s.coord.path) !== s.print) moved.add(`${s.coord.repo}:${s.coord.path}`)
  }
  if (loose.size) {
    warn(`有 ${loose.size} 個來源不在版控裡，素材沒有記它們的指紋，之後無法判斷有沒有變；跑 stamp，把「不在 commit 裡的來源」那張表貼進「整理時的版本」：${[...loose.keys()].join('、')}`)
  }
  if (unacknowledged.size) {
    warn(`這些來源有還沒 commit 的修改：${[...unacknowledged].join('、')}。素材描述的是記錄的那個 commit：確認引用它們的主張沒有把還沒 commit 的內容寫進去，再跑 stamp 記下指紋`)
  }
  if (moved.size) warn(`這些來源的內容已經和記下指紋時不同：${[...moved].join('、')}；跑 status 看哪些主張受影響`)
  if (linesOnly) notes.push(`有 ${linesOnly} 條主張只用行號當座標；能用小節標題、函式或設定的名稱就改用名稱，行號容易跑掉`)

  // Background entries this project relies on
  for (const [slug, bg] of backgrounds) {
    if (!bg) continue
    const where = `background/${slug}.md`
    for (const p of bg.problems) error(`${where} 第 ${p.line} 行：${p.msg}`)
    if (!bg.projects.includes(project)) warn(`${where} 的「用過的專案」沒有列 ${project}`)
    const used = new Set(m.uses.filter((u) => u.coord.bg === slug).map((u) => u.coord.entry))
    for (const e of bg.entries) {
      if (!used.has(e.id)) continue
      if (!['有出處', '查不到'].includes(e.status ?? '')) { error(`${where} 的 ${e.id} 要標〔有出處 日期〕或〔查不到 日期〕`); continue }
      if (!validDate(e.date)) { error(`${where} 的 ${e.id} 沒有查證日期，或日期不是真的日期`); continue }
      if (e.status === '查不到') { questions.push(`${slug}#${e.id}（背景，查不到）${e.text}`); continue }
      if (!e.urls?.length) error(`${where} 的 ${e.id} 標了〔有出處〕卻沒有來源網址`)
      const age = daysBetween(e.date, today)
      if (age > BACKGROUND_TTL_DAYS) warn(`${where} 的 ${e.id} 是 ${age} 天前查的；用之前重新確認來源，並更新日期`)
    }
  }

  // Sensitive content. The material is private, but the video is written from it, so nothing sensitive may rest here.
  text.split(/\r?\n/).forEach((line, i) => {
    for (const f of scanText(line)) error(`疑似機密或個資（${f.label}：${f.excerpt}）；素材只寫類型與位置，不寫值`, i + 1)
  })
  for (const [slug, bg] of backgrounds) {
    if (!bg) continue
    const raw = fs.readFileSync(path.join(library, 'background', `${slug}.md`), 'utf8')
    raw.split(/\r?\n/).forEach((line, i) => {
      for (const f of scanText(line)) error(`background/${slug}.md 第 ${i + 1} 行：疑似機密或個資（${f.label}：${f.excerpt}）`)
    })
  }

  // The library holds the owner's remarks and the location of sensitive things: other accounts should not read it.
  if (process.platform !== 'win32') {
    const mode = fs.statSync(library).mode & 0o077
    if (mode) warn(`素材庫 ${library} 可以被這台電腦上的其他帳號讀取；執行 chmod 700 收緊權限`)
  }

  return {
    errors, warnings, notes, questions,
    reviewed: validDate(m.review),
    counts: { storylines: m.storylines.length, arcs: m.arcs.length, claims: m.items.filter(needsStatus).length, coords: m.uses.length, backgrounds: backgrounds.size },
    arcs: m.arcs.map((a) => ({ id: a.id, question: a.question, storylines: a.storylines, end: a.end })),
  }
}
