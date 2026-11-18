// Timeline: lays out scene and line start/end times from the measured audio durations, and resolves cues to seconds.
import { round } from './util.mjs'

// Time taken by the incoming transition; scene content starts after it.
export const LEAD = { cut: 0.3, push: 0.7, wipe: 0.65, zoom: 0.5 }
const GAP = 0.35 // gap between lines
const TAIL = 0.6 // hold after a scene's last line
const TAIL_BEFORE_WIPE = 0.8 // longer hold when the next scene wipes in, so the wipe does not cover the end of the line

export function buildTimeline(board, spoken) {
  let t = 0
  const scenes = board.scenes.map((s, i) => {
    if (!((s.transition ?? 'cut') in LEAD)) throw new Error(`場景 ${s.id}：不認得的轉場「${s.transition}」`)
    const transition = i === 0 ? 'cut' : (s.transition ?? 'cut') // the first scene has nothing before it, so it always cuts in
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

// Time of every non-space char in a line. TTS word segmentation splits words, so cues are matched by char position, not by word.
function charTimes(line) {
  const chars = []
  for (const w of line.words) {
    const cs = [...w.part].filter((c) => !/\s/.test(c))
    cs.forEach((c, i) => chars.push({ c: c.toLowerCase(), t: (w.start + (i / cs.length) * (w.end - w.start)) / 1000 }))
  }
  return chars
}

// Cue forms:
//   omitted       when the scene content starts
//   2             when the 3rd line (0-based) starts
//   "keyword"     when the narration reaches that word (first occurrence, searching the lines in order)
//   { line: 1, offset: 0.4 }  0.4s after the 2nd line starts
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
