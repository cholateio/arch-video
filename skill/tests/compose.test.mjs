// Compose smoke test: every scene type renders into a HyperFrames project without network or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildTimeline } from '../lib/timeline.mjs'
import { compose } from '../lib/compose.mjs'
import theme from '../themes/night.mjs'
import scenes from '../scenes/index.mjs'
import { ROOT } from '../lib/util.mjs'

// One word per character, 200ms each, so any substring of a line works as a cue.
const speak = (text) => {
  const chars = [...text].filter((c) => !/\s/.test(c))
  return { duration: chars.length * 0.2 + 0.2, estimated: true, file: null, words: chars.map((c, i) => ({ part: c, start: i * 200, end: i * 200 + 200 })) }
}

function run(board) {
  const spoken = new Map(board.scenes.flatMap((s) => (s.lines ?? []).map((l, j) => [`${s.id}:${j}`, speak(l.say ?? l.text)])))
  const tl = buildTimeline(board, spoken)
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-video-compose-'))
  const warnings = []
  compose(board, tl, { theme, buildDir, baseDir: path.join(ROOT, 'examples/demo'), warn: (m) => warnings.push(m) })
  return { html: fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8'), warnings, tl }
}

const samples = {
  title: { title: 'demo', subtitle: '副標' },
  statement: { kicker: 'K', segments: [{ text: '甲，' }, { text: '乙', tone: 'accent' }] },
  file: { path: 'a.md', lines: ['一', '二'], highlights: [{ from: 2, at: '旁白', note: '註解' }] },
  map: { svg: 'overview.svg', focus: [{ zone: 'zone-backend', at: '旁白' }, { trace: ['e-api-query'], at: '內容' }, { nodes: ['n-api'], at: '這裡' }, { at: { line: 0, offset: 2 } }] },
  flow: { steps: [{ icon: 'eye', label: '看' }, { icon: 'wrench', label: '修', tone: 'accent' }] },
  chat: { messages: [{ who: 'them', text: '問' }, { who: 'me', text: '答', at: '旁白' }] },
  compare: { left: { title: '左', mood: 'bad', items: ['一'] }, right: { title: '右', mood: 'good', items: [{ text: '二', at: '旁白' }] } },
  list: { title: '清單', style: 'check', items: ['一', { text: '二', at: '旁白' }] },
  stat: { items: [{ value: '12', unit: '個', label: '上限' }, { value: 'A+', label: '非數字' }] },
  tree: { root: 'x/', items: [{ name: 'a/' }, { name: 'b.py', depth: 2, note: '說明', at: '旁白' }] },
  cycle: { center: '中心', steps: [{ icon: 'eye', label: '一' }, { icon: 'wrench', label: '二' }, { icon: 'check', label: '三' }] },
  terminal: { lines: [{ type: 'cmd', text: 'ls -la' }, { type: 'ok', text: 'done', at: '旁白' }] },
}

test('每一種場景元件都有測試樣本', () => {
  assert.deepEqual(Object.keys(samples).sort(), Object.keys(scenes).sort())
})

test('每一種場景元件都能合成，且每個場景都有動畫', () => {
  const transitions = ['cut', 'wipe', 'push', 'push-up', 'zoom', 'wipe', 'wipe']
  const board = {
    meta: { name: 't' },
    chapters: [{ id: 'c', label: 'C' }],
    scenes: Object.entries(samples).map(([type, data], i) => ({
      id: `s-${type}`, type, chapter: 'c', transition: transitions[i % transitions.length], data,
      lines: [{ text: '這裡是旁白的內容，講到這裡為止。' }],
    })),
  }
  const { html, warnings } = run(board)
  for (const type of Object.keys(samples)) {
    assert.ok(html.includes(`<section id="s-${type}"`), `缺少場景 ${type}`)
    assert.ok(html.includes(`"#s-${type} `), `場景 ${type} 沒有任何動畫`)
  }
  assert.deepEqual(warnings, [])
  // three chapter wipes in a row use three different looks
  for (const sel of ['#wipe i', '#iris', '#wipev i']) assert.ok(html.includes(`["fromTo","${sel}"`), `沒用到 ${sel}`)
})

test('架構圖寫錯分區、節點或連線的 id 會報錯', () => {
  const board = (focus) => ({ scenes: [{ id: 'm', type: 'map', data: { svg: 'overview.svg', focus }, lines: [{ text: '旁白內容' }] }] })
  assert.throws(() => run(board([{ zone: 'zone-nope', at: '旁白' }])), /沒有分區/)
  assert.throws(() => run(board([{ trace: ['e-nope'], at: '旁白' }])), /沒有連線/)
  assert.throws(() => run(board([{ nodes: ['n-nope'], at: '旁白' }])), /沒有節點/)
  assert.throws(() => run(board([{ trace: 'e-api-query', at: '旁白' }])), /要寫成陣列/)
  assert.throws(() => run(board([{ nodes: 'n-api', at: '旁白' }])), /要寫成陣列/)
})

test('元件的數量限制會報錯', () => {
  const one = (type, data) => ({ scenes: [{ id: 'x', type, data, lines: [{ text: '旁白內容' }] }] })
  assert.throws(() => run(one('cycle', { steps: [{ icon: 'eye', label: '一' }] })), /3 到 5 步/)
  assert.throws(() => run(one('stat', { items: [] })), /1 到 3 個/)
  assert.throws(() => run(one('stat', { items: [{ value: '1', label: 'x', tone: 'red' }] })), /tone 只能是/)
  assert.throws(() => run(one('chat', { messages: [{ who: 'nobody', text: 'x' }] })), /who 只能是/)
  assert.throws(() => run(one('flow', { steps: [{ icon: 'no-such-icon', label: 'x' }, { icon: 'eye', label: 'y' }] })), /沒有「no-such-icon」這個圖示/)
})
