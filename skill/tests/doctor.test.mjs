// Doctor tests. The TTS check is skipped so nothing touches the network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { collect } from '../lib/doctor.mjs'

const row = (rows, name) => rows.find((r) => r.name === name)

test('HYPERFRAMES_BROWSER_PATH 指向不存在的檔案時，列為「缺」並說明怎麼改', async () => {
  const rows = await collect({ env: { HYPERFRAMES_BROWSER_PATH: '/no/such/chrome' }, checkTts: false })
  const chrome = row(rows, '無頭 Chrome')
  assert.equal(chrome.level, 'fail')
  assert.match(chrome.detail, /不存在/)
  assert.ok(chrome.fix)
})

test('HYPERFRAMES_BROWSER_PATH 指向存在的檔案時視為可用', async () => {
  const rows = await collect({ env: { HYPERFRAMES_BROWSER_PATH: process.execPath }, checkTts: false })
  assert.equal(row(rows, '無頭 Chrome').level, 'ok')
})

test('每一項不是 OK 的檢查都附補救方法或說明', async () => {
  const rows = await collect({ env: {}, checkTts: false })
  assert.ok(row(rows, 'Node.js'))
  for (const r of rows.filter((x) => x.level === 'fail')) assert.ok(r.fix, `${r.name} 缺少補救方法`)
})
