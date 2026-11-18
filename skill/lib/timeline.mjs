// 時間軸：由每句旁白的音檔秒數排出各場景、各句的起訖時間，並把「觸發點」換算成秒。
import { round } from './util.mjs'

// 進場轉場佔用的時間（場景內容在這之後才開始）
export const LEAD = { cut: 0.3, push: 0.7, wipe: 0.65, zoom: 0.5 }
const GAP = 0.35 // 句與句之間的留白
const TAIL = 0.6 // 場景最後一句講完後的停留
const TAIL_BEFORE_WIPE = 0.8 // 下一個場景用擦除轉場時多留一點，讓擦除不蓋到話尾

export function buildTimeline(board, spoken) {
  let t = 0
  const scenes = board.scenes.map((s, i) => {
    if (!((s.transition ?? 'cut') in LEAD)) throw new Error(`場景 ${s.id}：不認得的轉場「${s.transition}」`)
    const transition = i === 0 ? 'cut' : (s.transition ?? 'cut') // 第一個場景沒有前一個畫面，一律直接開始
    const start = t
    const contentStart = start + LEAD[transition]
    let cursor = contentStart + 0.2
    const lines = (s.lines ?? []).map((line, j) => {
      const sp = spoken.get(`${s.id}:${j}`)
      const l = { text: line.text, say: line.say ?? line.text, start: cursor, end: cursor + sp.duration, ...sp }
      cursor = l.end + GAP
      return l
    })
    const speechEnd = lines.length ? lines.at(-1).end : contentStart + (s.hold ?? 2.5)
    const next = board.scenes[i + 1]
    const end = speechEnd + (next?.transition === 'wipe' ? TAIL_BEFORE_WIPE : TAIL) + (lines.length ? (s.hold ?? 0) : 0)
    t = end
    return { id: s.id, type: s.type, chapter: s.chapter ?? null, transition, start: round(start), contentStart: round(contentStart), end: round(end), lines }
  })
  return { scenes, total: round(t) }
}

// 一句話裡每個字（不含空白）的時間。斷詞會把詞切開，所以用字元位置對時間，不直接比對詞。
function charTimes(line) {
  const chars = []
  for (const w of line.words) {
    const cs = [...w.part].filter((c) => !/\s/.test(c))
    cs.forEach((c, i) => chars.push({ c: c.toLowerCase(), t: (w.start + (i / cs.length) * (w.end - w.start)) / 1000 }))
  }
  return chars
}

// 觸發點寫法：
//   省略         場景內容開始時
//   2            第 3 句（從 0 算）開始時
//   "分區"       旁白講到「分區」這個詞時（依序在各句裡找第一個出現處）
//   { line: 1, offset: 0.4 }  第 2 句開始後 0.4 秒
export function cueTime(scene, at) {
  if (at == null) return scene.contentStart
  if (typeof at === 'number') {
    if (!scene.lines[at]) throw new Error(`場景 ${scene.id}：觸發點指向第 ${at} 句，但沒有這一句`)
    return round(scene.lines[at].start)
  }
  if (typeof at === 'object') {
    const base = at.line != null ? scene.lines[at.line]?.start : scene.contentStart
    if (base == null) throw new Error(`場景 ${scene.id}：觸發點指向第 ${at.line} 句，但沒有這一句`)
    return round(base + (at.offset ?? 0))
  }
  const key = [...String(at)].filter((c) => !/\s/.test(c)).join('').toLowerCase()
  for (const line of scene.lines) {
    const chars = charTimes(line)
    const idx = chars.map((x) => x.c).join('').indexOf(key)
    if (idx >= 0) return round(line.start + chars[idx].t)
  }
  throw new Error(`場景 ${scene.id}：旁白裡找不到觸發詞「${at}」`)
}
