// Compose smoke test: every scene type renders into a HyperFrames project without network or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildTimeline, CUE_LEAD } from '../lib/timeline.mjs'
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
  terminal: { lines: [{ type: 'cmd', text: 'ls -la' }, { type: 'ok', text: 'done', at: '為止' }] },
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

test('旁白講完之後才出現的元素會警告', () => {
  const board = (at) => ({ scenes: [{ id: 'x', type: 'list', data: { items: ['一', { text: '二', at }] }, lines: [{ text: '旁白內容' }] }] })
  // Four chars are spoken in 0.8s; 0.9s after the line starts the voice is done but the scene is not.
  assert.match(run(board({ line: 0, offset: 0.9 })).warnings.join('\n'), /旁白講完之後才出現/)
  assert.deepEqual(run(board('內容')).warnings, [])
})

test('對比的右邊卡片在講到它的那一句開始之前出現', () => {
  const board = {
    scenes: [{
      id: 'x', type: 'compare',
      data: { left: { title: '左', items: ['一'] }, right: { title: '右', items: [{ text: '二', at: '結尾' }] } },
      lines: [{ text: '先講左邊的卡片。' }, { text: '右邊的卡片，重點放在結尾。' }],
    }],
  }
  const { html, tl } = run(board)
  const at = Number(html.match(/\["from","#x \.c1",\{[^}]*\},([\d.]+)\]/)[1])
  assert.equal(at, Math.round((tl.scenes[0].lines[1].start - CUE_LEAD) * 1000) / 1000)
})

test('用 to 做出來的進場（例如檔案的標記）排在旁白講完之後也會警告', () => {
  const board = { scenes: [{ id: 'x', type: 'file', data: { path: 'a.md', lines: ['一', '二'], highlights: [{ from: 2, at: { line: 0, offset: 0.9 } }] }, lines: [{ text: '旁白內容' }] }] }
  assert.match(run(board).warnings.join('\n'), /旁白講完之後才出現/)
})

test('終端機的下一行被上一行的打字拖到比旁白晚時會警告', () => {
  const board = (first) => ({
    scenes: [{
      id: 'x', type: 'terminal',
      data: { lines: [{ type: 'cmd', text: first, at: '指令' }, { type: 'ok', text: 'done', at: '結果' }] },
      lines: [{ text: '開場白先講一段話。' }, { text: '指令結果。' }],
    }],
  })
  assert.match(run(board('python3 scripts/check.py docs/architecture/overview.svg')).warnings.join('\n'), /比旁白晚/)
  assert.deepEqual(run(board('ls')).warnings, [])
})

test('終端機的物件觸發點是精確時間，被上一行拖慢就警告', () => {
  const board = {
    scenes: [{
      id: 'x', type: 'terminal',
      data: { lines: [{ type: 'cmd', text: 'python3 scripts/check.py docs/architecture/overview.svg', at: { line: 0, offset: 0 } }, { type: 'ok', text: 'done', at: { line: 0, offset: 0.5 } }] },
      lines: [{ text: '這一句旁白講得夠久，足夠讓指令打完。' }],
    }],
  }
  assert.match(run(board).warnings.join('\n'), /比旁白晚/)
})

test('逐一進場的元素，最後一個排在旁白講完之後也會警告', () => {
  // Eleven rows enter 0.07s apart: the tween starts in time, its last row does not.
  const rows = Array.from({ length: 11 }, (_, i) => `第 ${i + 1} 行`)
  const board = (offset) => ({ scenes: [{ id: 'x', type: 'file', data: { path: 'a.md', lines: rows, at: { line: 0, offset } }, lines: [{ text: '旁白內容' }] }] })
  assert.match(run(board(0.5)).warnings.join('\n'), /旁白講完之後才出現/)
  assert.deepEqual(run(board(0)).warnings, [])
})

test('打字效果在旁白講到之前打完', () => {
  const tween = (html, sel) => {
    const m = html.match(new RegExp(`\\["to","#x ${sel}",\\{[^}]*"duration":([\\d.]+)[^}]*\\},([\\d.]+)\\]`))
    return { duration: Number(m[1]), start: Number(m[2]) }
  }
  const term = run({ scenes: [{ id: 'x', type: 'terminal', data: { lines: [{ type: 'cmd', text: 'python3 scripts/check.py docs/architecture/overview.svg', at: '指令' }] }, lines: [{ text: '指令就是這一行。' }] }] })
  const typed = tween(term.html, '\\.t0 \\.tx')
  assert.ok(typed.start + typed.duration <= term.tl.scenes[0].lines[0].start + 0.001)
  const title = run({ scenes: [{ id: 'x', type: 'title', data: { title: 'a-very-long-project-name' }, lines: [{ text: '旁白內容' }] }] })
  const name = tween(title.html, '\\.mask')
  assert.ok(name.start + name.duration <= title.tl.scenes[0].lines[0].start + 0.001)
})

test('指令來不及在旁白講到之前打完時會警告', () => {
  // The first command leaves under 0.3s before the second one's clause starts, so the second cannot finish typing in time.
  const board = {
    scenes: [{
      id: 'x', type: 'terminal',
      data: { lines: [{ type: 'cmd', text: 'python3 scripts/check.py docs/architecture/overview.svg', at: '第一' }, { type: 'cmd', text: 'git status', at: '第二' }] },
      lines: [{ text: '先講一段開場白。' }, { text: '第一，第二。' }],
    }],
  }
  assert.match(run(board).warnings.join('\n'), /比旁白晚/)
})
