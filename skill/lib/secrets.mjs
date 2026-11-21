// Storyboard scan. A storyboard puts its text on screen and sends its narration to the speech service, so credentials,
// internal addresses and personal contact details must be caught before either happens. The scanner itself lives in
// the material skill (one copy for both skills); this file only walks a storyboard and the diagrams it loads.
import fs from 'node:fs'
import path from 'node:path'
import { siblingModule } from './material.mjs'

const scanner = await siblingModule('secrets.mjs')
if (!scanner) throw new Error('找不到 arch-material skill 的機密掃描：兩個 skill 要放在同一個資料夾底下')
export const { scanText, checkAllow, mask } = scanner

const strings = (x, out = []) => {
  if (typeof x === 'string') out.push(x)
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out))
  else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => { out.push(k); strings(v, out) })
  return out
}

// Scan everything a storyboard shows or says, including the text inside the diagrams its map scenes load.
// Returns [{ where, label, excerpt }].
export function scanBoard(board, baseDir) {
  const allow = checkAllow(board.meta?.allow)
  const hits = []
  const add = (where, text) => scanText(text, allow).forEach((f) => hits.push({ where, ...f }))
  strings({ ...board.meta, allow: undefined }).forEach((s) => add('meta', s))
  strings(board.chapters).forEach((s) => add('chapters', s))
  for (const [i, s] of (board.scenes ?? []).entries()) {
    // The id names the scene in the report only when it is a plain, clean id; otherwise the report would echo it.
    const clean = typeof s?.id === 'string' && /^[a-z][a-z0-9-]*$/.test(s.id) && !scanText(s.id).length
    const name = clean ? `場景 ${s.id}` : `第 ${i + 1} 個場景`
    const { data, lines, ...fields } = s ?? {}
    // Every field is scanned, not just what is shown: ids, types and transitions are echoed by later validation errors.
    strings(fields).forEach((t) => add(`${name} 的欄位`, t))
    strings(data).forEach((t) => add(`${name} 的畫面`, t))
    strings(lines).forEach((t) => add(`${name} 的旁白`, t))
    if (s?.type === 'map' && typeof data?.svg === 'string') {
      const file = path.resolve(baseDir, data.svg)
      // Attribute values count too: ids, titles and links end up in the rendered page.
      if (fs.existsSync(file)) add(`${name} 的架構圖`, fs.readFileSync(file, 'utf8').replace(/[<>]/g, ' '))
    }
  }
  return hits
}
