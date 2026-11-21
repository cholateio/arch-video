// Storyboard-level checks that need no narration or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceWarnings, englishWords, pictureWarnings, reasonWarnings, termWarnings, voiceProblem, shotScenes } from '../lib/build.mjs'

const board = (...types) => ({ scenes: types.map((type, i) => ({ id: `s${i}`, type })) })

test('佐證類場景超過三分之一會警告', () => {
  assert.match(balanceWarnings(board('chat', 'title', 'tree', 'file', 'file', 'terminal', 'map', 'statement', 'title'))[0], /超過 9 個場景的三分之一/)
})

test('佐證類場景剛好三分之一、或分鏡很短時不警告', () => {
  assert.deepEqual(balanceWarnings(board('chat', 'title', 'map', 'map', 'file', 'terminal', 'statement', 'list', 'title')), [])
  assert.deepEqual(balanceWarnings(board('title', 'file', 'file', 'terminal')), [])
})

test('配音全部失敗只警告（純字幕版）；只失敗一部分就停止，不渲染半支沒聲音的影片', () => {
  const miss = (n) => Array.from({ length: n }, (_, i) => ({ where: `a 第 ${i + 1} 句`, error: 'Unexpected server response: 429' }))
  assert.equal(voiceProblem(5, []), null)
  assert.equal(voiceProblem(3, miss(3)).fatal, false)
  const partial = voiceProblem(5, miss(2))
  assert.equal(partial.fatal, true)
  assert.match(partial.message, /2 句配音失敗.*沒有渲染.*a 第 2 句/)
})

test('旁白幾乎不講原因會警告；講得夠就不警告', () => {
  const scene = (texts, type = 'list') => ({ id: 'a', type, lines: texts.map((text) => ({ text })) })
  const flat = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 步是抓資料。`)
  assert.match(reasonWarnings({ scenes: [scene(flat)] })[0], /20 句裡只有 0 句/)
  const told = [...flat.slice(0, 16), '因為來源不穩定。', '不然會漏掉。', '這樣一來重跑也安全。', '代價是慢一點。']
  assert.deepEqual(reasonWarnings({ scenes: [scene(told)] }), [])
  assert.deepEqual(reasonWarnings({ scenes: [scene(flat.slice(0, 10))] }), [])
})

test('數字場景沒有講原因或影響會警告，唸法裡有也算', () => {
  const stat = (lines) => ({ scenes: [{ id: 'n', type: 'stat', lines }] })
  assert.match(reasonWarnings(stat([{ text: '每輪最多十則。' }]))[0], /場景 n：旁白裡找不到講原因或影響的連接詞/)
  assert.deepEqual(reasonWarnings(stat([{ text: '超過十則，這會導致帳單出現尖峰。' }])), [])
  assert.deepEqual(reasonWarnings(stat([{ text: '一小時進來三十則，就會排到第三輪。' }])), [])
  assert.deepEqual(reasonWarnings(stat([{ text: '每輪最多十則。' }, { text: '為了不超過額度。' }])), [])
  assert.deepEqual(reasonWarnings(stat([{ text: 'cap 10', say: '上限十則，因為額度有限。' }])), [])
  const lay = (widget) => ({ scenes: [{ id: 'p', type: 'layout', data: { parts: [{ widget }] }, lines: [{ text: '一天二十四輪。' }] }] })
  assert.match(reasonWarnings(lay('slots'))[0], /場景 p：/)
  assert.deepEqual(reasonWarnings(lay('steps')), [])
})

test('純文字的場景超過四成、或連續三個以上會警告；只放文字零件的 layout 也算', () => {
  const words = { id: 'w', type: 'layout', data: { parts: [{ widget: 'points' }, { widget: 'figure' }] } }
  const picture = { id: 'p', type: 'layout', data: { parts: [{ widget: 'points' }, { widget: 'units' }] } }
  const s = (type, i) => ({ id: `s${i}`, type })
  const mostly = ['chat', 'compare', 'statement', 'title', 'map', 'statement', 'flow', 'list', 'title'].map(s)
  assert.match(pictureWarnings({ scenes: mostly })[0], /有 4 個，超過 9 個場景的四成/)
  const fine = ['chat', 'compare', 'title', 'map', 'map', 'flow', 'statement', 'terminal', 'list', 'title'].map(s)
  assert.deepEqual(pictureWarnings({ scenes: [...fine, picture] }), [])
  const run = ['map', 'statement', 'compare', 'map', 'map', 'flow', 'map', 'flow', 'title'].map(s)
  run.splice(3, 0, words)
  assert.match(pictureWarnings({ scenes: run }).join('\n'), /連續 3 個純文字的場景（s1、s2、w）/)
})

test('專有名詞不論列出的順序，較長的名稱都會整個被認出來', () => {
  assert.deepEqual(englishWords('跑在 GitHub Actions 上，用 cron 觸發。', ['GitHub', 'GitHub Actions']), ['cron'])
  assert.deepEqual(englishWords('跑在 GitHub Actions 上。', ['GitHub Actions', 'GitHub']), [])
  assert.deepEqual(englishWords('讀 docs/README.md。', []), ['docs/README.md'])
})

const said = (terms, ...scenes) => ({ meta: { terms }, scenes: scenes.map((lines, i) => ({ id: `s${i + 1}`, lines: lines.map((text) => ({ text })) })) })

test('專有名詞：第一次唸到要有介紹，之後改說代稱；列進 again 的場景可以再說名字', () => {
  const terms = { RSS: { intro: '訂閱格式', plain: '訂閱', again: ['s3'] } }
  assert.deepEqual(termWarnings(said(terms, ['每個帳號都有 RSS，', '一種讓閱讀器自動收到新文章的訂閱格式。'], ['讀這份訂閱。'], ['最後再說一次 RSS。'])), [])
  const w = termWarnings(said(terms, ['每個帳號都有 RSS。'], ['讀這份 RSS。']))
  assert.match(w.join('\n'), /第一次唸到是在場景 s1 第 1 句/)
  assert.match(w.join('\n'), /又唸了 1 次（s2）：改說代稱「訂閱」/)
})

test('專有名詞：沒寫進 meta.terms 會警告；known 不檢查；字幕保留名字、唸法換成代稱不算重複', () => {
  assert.match(termWarnings({ meta: { properNouns: ['Supabase'] }, scenes: [{ id: 'a', lines: [{ text: '存進 Supabase。' }] }] }).join(), /meta\.terms 卻沒有它/)
  assert.deepEqual(termWarnings(said({ YouTube: { known: true } }, ['YouTube 的頻道。'], ['YouTube 的影片。'])), [])
  const board = { meta: { terms: { Supabase: { intro: '雲端的資料庫服務', plain: '資料庫' } } }, scenes: [
    { id: 'a', lines: [{ text: 'Supabase，一個雲端的資料庫服務。' }] },
    { id: 'b', lines: [{ text: '寫進 Supabase。', say: '寫進資料庫。' }] },
  ] }
  assert.deepEqual(termWarnings(board), [])
})

test('專有名詞：較長的名字整個算一個，不會連帶算成較短的；兩個名字用同一個代稱會警告', () => {
  const terms = { 'GitHub Actions': { intro: '排程與執行工作的服務', plain: '工作流程' }, GitHub: { known: true } }
  assert.deepEqual(termWarnings(said(terms, ['GitHub Actions，GitHub 上排程與執行工作的服務。'])), [])
  assert.match(termWarnings(said({ A: { intro: '甲', plain: '它' }, B: { intro: '乙', plain: '它' } }, ['A 是甲'])).join(), /代稱都是「它」/)
})

test('專有名詞：介紹的那一句裡又唸一次名字也算重複', () => {
  const w = termWarnings(said({ RSS: { intro: '訂閱格式', plain: '訂閱' } }, ['RSS 是一種訂閱格式；RSS 接著被讀取。']))
  assert.match(w.join(), /又唸了 1 次（s1）/)
})

test('分鏡裡有哪些截圖場景：沒寫 meta.material 時 build 用它來停止', () => {
  assert.deepEqual(shotScenes({ scenes: [{ id: 'a', type: 'shot' }, { id: 'b', type: 'title' }] }), ['a'])
})
