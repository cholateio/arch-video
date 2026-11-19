// Which sources need a fingerprint. Check, status and stamp must agree on this, so it lives in one place.
import { lookup, localPrint, dirty, under } from './repo.mjs'

// The document map records what was read. Only claims, evidence and exclusions say something that a change can make wrong.
export const MAP = '一手文件地圖'

// A commit pins most of what the material points at. Two kinds of source escape it:
//   untracked — not in the commit at all (a local-only file, anything in a plain folder);
//   edited    — in the commit, pointed at by a claim, and touched by uncommitted work (new files under a folder count);
//   missing   — in neither the commit nor the folder: a local-only source that has since gone.
// Returns Map('code:path' -> { kind, print }) with the fingerprint of what is on disk now.
// `view` lets stamp look at each repo as of its current HEAD instead of the recorded commit.
export function expectedPrints(m, repos, view = (r) => r) {
  const out = new Map()
  for (const repo of Object.values(repos)) {
    if (!repo.exists) continue
    const at = view(repo)
    const work = dirty(repo).flatMap((d) => [d.path, d.from].filter(Boolean))
    const paths = new Map()
    for (const u of m.uses) {
      if (u.coord.repo !== repo.code || !u.coord.path) continue
      paths.set(u.coord.path, (paths.get(u.coord.path) ?? false) || u.where !== MAP)
    }
    for (const [p, claimed] of paths) {
      const hit = lookup(at, p)
      if (hit.kind === 'credential' || hit.kind === 'link') continue
      const kind = hit.kind === 'missing' ? 'missing' : !hit.tracked ? 'untracked' : claimed && work.some(under(p)) ? 'edited' : null
      if (kind) out.set(`${repo.code}:${p}`, { kind, print: localPrint(repo, p) })
    }
  }
  return out
}
