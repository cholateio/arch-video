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
import widgets from '../widgets/index.mjs'
import { ROOT } from '../lib/util.mjs'
import zlib from 'node:zlib'

// A real (blank) PNG of the given size, written once per test run.
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0
  const raw = Buffer.alloc((w + 1) * h)
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arch-video-png-')), `${w}x${h}.png`)
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  return file
}
const PHONE_PNG = png(700, 1800)
const WIDE_PNG = png(1440, 900)

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
  shot: { file: PHONE_PNG, marks: [{ at: '旁白', box: [100, 800, 500, 300], note: '譯文', zoom: 1.2 }] },
  layout: { title: '標題', parts: [{ widget: 'units', total: 20, group: 10, head: '左', mood: 'good', steps: [{ take: 10, at: '旁白' }], left: { label: '剩下' }, tally: { label: '輪' }, foot: '註' }, { widget: 'figure', value: '10', label: '上限' }] },
}

// One part per widget, for the layout scene.
const parts = {
  figure: { value: '10', unit: '則', label: '上限', tone: 'accent', at: '旁白' },
  units: { total: 30, group: 10, steps: [{ take: 10 }, { take: 20, rounds: 2, tone: 'accent', at: '內容' }], left: { label: '剩下', unit: '則' }, tally: { label: '用了', unit: '輪' } },
  slots: { total: 24, ends: ['0 時', '24 時'], rows: [{ label: '應該', on: 24 }, { label: '實際', on: [0, 5, 9], tone: 'accent', at: '內容' }], sum: { label: '次', per: 1 } },
  meter: { unit: '則', bars: [{ label: '上限', value: 240 }, { label: '實測', value: 148, tone: 'accent', at: '內容' }], limit: { value: 240, label: '一天最多' } },
  points: { frame: true, style: 'check', items: ['第一點', { text: '第二點', sub: '補充', at: '內容' }] },
  steps: { steps: [{ icon: 'eye', label: '看' }, { icon: 'wrench', label: '修', tone: 'accent', at: '內容' }] },
  term: { title: '示意', lines: [{ type: 'cmd', text: 'ls -la' }, { type: 'ok', text: 'done', at: '為止' }] },
  panel: { title: '執行紀錄（示意）', rows: [{ text: '第一輪', state: 'ok', badge: '10/10' }, { text: '第二輪', state: 'wait', badge: '0/10', then: { state: 'fail', badge: '0/10 失敗', at: '內容' } }], buttons: ['重跑', '略過'] },
}
const one = (type, data) => ({ scenes: [{ id: 'x', type, data, lines: [{ text: '旁白內容' }] }] })

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

test('開場太久沒有東西會警告；不重畫的架構圖一開始就在畫面上，不算', () => {
  const board = (draw) => ({ scenes: [{ id: 'x', type: 'map', data: { svg: 'overview.svg', draw, focus: [{ nodes: ['n-api'], at: { line: 0, offset: 3 } }] }, lines: [{ text: '一二三四五六七八九十一二三四五六七八九十' }] }] })
  assert.deepEqual(run(board(false)).warnings, [])
  const list = { scenes: [{ id: 'y', type: 'list', data: { items: [{ text: '一', at: { line: 0, offset: 3 } }] }, lines: [{ text: '一二三四五六七八九十一二三四五六七八九十' }] }] }
  assert.match(run(list).warnings.join('\n'), /畫面才有東西/)
})

test('數字場景有標題時，標題一開場就在，數字晚到也不算空畫面', () => {
  const board = (title) => ({ scenes: [{ id: 'n', type: 'stat', data: { title, items: [{ value: '10', label: '上限', at: { line: 0, offset: 3 } }] }, lines: [{ text: '一二三四五六七八九十一二三四五六七八九十' }] }] })
  assert.match(run(board()).warnings.join('\n'), /畫面才有東西/)
  const withTitle = run(board('為什麼要有上限'))
  assert.deepEqual(withTitle.warnings, [])
  assert.match(withTitle.html, /為什麼要有上限/)
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

test('對比卡片的項目寫了不支援的欄位會警告，不會默默丟掉', () => {
  const board = { scenes: [{ id: 'x', type: 'compare', data: { left: { title: '左', items: [{ text: '一', sub: '補充' }] }, right: { title: '右', items: ['二'] } }, lines: [{ text: '旁白內容。' }] }] }
  assert.match(run(board).warnings.join('\n'), /「sub」不會顯示/)
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

test('每一種零件都有測試樣本，放進各種版面都能合成', () => {
  assert.deepEqual(Object.keys(parts).sort(), Object.keys(widgets).sort())
  const part = (name, extra) => ({ widget: name, ...parts[name], ...extra })
  const data = [
    { parts: [part('meter')] },
    { title: '左右', ratio: [3, 2], parts: [part('units', { head: '左', mood: 'bad', foot: { text: '註', at: '內容' } }), part('figure')] },
    { arrange: 'stack', parts: [part('slots'), part('meter')] },
    { parts: [part('figure'), part('units'), part('figure', { enter: '內容' })] },
    { parts: [part('points'), part('steps')] },
    { ratio: [2, 3], parts: [part('steps', { direction: 'column' }), part('term')] },
    { parts: [part('panel'), part('points', { frame: false, style: 'number' })] },
  ]
  for (const d of data) {
    const { html, warnings } = run({ scenes: [{ id: 'x', type: 'layout', data: d, lines: [{ text: '這裡是旁白的內容，講到這裡為止。' }] }] })
    assert.deepEqual(warnings, [])
    d.parts.forEach((p, k) => assert.ok(html.includes(`"#x .p${k} `), `第 ${k + 1} 個零件（${p.widget}）沒有任何動畫`))
  }
})

test('零件預設隨場景一起進場；寫了 enter 才等到那個觸發點', () => {
  const lines = [{ text: '先講第一句。' }, { text: '再講第二句。' }]
  const headAt = (enter) => {
    const data = { parts: [{ widget: 'figure', value: 'A', label: '甲', head: '左' }, { widget: 'figure', value: 'B', label: '乙', head: '右', enter }] }
    const { html, tl } = run({ scenes: [{ id: 'x', type: 'layout', data, lines }] })
    return { at: Number(html.match(/\["from","#x \.p1 \.pl",\{[^}]*\},([\d.]+)\]/)[1]), first: tl.scenes[0].lines[0].start }
  }
  const plain = headAt()
  assert.ok(plain.at < plain.first)
  const late = headAt(1)
  assert.ok(late.at > late.first)
})

test('版面與零件寫錯會報錯', () => {
  const lay = (d) => run(one('layout', d))
  assert.throws(() => lay({ parts: [] }), /parts 要 1 到 3 個/)
  assert.throws(() => lay({ arrange: 'stack', parts: [{ widget: 'figure', ...parts.figure }] }), /要 2 個 parts/)
  assert.throws(() => lay({ parts: [{ widget: 'pie' }] }), /不認得的零件「pie」/)
  assert.throws(() => lay({ parts: [{ widget: 'units', total: 10, steps: [{ take: 11 }] }] }), /超過 total/)
  assert.throws(() => lay({ parts: [{ widget: 'units', total: 10, group: 0, steps: [{ take: 1 }] }] }), /group 要是正整數/)
  assert.throws(() => lay({ parts: [{ widget: 'slots', total: 24, rows: [{ on: -1 }] }] }), /0 到 24 的整數/)
  assert.throws(() => lay({ parts: [{ widget: 'slots', total: 24, rows: [{ on: 1e9 }] }] }), /0 到 24 的整數/)
  assert.throws(() => lay({ ratio: [1, 4], parts: [{ widget: 'slots', total: 24, rows: [{ on: 24 }], sum: { label: '次' } }, { widget: 'figure', value: '1', label: '甲' }] }), /放不下 24 格和旁邊的計數/)
  // 24 cells of 16px would fit 400px, but each loses 3px to the gap.
  assert.throws(() => lay({ ratio: [1, 3], parts: [{ widget: 'slots', total: 24, rows: [{ on: 24 }] }, { widget: 'figure', value: '1', label: '甲' }] }), /放不下 24 格/)
  assert.throws(() => lay({ parts: [{ widget: 'slots', total: 24, rows: [{ on: [24] }] }] }), /0 到 23 之間/)
  assert.throws(() => lay({ parts: [{ widget: 'meter', max: 100, bars: [{ label: '甲', value: 148 }] }] }), /不能小於最大的數值/)
  assert.throws(() => lay({ parts: [{ widget: 'figure', value: '1' }] }), /要有 value 與 label/)
  assert.throws(() => lay({ parts: [{ widget: 'points', items: [] }] }), /items 要 1 到 5 項/)
  assert.throws(() => lay({ parts: [{ widget: 'steps', steps: [{ icon: 'eye', label: '一' }] }] }), /steps 要 2 到 5 步/)
  assert.throws(() => lay({ parts: [{ widget: 'term', lines: [] }] }), /終端機要 1 到 6 行/)
  assert.throws(() => lay({ parts: [{ widget: 'panel', title: '甲', rows: [{ text: '乙', state: 'green' }] }] }), /state 只能是/)
  assert.throws(() => lay({ parts: [{ widget: 'panel', title: '甲', rows: [{ text: '乙', then: { state: 'ok' } }] }] }), /then 要有 at/)
})

test('格子太多、擠到看不清楚時會警告', () => {
  const data = { arrange: 'stack', ratio: [1, 19], parts: [{ widget: 'units', total: 400, steps: [{ take: 1 }] }, { widget: 'figure', value: '2', label: '乙' }] }
  assert.match(run(one('layout', data)).warnings.join('\n'), /看不清楚/)
})

test('上下疊的零件比分到的高度還高時會警告', () => {
  const lines = [{ text: '這一句旁白講得夠久，足夠讓四條長條都出現。' }]
  const stack = (ratio) => run({ scenes: [{ id: 'x', type: 'layout', lines, data: { arrange: 'stack', ratio, parts: [{ widget: 'slots', total: 24, rows: [{ on: 24 }] }, { widget: 'meter', bars: [{ label: '甲', value: 1 }, { label: '乙', value: 2 }, { label: '丙', value: 3 }, { label: '丁', value: 4 }] }] } }] }).warnings.join('\n')
  assert.match(stack([4, 1]), /第 2 個零件（meter）需要 478px 高，這個位置只有 141px/)
  assert.equal(stack([1, 4]), '')
  // The counter beside a strip is taller than a bare strip, and it counts too.
  const withSum = (ratio) => run({ scenes: [{ id: 'x', type: 'layout', lines, data: { arrange: 'stack', ratio, parts: [{ widget: 'slots', total: 24, rows: [{ on: 24 }], sum: { label: '次' } }, { widget: 'figure', value: '1', label: '甲' }] } }] }).warnings.join('\n')
  assert.match(withSum([1, 6]), /第 1 個零件（slots）需要 117px 高/)
})

test('章節標示：每一章都有 short 時是一排名稱，否則是圓點加目前這一章的標題', () => {
  const board = (chapters) => ({
    chapters,
    scenes: chapters.map((c, i) => ({ id: `s${i}`, type: 'statement', chapter: c.id, transition: 'wipe', data: { segments: [{ text: '甲' }] }, lines: [{ text: '旁白內容' }] })),
  })
  const named = run(board([{ id: 'a', label: 'WHY', short: '為什麼' }, { id: 'b', label: 'CAP', short: '上限' }]))
  assert.match(named.html, /<div id="chip-1"[^>]*><span class="pill done">為什麼<\/span><i class="ln"><\/i><span class="pill cur">上限<\/span><\/div>/)
  assert.deepEqual(named.warnings, [])
  const dots = run(board([{ id: 'a', label: 'WHY' }, { id: 'b', label: 'CAP' }]))
  assert.match(dots.html, /<div id="chip-1"[^>]*><i class="dot done"><\/i><span class="cur"><b>02<\/b>CAP<\/span><\/div>/)
  const mixed = run(board([{ id: 'a', label: 'WHY', short: '為什麼' }, { id: 'b', label: 'CAP' }]))
  assert.match(mixed.warnings.join('\n'), /只有一部分寫了 short/)
  assert.match(mixed.html, /class="dot done"/)
})

test('截圖：直的放進手機外框、橫的放進瀏覽器視窗；檔案複製進專案，框跟著觸發點出現', () => {
  const board = { scenes: [
    { id: 'a', type: 'shot', data: { file: PHONE_PNG, marks: [{ at: '原文', box: [0, 0, 700, 400], note: '原文' }, { at: '譯文', box: [0, 1400, 700, 400], note: '譯文' }] }, lines: [{ text: '先看原文。' }, { text: '再看譯文。' }] },
    { id: 'b', type: 'shot', data: { file: WIDE_PNG, url: 'example.com' }, lines: [{ text: '整個網頁。' }] },
  ] }
  const { html, warnings } = run(board)
  assert.match(html, /class="dev phone"/)
  assert.match(html, /class="dev browser"[\s\S]*example\.com/)
  assert.match(html, /src="assets\/a-0\.png"/)
  assert.ok(html.includes('["from","#a .b1"'), '第二個框沒有動畫')
  // the second mark sits at the bottom of a tall capture, so the view pans down to it
  const pans = [...html.matchAll(/\["to","#a \.pan",\{"x":[^,]*,"y":(-?[\d.]+)/g)].map((m) => Number(m[1]))
  assert.equal(pans.length, 2)
  assert.ok(pans[1] < pans[0], '沒有往下捲到第二個框')
  assert.deepEqual(warnings, [])
})

test('截圖：放大到框超出畫面時改小並警告；框超出截圖、素材座標沒有經過 build 解析都會報錯', () => {
  const wide = one('shot', { file: PHONE_PNG, marks: [{ at: '旁白', box: [0, 0, 700, 300], zoom: 2 }] })
  assert.match(run(wide).warnings.join('\n'), /zoom 2 會讓框超出畫面/)
  assert.throws(() => run(one('shot', { file: PHONE_PNG, marks: [{ at: '旁白', box: [0, 1700, 700, 300] }] })), /超出截圖/)
  assert.throws(() => run(one('shot', { image: 'data:screens/a.png' })), /meta\.material/)
})
