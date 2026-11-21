// Storyboard scan tests: everything a storyboard shows or says goes through the material skill's scanner.
// Fake credentials are assembled at run time so no real-looking literal sits in the repo.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { scanText, scanBoard, checkAllow } from '../lib/secrets.mjs'
import { tempDir } from './tmp.mjs'

const fake = { github: `gh${'p_'}${'A1b2C3d4E5'.repeat(4)}` }
const labels = (text, allow) => scanText(text, allow).map((f) => f.label)

test('allow 要和找到的內容完全相同：片段、標點或太短的項目都不能放行', () => {
  assert.deepEqual(labels('聯絡 someone@example.com', ['example.com']), ['電子郵件'])
  assert.deepEqual(labels('聯絡 someone@example.com', ['聯絡 someone@example.com 謝謝']), ['電子郵件'])
  for (const bad of [['@'], ['.'], ['_'], ['-'], [''], ['abc'], [42], 'someone@example.com']) {
    assert.throws(() => checkAllow(bad), /meta\.allow/)
    assert.throws(() => scanBoard({ meta: { allow: bad }, scenes: [] }, '.'), /meta\.allow/)
  }
  assert.deepEqual(checkAllow(undefined), [])
})

test('分鏡的畫面、旁白與架構圖裡的文字都會掃', () => {
  const dir = tempDir('secrets-')
  fs.writeFileSync(path.join(dir, 'map.svg'), '<svg><g class="node"><text>db.corp.internal</text></g></svg>')
  const board = {
    meta: { name: 't' },
    scenes: [
      { id: 'a', type: 'file', data: { path: 'config.py', lines: [`GITHUB_TOKEN = "${fake.github}"`] }, lines: [{ text: '設定檔。' }] },
      { id: 'b', type: 'statement', data: { segments: [{ text: '好' }] }, lines: [{ text: '有問題寄到 someone@example.com。', say: '有問題寄信。' }] },
      { id: 'c', type: 'map', data: { svg: 'map.svg' }, lines: [{ text: '架構。' }] },
    ],
  }
  const where = scanBoard(board, dir).map((h) => `${h.where}:${h.label}`)
  assert.ok(where.includes('場景 a 的畫面:GitHub 權杖'))
  assert.ok(where.includes('場景 b 的旁白:電子郵件'))
  assert.ok(where.includes('場景 c 的架構圖:內部主機名稱'))
  assert.deepEqual(scanBoard({ meta: { name: 't', allow: ['someone@example.com'] }, scenes: [board.scenes[1]] }, dir), [])
})

test('場景的每個欄位都會掃，回報時不會把有問題的 id 印出來', () => {
  const scene = { id: 'someone@example.com', type: 'statement', transition: 'db-prod:5432', chapter: 'c', data: { segments: [{ text: '好' }] }, lines: [{ text: '好。' }] }
  const hits = scanBoard({ meta: { name: 't' }, scenes: [scene] }, '.')
  assert.deepEqual(hits.map((h) => `${h.where}:${h.label}`).sort(), ['第 1 個場景 的欄位:內部主機名稱', '第 1 個場景 的欄位:電子郵件'])
  assert.ok(!JSON.stringify(hits).includes('someone@example.com'))
})
