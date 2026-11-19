// Timeline: lays out scene and line start/end times from the measured audio durations, and resolves cues to seconds.
import { round } from './util.mjs'

// Time taken by the incoming transition; scene content starts after it.
export const LEAD = { cut: 0.3, push: 0.7, 'push-up': 0.7, wipe: 0.65, zoom: 0.5 }
const GAP = 0.35 // gap between lines
const SPEECH_DELAY = 0.5 // the first line waits this long after the scene content starts, so the opening elements are on screen before the voice
// The picture leads the voice: a cue fires this long before the clause (or line) that mentions it.
export const CUE_LEAD = 0.8
// Cues that share a clause keep their spoken order inside a window that closes before the clause starts:
// a word d seconds into its clause fires spread(d) after the first one, and spread() never reaches SPREAD_MAX.
// That leaves every cue at least CUE_LEAD - SPREAD_MAX = 0.5s before its clause: room for a component's own delays and fade-in.
const SPREAD_MAX = 0.3
const SPREAD_HALF = 1 // seconds into the clause at which half of the window is used
export const spread = (d) => (SPREAD_MAX * d) / (d + SPREAD_HALF)
const CLAUSE_END = /[，、；：。！？,;:!?…—]/
const TAIL = 0.6 // hold after a scene's last line
const TAIL_BEFORE_WIPE = 0.8 // longer hold when the next scene wipes in, so the wipe does not cover the end of the line

export function buildTimeline(board, spoken) {
  let t = 0
  const scenes = board.scenes.map((s, i) => {
    if (!((s.transition ?? 'cut') in LEAD)) throw new Error(`場景 ${s.id}：不認得的轉場「${s.transition}」`)
    const transition = i === 0 ? 'cut' : (s.transition ?? 'cut') // the first scene has nothing before it, so it always cuts in
    const start = t
    const contentStart = start + LEAD[transition]
    let cursor = contentStart + SPEECH_DELAY
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

// Time of every non-space char in a line, and the start of the clause it belongs to (a clause ends at punctuation).
// TTS word segmentation splits words, so cues are matched by char position, not by word.
function charTimes(line) {
  const chars = []
  let clause = null
  for (const w of line.words) {
    if (clause == null) clause = w.start / 1000
    const cs = [...w.part].filter((c) => !/\s/.test(c))
    cs.forEach((c, i) => chars.push({ c: c.toLowerCase(), t: (w.start + (i / cs.length) * (w.end - w.start)) / 1000, clause }))
    if (CLAUSE_END.test(w.part)) clause = null
  }
  return chars
}

// Cue forms:
//   omitted       when the scene content starts
//   2             just before the 3rd line (0-based) starts
//   "keyword"     just before the clause that says that word (first occurrence, searching the lines in order)
//   { line: 1, offset: 0.4 }  exactly 0.4s after the 2nd line starts (no lead)
// Keyword and line cues fire CUE_LEAD early, never before the scene content starts, so an element is in place before the voice reaches it.
export function cueTime(scene, at) {
  if (at == null) return scene.contentStart
  const lead = (t) => round(Math.max(scene.contentStart, t - CUE_LEAD))
  if (typeof at === 'number') {
    if (!scene.lines[at]) throw new Error(`場景 ${scene.id}：觸發點指向第 ${at} 句，但沒有這一句`)
    return lead(scene.lines[at].start)
  }
  if (typeof at === 'object') {
    const base = at.line != null ? scene.lines[at.line]?.start : scene.contentStart
    if (base == null) throw new Error(`場景 ${scene.id}：觸發點指向第 ${at.line} 句，但沒有這一句`)
    return round(base + (at.offset ?? 0))
  }
  const hit = find(scene, at)
  return lead(hit.line.start + hit.char.clause + spread(hit.char.t - hit.char.clause))
}

function find(scene, at) {
  const key = [...String(at)].filter((c) => !/\s/.test(c)).join('').toLowerCase()
  for (const [index, line] of scene.lines.entries()) {
    const chars = charTimes(line)
    const idx = chars.map((x) => x.c).join('').indexOf(key)
    if (idx >= 0) return { index, line, char: chars[idx] }
  }
  throw new Error(`場景 ${scene.id}：旁白裡找不到觸發詞「${at}」`)
}

// When the voice reaches what a cue points at: the start of the clause (keyword), of the line (number), or the exact time (object).
// An element that enters after this trails the narration.
export function cueDeadline(scene, at) {
  if (at == null || typeof at === 'object') return cueTime(scene, at)
  if (typeof at === 'number') {
    if (!scene.lines[at]) throw new Error(`場景 ${scene.id}：觸發點指向第 ${at} 句，但沒有這一句`)
    return round(scene.lines[at].start)
  }
  const hit = find(scene, at)
  return round(hit.line.start + hit.char.clause)
}

// Index of the line a cue belongs to, so a container can arrive when the line about its content starts.
export function cueLine(scene, at) {
  if (at == null) return 0
  if (typeof at === 'number') return at
  if (typeof at === 'object') return at.line ?? 0
  return find(scene, at).index
}
