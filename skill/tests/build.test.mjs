// Storyboard-level checks that need no narration or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceWarnings, reasonWarnings, voiceProblem } from '../lib/build.mjs'

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
})
