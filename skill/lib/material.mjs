// The gate between the two skills: a video is made only from material that exists, was reviewed by the owner and
// still matches its sources. The checks live in the material skill, which sits next to this one: skill-material/ in
// the repo, arch-material/ when the two are installed side by side.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SIBLINGS = ['../../skill-material/lib/', '../../arch-material/lib/']
// With this many scenes, a storyboard where most of them claim nothing is not being held to the material.
const MIN_SCENES_FOR_SHARE = 6

export const defaultLibrary = () => path.join(os.homedir(), 'arch-material')

// `ref` is a project name in the default library, or a path to a material file (relative to the storyboard).
export function materialFile(ref, baseDir = process.cwd()) {
  if (!/[\\/]/.test(ref) && !ref.endsWith('.md')) return path.join(defaultLibrary(), `${ref}.md`)
  return path.resolve(baseDir, ref.replace(/^~(?=[\\/])/, os.homedir()))
}

// Storyboards, previews and videos stay out of the project too: they go next to the material, in the same library.
export const workDir = (file) => path.join(path.dirname(file), 'video', path.basename(file, '.md'))

export async function materialSkill() {
  for (const rel of SIBLINGS) {
    const at = (name) => new URL(rel + name, import.meta.url)
    if (!fs.existsSync(fileURLToPath(at('check.mjs')))) continue
    const [{ check, load }, { status }, { parseBackground }] = await Promise.all(['check.mjs', 'status.mjs', 'material.mjs'].map((n) => import(at(n).href)))
    return { check, load, status, parseBackground }
  }
  return null
}

// `stops` are the reasons the video skill has to hand over to the material skill first.
export async function gate(file, { today, skill } = {}) {
  const out = { ok: false, file, stops: [], notes: [], entries: new Map(), check: null, status: null, material: null, backgrounds: [] }
  const api = skill ?? (await materialSkill())
  if (!api) { out.stops.push('找不到 arch-material skill：兩個 skill 要放在同一個資料夾底下'); return out }
  if (!fs.existsSync(file)) { out.stops.push(`素材庫裡沒有這個專案的素材（${file}）`); return out }

  const c = (out.check = await api.check(file, { today }))
  if (c.errors.length) out.stops.push(`素材檔沒有通過檢查，有 ${c.errors.length} 個錯誤（第一個：${c.errors[0]}）`)
  if (!c.reviewed) out.stops.push('素材還沒有經過 owner 審核（審核：還沒）')
  if (!c.errors.length) {
    const s = (out.status = api.status(file, { today }))
    if (!s.fresh) out.stops.push(s.rebuild.length ? '素材過期了，而且變動大到建議整份重新整理' : '素材過期了：來源在整理之後變了，或背景知識該重新確認')
    if (s.loose) out.notes.push(`來源有 ${s.loose} 個還沒 commit 的變動不在素材裡；素材描述的是 commit 裡的內容，影片也是`)
  }
  for (const w of c.warnings) out.notes.push(`素材檢查的警告：${w}`)

  const { material: m, library } = api.load(file)
  out.material = m
  for (const it of [...m.storylines, ...m.items]) out.entries.set(it.id, it.status ?? null)
  for (const a of m.arcs) out.entries.set(a.id, null)
  // Background entries count only when the material points at them: the library is shared by every project.
  const used = m.uses.filter((u) => u.coord.bg && u.coord.entry)
  for (const slug of new Set(used.map((u) => u.coord.bg))) {
    const f = path.join(library, 'background', `${slug}.md`)
    if (!fs.existsSync(f)) continue
    out.backgrounds.push(f)
    const status = new Map(api.parseBackground(fs.readFileSync(f, 'utf8')).entries.map((e) => [e.id, e.status ?? null]))
    for (const u of used) if (u.coord.bg === slug && status.has(u.coord.entry)) out.entries.set(`bg:${slug}#${u.coord.entry}`, status.get(u.coord.entry))
  }
  out.ok = !out.stops.length
  return out
}

// The claims of a video are closed: every scene lists the material entries it rests on in `basis`, and an empty list
// marks a scene that claims nothing (a bridge, a preview, a made-up opening example).
export function basisProblems(board, entries) {
  const errors = []
  const warnings = []
  const scenes = board.scenes ?? []
  const unset = []
  let empty = 0
  for (const s of scenes) {
    if (s.basis === undefined) { unset.push(s.id); continue }
    if (!Array.isArray(s.basis) || s.basis.some((b) => typeof b !== 'string')) { errors.push(`場景 ${s.id}：basis 要寫成編號的陣列，例如 ["A3.2", "F1"]；沒有主張的場景寫 []`); continue }
    if (!s.basis.length) empty++
    for (const id of s.basis) {
      if (!entries.has(id)) errors.push(`場景 ${s.id}：basis 的「${id}」不在素材裡。影片不可以講素材沒有的主張；真的需要就先回素材 skill 補上`)
      else if (entries.get(id) === '不明') errors.push(`場景 ${s.id}：basis 的「${id}」在素材裡是〔不明〕，成品不能講它`)
      else if (entries.get(id) === '查不到') errors.push(`場景 ${s.id}：basis 的「${id}」是查不到來源的背景，不能當成事實講`)
    }
  }
  if (unset.length) warnings.push(`這些場景沒有寫 basis：${unset.join('、')}。講到功能、行為、原因、背景的場景要列出素材的編號；串場或虛構情境的場景寫 []`)
  if (scenes.length >= MIN_SCENES_FOR_SHARE && empty * 2 > scenes.length) warnings.push(`${scenes.length} 個場景裡有 ${empty} 個的 basis 是空的：超過一半的場景沒有對到素材，確認不是漏填`)
  return { errors, warnings }
}
