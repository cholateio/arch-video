// Freshness of a material file: what changed in its sources since it was organised, and which items point at those changes.
import fs from 'node:fs'
import path from 'node:path'
import { load, BACKGROUND_TTL_DAYS } from './check.mjs'
import { parseBackground, validDate } from './material.mjs'
import { changes, dirty, isAncestor, localPrint, under, GONE } from './repo.mjs'
import { expectedPrints, MAP } from './local.mjs'

// When this share of the referenced files changed, re-checking item by item costs more than organising again.
const REBUILD_SHARE = 0.5
const REBUILD_MIN_FILES = 6

export function status(file, options = {}) {
  const today = options.today ?? new Date()
  const { material: m, repos, library } = load(file, options)
  // `fresh` is about what the material says. `loose` counts uncommitted work the material does not point at:
  // it cannot have changed a recorded claim, but it may be a feature the material has never heard of.
  const out = { fresh: true, rebuild: [], repos: [], stamps: [], unstamped: [], backgrounds: [], missing: [], loose: 0 }
  // Having read a file is not a claim about it, so the document map does not make an item of a changed file.
  const claims = m.uses.filter((u) => u.where !== MAP && u.coord.path)
  const users = (code, match) => [...new Set(claims.filter((u) => u.coord.repo === code && match(u.coord.path)).map((u) => u.where))]
  const near = (code, p) => users(code, (q) => under(q)(p) || under(p)(q))
  // What each fingerprinted source looks like now.
  const now = new Map(m.stamps.map((s) => [s, repos[s.coord.repo]?.exists ? localPrint(repos[s.coord.repo], s.coord.path) : null]))

  for (const row of m.repos) {
    const repo = repos[row.code]
    const r = { code: row.code, recorded: row.commit, head: repo.head, state: 'same', commits: [], touched: [], other: [], dirty: [] }
    out.repos.push(r)
    if (!repo.exists) { r.state = 'missing'; out.fresh = false; continue }
    if (!repo.isGit) { r.state = 'folder'; continue }
    if (!repo.known || !isAncestor(repo)) {
      r.state = repo.known ? 'diverged' : 'unknown'
      out.fresh = false
      out.rebuild.push(`來源 ${row.code} 記錄的 commit 找不到，或不在現在這條歷史上，無法知道這段期間改了什麼`)
      continue
    }
    // Uncommitted work is settled once a fingerprint taken over it still matches: it was looked at when the material
    // was stamped and has not moved since. A rename has two ends, and each is judged on its own.
    const covered = (f) => m.stamps.some((s) => s.coord.repo === row.code && under(s.coord.path)(f) && now.get(s) === s.print)
    const refs = (f) => users(row.code, (p) => under(p)(f))
    for (const d of dirty(repo)) {
      const sides = [d.path, d.from].filter(Boolean)
      const open = sides.filter((f) => refs(f).length && !covered(f))
      if (open.length) r.dirty.push({ ...d, where: [...new Set(sides.flatMap(refs))] })
      else if (sides.some((f) => !refs(f).length && !covered(f))) r.dirty.push({ ...d, where: [] })
    }
    if (r.dirty.some((d) => d.where.length)) out.fresh = false
    out.loose += r.dirty.filter((d) => !d.where.length).length
    if (repo.atHead) continue
    r.state = 'changed'
    out.fresh = false
    const { files, commits } = changes(repo)
    r.commits = commits
    for (const f of files) {
      const where = users(row.code, (p) => under(p)(f.path) || (f.from != null && under(p)(f.from)))
      if (where.length) r.touched.push({ ...f, where })
      else r.other.push(f)
    }
    const referenced = new Set(claims.filter((u) => u.coord.repo === row.code).map((u) => u.coord.path))
    // Counted per referenced place: a folder coordinate is one reference, however many files under it changed.
    const hit = [...referenced].filter((p) => r.touched.some((f) => under(p)(f.path) || (f.from != null && under(p)(f.from))))
    if (referenced.size >= REBUILD_MIN_FILES && hit.length / referenced.size >= REBUILD_SHARE) {
      out.rebuild.push(`來源 ${row.code} 被素材引用的 ${referenced.size} 個位置裡有 ${hit.length} 個變了，逐條查證不會比重新整理省事`)
    }
  }

  // Sources tied down by a fingerprint (local-only files, uncommitted edits) are compared by content.
  for (const s of m.stamps) {
    if (!repos[s.coord.repo]?.exists) continue
    const print = now.get(s)
    if (print === s.print) continue
    out.fresh = false
    out.stamps.push({ raw: s.coord.raw, state: print === GONE ? 'missing' : 'changed', where: near(s.coord.repo, s.coord.path) })
  }
  // A local-only source without a fingerprint cannot be shown to be unchanged. (Uncommitted edits without one are
  // already listed above with the items that point at them.)
  const stamped = new Set(m.stamps.map((s) => `${s.coord.repo}:${s.coord.path}`))
  for (const [key, want] of expectedPrints(m, repos)) {
    if (want.kind === 'missing' && !stamped.has(key)) { out.fresh = false; out.missing.push(key) }
    if (want.kind !== 'untracked' || stamped.has(key)) continue
    out.fresh = false
    out.unstamped.push(key)
  }

  // Background entries past their shelf life are re-checked against the source before they are used again.
  const slugs = new Set(m.uses.filter((u) => u.coord.bg).map((u) => u.coord.bg))
  for (const slug of slugs) {
    const f = path.join(library, 'background', `${slug}.md`)
    if (!fs.existsSync(f)) { out.missing.push(`background/${slug}.md`); continue }
    const used = new Set(m.uses.filter((u) => u.coord.bg === slug).map((u) => u.coord.entry))
    const entries = parseBackground(fs.readFileSync(f, 'utf8')).entries
    for (const id of used) if (id && !entries.some((e) => e.id === id)) out.missing.push(`background/${slug}.md 的 ${id}`)
    for (const e of entries) {
      if (!used.has(e.id)) continue
      // An entry without a real date cannot be shown to be within its shelf life.
      const age = validDate(e.date) ? Math.floor((today - new Date(`${e.date}T00:00:00Z`)) / 86400000) : null
      if (age == null || age > BACKGROUND_TTL_DAYS) out.backgrounds.push({ slug, id: e.id, age })
    }
  }
  if (out.backgrounds.length || out.missing.length) out.fresh = false
  return out
}

// The version tables to paste into the material file: current commits, and a fingerprint for each source the commit
// does not pin.
export function stamp(file, options = {}) {
  const { material: m, repos } = load(file, options)
  const missing = m.repos.filter((row) => !repos[row.code].exists).map((row) => row.code)
  const rows = m.repos.filter((row) => repos[row.code].exists).map((row) => {
    const repo = repos[row.code]
    return `| ${row.code} | ${row.location} | ${repo.isGit ? repo.head : '無'} | ${repo.isGit ? repo.headDate : new Date().toLocaleDateString('sv')} |`
  })
  // Fingerprints are judged against the commit being stamped, not the one written in the file.
  const prints = expectedPrints(m, repos, (repo) => ({ ...repo, recorded: repo.head, known: repo.isGit }))
  for (const [key, want] of prints) if (want.kind === 'missing') prints.delete(key)
  const lines = ['| 代號 | 位置 | commit | 日期 |', '|---|---|---|---|', ...rows]
  if (prints.size) lines.push('', '| 不在 commit 裡的來源 | 指紋 |', '|---|---|', ...[...prints].sort().map(([k, v]) => `| \`${k}\` | ${v.print} |`))
  // Stamping records whatever is checked out now. When that is not the version the claims were checked against,
  // the caller has to hear about it: the new table would vouch for commits nobody has read.
  const moved = m.repos.filter((row) => /^[0-9a-f]{7,40}$/.test(row.commit) && repos[row.code].isGit && !repos[row.code].atHead)
    .map((row) => ({ code: row.code, from: row.commit, to: repos[row.code].head }))
  return { text: lines.join('\n'), missing, moved }
}
