// Parser for a material file and for the background files it points at.
// A material file is Markdown with a few fixed shapes (see references/material-format.md). Parsing never touches a repo:
// it only reports what the text says and which lines break the format.

export const SECTIONS = ['總覽', '現況事實', '因果弧', '架構拆解', '排除']
export const OVERVIEW = ['主旨', '整理時的版本', '故事線', '一手文件地圖']
export const BLOCKS = ['主張', '需要的背景', '物證', '缺口', '口述', '後續發展']
// Each arc must say what was wanted, what was chosen and why. The reason may be unknown, but it has to be there.
export const REQUIRED_ROLES = ['所求', '選擇', '原因']
const ROLES = ['所求', '選擇', '原因', '沒採用', '影響', '帶得走']
// The takeaway is the organiser's own summary, so it carries no source.
const NO_STATUS_ROLES = ['帶得走']
const STATUS_PREFIXES = ['F', 'A', 'N', 'D', 'M']

const ITEM = /^\s*- \*\*([A-Z]\d+(?:\.\d+)?)\*\*\s*(.*)$/
const MARK = /〔(有出處|推得|口述|不明|查不到)(?:\s+(\d{4}-\d{2}-\d{2}))?〕/g
const TICK = /`([^`]+)`/g
const COORD = /^([a-z][a-z0-9-]*)(?:@([0-9a-f]{7,40})|:([^#]+?)(?:#(.+)|:(\d+)(?:-(\d+))?)?)$/
const SLUG = /^[a-z0-9][a-z0-9-]*$/
const POINTER = /→\s*([A-Z]\d+(?:\.\d+)?)/g

// `ingest:scripts/fetch.ts#SOURCES`, `ingest:docs/x.md:12-20`, `ingest@0fd8535`, `bg:github-actions-schedule#B1`
export function parseCoord(raw) {
  const m = COORD.exec(raw.trim())
  if (!m) return null
  const [, repo, commit, p, anchor, from, to] = m
  // A background name becomes a file name inside the library, so it must be a plain slug.
  if (repo === 'bg') return commit || from || !SLUG.test(p ?? '') ? null : { raw, bg: p, entry: anchor ?? null }
  if (commit) return { raw, repo, commit }
  const clean = p.replace(/\/+$/, '')
  if (!clean || clean.startsWith('/') || clean.split('/').includes('..')) return null
  const a = from ? Number(from) : null
  const b = to ? Number(to) : a
  if (a != null && (a < 1 || b < a)) return null
  return { raw, repo, path: clean, anchor: anchor ?? null, from: a, to: b }
}

const ticks = (s) => [...s.matchAll(TICK)].map((m) => m[1])
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const isRule = (line) => /^\s*\|?\s*:?-{3,}/.test(line)

// One item line: id, the sentence, its status and the coordinates written after the status.
function parseItem(line, n, problems) {
  const m = ITEM.exec(line)
  if (!m) return null
  const [, id, rest] = m
  const marks = [...rest.matchAll(MARK)]
  const item = { id, line: n, text: rest.trim(), status: null, date: null, coords: [], role: null, derive: false }
  const role = ROLES.find((r) => rest.startsWith(`${r}：`))
  if (role) item.role = role
  if (marks.length > 1) problems.push({ level: 'error', line: n, msg: `${id} 有不只一個狀態標記；一條主張只講一件事，拆成兩條` })
  const mark = marks[0]
  if (mark) {
    item.status = mark[1]
    item.date = mark[2] ?? null
    item.text = rest.slice(0, mark.index).trim()
    const tail = rest.slice(mark.index + mark[0].length)
    for (const raw of ticks(tail)) {
      const c = parseCoord(raw)
      if (c) item.coords.push(c)
      else problems.push({ level: 'error', line: n, msg: `${id} 的座標「${raw}」格式不對；寫成 代號:路徑#小節或名稱、代號:路徑:行號、代號@commit 或 bg:主題#編號` })
    }
    item.urls = [...tail.matchAll(/https?:\/\/[^\s<>）)]+/g)].map((u) => u[0])
  }
  return item
}

export function parseMaterial(text) {
  const problems = []
  const out = {
    title: null, sections: [], overview: [], purpose: [], repos: [], stamps: [], storylines: [], items: [], arcs: [],
    uses: [], pointers: [], scope: null, format: null, date: null, review: null, problems,
  }
  let h2 = null
  let h3 = null
  let arc = null
  let block = null
  let table = null
  let last = null
  const lines = text.split(/\r?\n/)
  const use = (coord, where, n) => out.uses.push({ coord, where, line: n })

  lines.forEach((line, i) => {
    const n = i + 1
    if (/^# /.test(line)) { out.title ??= line.slice(2).trim(); return }
    if (/^## /.test(line)) { h2 = line.slice(3).trim(); h3 = null; arc = null; block = null; table = null; last = null; out.sections.push(h2); return }
    if (/^### /.test(line)) {
      h3 = line.slice(4).trim(); block = null; table = null; last = null; arc = null
      if (h2 === '總覽') out.overview.push(h3)
      if (h2 === '因果弧') {
        const m = /^(A\d+)\s+(.+)$/.exec(h3)
        if (!m) { problems.push({ level: 'error', line: n, msg: `因果弧的小節標題要寫成「### A1 <一句因果問題>」，這一行是「${h3}」` }); return }
        arc = { id: m[1], question: m[2].trim(), line: n, storylines: [], start: null, end: null, blocks: [], roles: [], evidence: 0 }
        out.arcs.push(arc)
      }
      return
    }
    if (/^#### /.test(line)) {
      block = line.slice(5).trim(); last = null
      if (arc) {
        if (BLOCKS.includes(block)) arc.blocks.push(block)
        else problems.push({ level: 'error', line: n, msg: `${arc.id} 有不認得的小節「${block}」；可以用的是：${BLOCKS.join('、')}` })
      }
      return
    }
    if (!line.trim()) { table = null; return }

    for (const m of line.matchAll(POINTER)) out.pointers.push({ id: m[1], line: n })

    if (h2 === '總覽' && h3 === '主旨') out.purpose.push(line.trim())
    if (h2 === '總覽') {
      const meta = /^(範圍|格式版本|整理日期|審核)：\s*(.*)$/.exec(line.trim())
      if (meta?.[1] === '範圍') out.scope = meta[2]
      if (meta?.[1] === '格式版本') out.format = meta[2]
      if (meta?.[1] === '整理日期') out.date = meta[2]
      if (meta?.[1] === '審核') out.review = meta[2]
    }

    if (line.trim().startsWith('|')) {
      const row = cells(line)
      if (isRule(line)) return
      if (!table) { table = { head: row }; return }
      if (h2 === '總覽' && h3 === '整理時的版本') {
        if (table.head[0] === '代號') {
          if (row.length < 4) problems.push({ level: 'error', line: n, msg: '版本表的每一列要有四格：代號、位置、commit、日期' })
          else out.repos.push({ code: row[0], location: row[1].replace(/`/g, ''), commit: row[2].replace(/`/g, ''), date: row[3], line: n })
        } else if (table.head[0].startsWith('不在')) {
          const c = parseCoord(ticks(row[0])[0] ?? '')
          if (!c?.path || row.length < 2) problems.push({ level: 'error', line: n, msg: '「不在 commit 裡的來源」每一列要有座標（放在反引號裡）和指紋；這張表用 stamp 產生' })
          else out.stamps.push({ coord: c, print: row[1].replace(/`/g, ''), line: n })
        }
        return
      }
      // In other tables only strings that parse as a coordinate count; a quoted identifier is left alone.
      const where = h3 === '一手文件地圖' ? '一手文件地圖' : h2
      for (const raw of row.flatMap(ticks)) {
        const c = parseCoord(raw)
        if (c) use(c, where, n)
      }
      return
    }
    table = null

    const item = parseItem(line, n, problems)
    if (item) {
      item.section = h2
      item.arc = arc?.id ?? null
      last = item
      if (item.id.startsWith('S') && h2 === '總覽') { out.storylines.push(item); return }
      out.items.push(item)
      if (arc && item.role) arc.roles.push(item.role)
      for (const c of item.coords) use(c, item.id, n)
      return
    }

    const bullet = /^\s*- (.*)$/.exec(line)
    if (bullet && last && /^\s{2,}- 推法：\s*\S/.test(line)) { last.derive = true; return }
    if (arc && bullet) {
      const body = bullet[1]
      if (!block) {
        const field = /^(故事線|起點|終點)：\s*(.*)$/.exec(body)
        if (field?.[1] === '故事線') arc.storylines = field[2].match(/S\d+/g) ?? []
        if (field?.[1] === '起點') arc.start = field[2]
        if (field?.[1] === '終點') arc.end = field[2]
        return
      }
      if (block === '物證' || block === '需要的背景') {
        const raw = /^`([^`]+)`/.exec(body)?.[1]
        const c = raw ? parseCoord(raw) : null
        if (!c) { problems.push({ level: 'error', line: n, msg: `${arc.id} 的「${block}」每一項要以座標開頭（放在反引號裡），後面才是說明` }); return }
        if (block === '需要的背景' && !c.bg) { problems.push({ level: 'error', line: n, msg: `${arc.id} 的「需要的背景」要指到背景知識（bg:主題#編號），這一項是「${raw}」` }); return }
        if (block === '物證') arc.evidence++
        use(c, `${arc.id} 的${block}`, n)
      }
    }
  })
  return out
}

// A background file: one topic, shared by every project. Entries are B1, B2… with a status, a check date and a source link.
export function parseBackground(text) {
  const problems = []
  const out = { title: null, projects: [], entries: [], problems }
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1
    if (/^# /.test(line)) { out.title ??= line.slice(2).trim(); return }
    const used = /^用過的專案：\s*(.*)$/.exec(line.trim())
    if (used) { out.projects = used[1].split(/[、,，]/).map((s) => s.trim()).filter(Boolean); return }
    const item = parseItem(line, n, problems)
    if (item) out.entries.push(item)
  })
  return out
}

// A date that only looks like one (2026-99-99) would never expire and would count as a review.
export const validDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return false
  const t = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s
}

export const needsStatus = (item) => STATUS_PREFIXES.includes(item.id[0]) && !NO_STATUS_ROLES.includes(item.role)
