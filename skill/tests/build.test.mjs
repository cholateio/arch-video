// Storyboard-level checks that need no narration or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceWarnings, voiceProblem } from '../lib/build.mjs'

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
