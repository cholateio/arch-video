// Storyboard-level checks that need no narration or rendering.
import test from 'node:test'
import assert from 'node:assert/strict'
import { balanceWarnings } from '../lib/build.mjs'

const board = (...types) => ({ scenes: types.map((type, i) => ({ id: `s${i}`, type })) })

test('佐證類場景超過三分之一會警告', () => {
  assert.match(balanceWarnings(board('chat', 'title', 'tree', 'file', 'file', 'terminal', 'map', 'statement', 'title'))[0], /超過 9 個場景的三分之一/)
})

test('佐證類場景剛好三分之一、或分鏡很短時不警告', () => {
  assert.deepEqual(balanceWarnings(board('chat', 'title', 'map', 'map', 'file', 'terminal', 'statement', 'list', 'title')), [])
  assert.deepEqual(balanceWarnings(board('title', 'file', 'file', 'terminal')), [])
})
