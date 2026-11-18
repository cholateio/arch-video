// Timeline and cue tests. No network, no rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline, cueTime, LEAD } from '../lib/timeline.mjs'

const words = (...list) => list.map(([part, start, end]) => ({ part, start, end }))
const spoken = (entries) => new Map(Object.entries(entries).map(([k, v]) => [k, { estimated: false, file: null, ...v }]))

function scene() {
  const board = {
    scenes: [
      {
        id: 'a',
        type: 'statement',
        lines: [{ text: '這個 skill 會先分區。' }, { text: '節點不會超過十二個。' }],
      },
    ],
  }
  const tl = buildTimeline(
    board,
    spoken({
      'a:0': { duration: 2, words: words(['這個 ', 0, 300], ['skill ', 300, 700], ['會先', 700, 1100], ['分區。', 1100, 1900]) },
      'a:1': { duration: 3, words: words(['節', 0, 200], ['點', 200, 400], ['不會', 400, 900], ['超過', 900, 1500], ['十', 1500, 1800], ['二個。', 1800, 2800]) },
    }),
  )
  return tl.scenes[0]
}

test('觸發詞被斷詞切開時，取第一個字開始的時間', () => {
  const s = scene()
  assert.equal(cueTime(s, '十二'), Math.round((s.lines[1].start + 1.5) * 1000) / 1000)
  assert.equal(cueTime(s, '節點'), Math.round(s.lines[1].start * 1000) / 1000)
})

test('觸發詞落在一個詞的中間時，按字數比例估算', () => {
  const s = scene()
  // The last word spans 1100-1900ms over three chars; the cue is its second char.
  assert.equal(cueTime(s, '區'), Math.round((s.lines[0].start + 1.1 + 0.8 / 3) * 1000) / 1000)
})

test('比對時忽略空白與大小寫', () => {
  const s = scene()
  assert.equal(cueTime(s, 'SKILL'), Math.round((s.lines[0].start + 0.3) * 1000) / 1000)
  assert.equal(cueTime(s, '這個skill'), Math.round(s.lines[0].start * 1000) / 1000)
})

test('數字代表第幾句，物件可以加位移，省略代表場景內容開始', () => {
  const s = scene()
  assert.equal(cueTime(s, 1), Math.round(s.lines[1].start * 1000) / 1000)
  assert.equal(cueTime(s, { line: 0, offset: 0.4 }), Math.round((s.lines[0].start + 0.4) * 1000) / 1000)
  assert.equal(cueTime(s), s.contentStart)
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
