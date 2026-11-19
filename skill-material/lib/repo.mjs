// Read-only access to the repos a material file points at. Every git call here only reads.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Files that hold credentials are never opened, not even to check that a coordinate points somewhere.
const CREDENTIAL = [
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$|defaults$)[^/]*)?$/i,
  /\.(pem|key|p12|pfx|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)[^/]*$/i,
  /(^|\/)\.(npmrc|netrc)$/i,
  /(^|\/)(credentials|secrets?)\.(json|ya?ml|toml)$/i,
]
export const isCredential = (p) => CREDENTIAL.some((re) => re.test(p))

export const expand = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p)
export const fingerprint = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12)

function git(dir, ...args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

// row: { code, location, commit } from the version table. `override` maps a code to another folder (a different machine).
export function openRepo(row, override = {}) {
  const dir = path.resolve(expand(override[row.code] ?? row.location))
  const repo = { code: row.code, dir, recorded: row.commit, exists: fs.existsSync(dir), isGit: false, head: null, headDate: null, known: false }
  if (!repo.exists) return repo
  // Only a repo root counts. A plain folder that happens to sit inside some other repo is still a plain folder.
  const top = git(dir, 'rev-parse', '--show-toplevel')?.trim()
  const head = top && fs.realpathSync(top) === fs.realpathSync(dir) ? git(dir, 'rev-parse', '--short=7', 'HEAD') : null
  if (head == null) return repo
  repo.isGit = true
  repo.head = head.trim()
  repo.headDate = git(dir, 'show', '-s', '--format=%cs', 'HEAD')?.trim() ?? null
  // A row can say there is no commit (a plain folder), or hold a placeholder before the first stamp.
  repo.known = /^[0-9a-f]{7,40}$/.test(row.commit) && git(dir, 'cat-file', '-e', `${row.commit}^{commit}`) != null
  repo.atHead = repo.known && git(dir, 'rev-parse', '--short=7', row.commit)?.trim() === repo.head
  return repo
}

export const hasCommit = (repo, commit) => repo.isGit && git(repo.dir, 'cat-file', '-e', `${commit}^{commit}`) != null

const SKIP_DIRS = new Set(['.git', 'node_modules'])
const lstat = (p) => { try { return fs.lstatSync(p) } catch { return null } }

// Where a path is on disk: { full, stat }, { link: true } for a symbolic link or anything that resolves outside the
// source, or null when it is not there. Links are never followed: they can point outside the source.
function locate(repo, p) {
  const full = path.join(repo.dir, p)
  if (!full.startsWith(repo.dir + path.sep)) return null
  // Every step of the way is checked, not only the last one: a linked folder in the middle leads away just the same.
  let step = repo.dir
  for (const part of p.split('/')) {
    step = path.join(step, part)
    const st = lstat(step)
    if (!st) return null
    if (st.isSymbolicLink()) return { link: true, full }
  }
  const stat = lstat(full)
  const root = fs.realpathSync(repo.dir)
  const real = fs.realpathSync(full)
  if (real !== root && !real.startsWith(root + path.sep)) return { link: true, full }
  return { full, stat }
}

// Fingerprint of a folder: every file's path and content, in a fixed order. A link counts by where it points, not by
// what is there. Credential files are left out.
function dirPrint(root) {
  const h = crypto.createHash('sha1')
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name
      const full = path.join(dir, e.name)
      if (e.isSymbolicLink()) h.update(`${r}\0link:${fs.readlinkSync(full)}\0`)
      else if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, r) }
      else if (e.isFile() && !isCredential(r)) h.update(`${r}\0`).update(fs.readFileSync(full)).update('\0')
    }
  }
  walk(root, '')
  return h.digest('hex').slice(0, 12)
}

// What a path is in the recorded version: { kind: 'file' | 'dir' | 'credential' | 'link' | 'missing', tracked, text? }.
// Something that is not in the commit but exists in the folder is a local-only source (a lessons log, a plain folder).
export function lookup(repo, p) {
  if (isCredential(p)) return { kind: 'credential' }
  if (repo.known) {
    // ls-tree gives the mode as well as the type: a committed link is a blob whose mode is 120000.
    const [mode, type] = (git(repo.dir, 'ls-tree', repo.recorded, '--', p) ?? '').split(/\s+/)
    if (mode === '120000') return { kind: 'link' }
    if (type === 'tree') return { kind: 'dir', tracked: true }
    if (type === 'blob') return { kind: 'file', tracked: true, text: git(repo.dir, 'show', `${repo.recorded}:${p}`) ?? '' }
  }
  const at = locate(repo, p)
  if (!at) return { kind: 'missing' }
  if (at.link) return { kind: 'link' }
  if (at.stat.isDirectory()) return { kind: 'dir', tracked: false }
  return { kind: 'file', tracked: false, text: fs.readFileSync(at.full, 'utf8') }
}

// What stands in a fingerprint's place when the path is not on disk (deleted or moved away in the working tree).
export const GONE = '無'

// Fingerprint of what is in the folder right now: a file, a whole directory, or where a link points.
export function localPrint(repo, p) {
  if (isCredential(p)) return GONE
  const at = locate(repo, p)
  if (!at) return GONE
  if (at.link) return fingerprint(Buffer.from(`link:${lstat(at.full)?.isSymbolicLink() ? fs.readlinkSync(at.full) : 'outside'}`))
  return at.stat.isDirectory() ? dirPrint(at.full) : fingerprint(fs.readFileSync(at.full))
}

export const under = (p) => (f) => f === p || f.startsWith(`${p}/`)

// Uncommitted work: [{ path, from?, untracked }]. Edited and staged files, renames (both names), and new files git does
// not ignore. What was read may not be what the recorded commit holds, and a new file may be a new feature.
export function dirty(repo) {
  if (!repo.isGit) return []
  const parts = (git(repo.dir, 'status', '--porcelain', '-z', '--untracked-files=all') ?? '').split('\0')
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const item = { path: entry.slice(3), untracked: code === '??' }
    // With -z a rename or copy is followed by its original path as a separate field.
    if (/[RC]/.test(code)) item.from = parts[++i]
    out.push(item)
  }
  return out
}

// Changes between the recorded commit and HEAD: [{ status, path, from? }], plus the commit subjects.
export function changes(repo) {
  if (!repo.known || repo.atHead) return { files: [], commits: [] }
  const files = (git(repo.dir, 'diff', '--name-status', '-M', repo.recorded, 'HEAD') ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [status, a, b] = l.split('\t')
      return status.startsWith('R') ? { status: 'R', from: a, path: b } : { status: status[0], path: a }
    })
  const commits = (git(repo.dir, 'log', '--format=%h %cs %s', `${repo.recorded}..HEAD`) ?? '').split('\n').filter(Boolean)
  return { files, commits }
}

// False when history was rewritten or the recorded commit lives on another branch: there is no "since then" to read.
export const isAncestor = (repo) => repo.known && git(repo.dir, 'merge-base', '--is-ancestor', repo.recorded, 'HEAD') != null
