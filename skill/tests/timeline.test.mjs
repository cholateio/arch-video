// Timeline and cue tests. No network, no rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, cueTime, cueLine, cueDeadline, spread, LEAD, CUE_LEAD } from '../lib/timeline.mjs'

const words = (...list) => list.map(([part, start, end]) => ({ part, start, end }))
const spoken = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, { estimated: false, file: null, ...v }]))

function scene() {
  const board = {
    scenes: [
      {
        id: 'a',
        type: 'statement',
        lines: [{ text: '這個 skill 會先分區。' }, { text: '節點不會超過十二個。' }, { text: '先分區，再把節點連線。' }],
      },
    ],
  }
  const tl = buildTimeline(
    board,
    spoken({
      'a:0': { duration: 2, words: words(['這個 ', 0, 300], ['skill ', 300, 700], ['會先', 700, 1100], ['分區。', 1100, 1900]) },
      'a:1': { duration: 3, words: words(['節', 0, 200], ['點', 200, 400], ['不會', 400, 900], ['超過', 900, 1500], ['十', 1500, 1800], ['二個。', 1800, 2800]) },
      'a:2': { duration: 3, words: words(['先', 100, 300], ['分區，', 300, 900], ['再把', 1300, 1700], ['節點', 1700, 2100], ['連線。', 2100, 2700]) },
    }),
  )
  return tl.scenes[0]
}
const r = (n) => Math.round(n * 1000) / 1000

test('觸發詞提前到它所在的子句開始之前', () => {
  const s = scene()
  // Line 3 has two clauses; the second starts at 1.3s. "再把" opens it, so the cue is exactly CUE_LEAD before.
  assert.equal(cueTime(s, '再把'), r(s.lines[2].start + 1.3 - CUE_LEAD))
  // A word later in the same clause fires a little after, but still before the clause is spoken.
  const later = cueTime(s, '連線')
  assert.ok(later > cueTime(s, '再把'))
  assert.ok(later < s.lines[2].start + 1.3)
})

test('每個觸發點都早於旁白講到那個詞的時間', () => {
  const s = scene()
  const said = { 分區: s.lines[0].start + 1.1, 超過: s.lines[1].start + 0.9, 十二: s.lines[1].start + 1.5, 連線: s.lines[2].start + 2.1 }
  for (const [key, t] of Object.entries(said)) assert.ok(cueTime(s, key) <= t - 0.3, `${key} 應該提前至少 0.3 秒`)
})

test('同一個子句裡的觸發詞維持旁白的先後順序', () => {
  const s = scene()
  assert.ok(cueTime(s, '節點') < cueTime(s, '超過'))
  assert.ok(cueTime(s, '超過') < cueTime(s, '十二'))
})

test('觸發詞被斷詞切開、夾著空白或大小寫不同時仍找得到', () => {
  const s = scene()
  assert.equal(cueTime(s, '十二'), r(s.lines[1].start - CUE_LEAD + spread(1.5)))
  assert.equal(cueTime(s, 'SKILL'), cueTime(s, 'skill'))
  assert.equal(cueTime(s, '這個skill'), s.contentStart)
})

test('觸發詞在子句裡再後面，也在子句開始之前出現', () => {
  const board = { scenes: [{ id: 'a', type: 'statement', lines: [{ text: '開頭。' }, { text: '很長很長的一個子句最後才講到重點。' }] }] }
  const long = words(['很長', 0, 1000], ['很長的', 1000, 2000], ['一個子句', 2000, 3500], ['最後才', 3500, 5000], ['講到', 5000, 6000], ['重點。', 6000, 7000])
  const s = buildTimeline(board, spoken({ 'a:0': { duration: 1, words: words(['開頭。', 0, 800]) }, 'a:1': { duration: 7.2, words: long } })).scenes[0]
  // However late the word is, half a second is left for the component's own delays and fade-in.
  assert.ok(cueTime(s, '重點') <= s.lines[1].start - 0.5)
  assert.ok(cueTime(s, '重點') > cueTime(s, '講到'))
})

test('觸發點不會早於場景內容開始', () => {
  const s = scene()
  assert.equal(cueTime(s, '這個'), s.contentStart)
  assert.equal(cueTime(s, 0), s.contentStart)
})

test('數字代表第幾句並提前，物件是精確時間不提前，省略代表場景內容開始', () => {
  const s = scene()
  assert.equal(cueTime(s, 1), r(s.lines[1].start - CUE_LEAD))
  assert.equal(cueTime(s, { line: 0, offset: 0.4 }), r(s.lines[0].start + 0.4))
  assert.equal(cueTime(s), s.contentStart)
})

test('查得到旁白什麼時候講到觸發點：子句開頭、句子開頭，或物件指定的精確時間', () => {
  const s = scene()
  assert.equal(cueDeadline(s, '連線'), r(s.lines[2].start + 1.3))
  assert.equal(cueDeadline(s, 1), r(s.lines[1].start))
  assert.equal(cueDeadline(s, { line: 0, offset: 0.4 }), r(s.lines[0].start + 0.4))
  assert.equal(cueDeadline(s), s.contentStart)
  for (const key of ['分區', '超過', '十二', '再把', '連線']) assert.ok(cueTime(s, key) < cueDeadline(s, key), `${key} 應該早於旁白`)
  assert.throws(() => cueDeadline(s, 9), /沒有這一句/)
})

test('查得到觸發點屬於第幾句', () => {
  const s = scene()
  assert.equal(cueLine(s, '十二'), 1)
  assert.equal(cueLine(s, '連線'), 2)
  assert.equal(cueLine(s, 2), 2)
  assert.equal(cueLine(s, { line: 1, offset: 0.2 }), 1)
  assert.equal(cueLine(s), 0)
  assert.throws(() => cueLine(s, '不存在'), /找不到觸發詞/)
})

test('第一句旁白在場景內容出現之後才開始', () => {
  const s = scene()
  assert.ok(s.lines[0].start - s.contentStart >= 0.5)
})

test('旁白裡沒有的觸發詞要報錯，不能默默略過', () => {
  const s = scene()
  assert.throws(() => cueTime(s, '不存在'), /找不到觸發詞/)
  assert.throws(() => cueTime(s, 5), /沒有這一句/)
})

test('場景依序排列，句子之間留白，擦除轉場前多停一下', () => {
  const board = {
    scenes: [
      { id: 'a', type: 'title', lines: [{ text: '一' }, { text: '二' }] },
      { id: 'b', type: 'statement', transition: 'wipe', lines: [{ text: '三' }] },
      { id: 'c', type: 'statement', transition: 'push', lines: [{ text: '四' }] },
    ],
  }
  const d = (duration) => ({ duration, words: [] })
  const tl = buildTimeline(board, spoken({ 'a:0': d(1), 'a:1': d(1), 'b:0': d(2), 'c:0': d(1) }))
  const [a, b, c] = tl.scenes
  assert.equal(a.start, 0)
  assert.equal(a.transition, 'cut') // the first scene always cuts in
  assert.ok(a.lines[1].start > a.lines[0].end) // gap between lines
  assert.equal(b.start, a.end)
  assert.equal(b.contentStart, Math.round((b.start + LEAD.wipe) * 1000) / 1000)
  // a is followed by a wipe, so it holds longer after its last line than b (followed by a push)
  assert.ok(a.end - a.lines[1].end > b.end - b.lines[0].end)
  assert.equal(tl.total, c.end)
})

test('不認得的轉場要報錯', () => {
  const board = { scenes: [{ id: 'a', type: 'title', lines: [] }, { id: 'b', type: 'title', transition: 'spin', lines: [] }] }
  assert.throws(() => buildTimeline(board, new Map()), /不認得的轉場/)
})

test('第一個場景寫了不認得的轉場也要報錯', () => {
  const board = { scenes: [{ id: 'a', type: 'title', transition: 'spin', lines: [] }] }
  assert.throws(() => buildTimeline(board, new Map()), /不認得的轉場/)
})
