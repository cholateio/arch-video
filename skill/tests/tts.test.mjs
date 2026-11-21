// TTS layer tests with a fake synthesiser; no network.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { synth, resetBreaker } from '../lib/tts.mjs'
import { tempDir } from './tmp.mjs'

const tmp = () => tempDir('tts-')

test('配音服務連不上時，連續兩句失敗後就不再嘗試', async () => {
  resetBreaker()
  let calls = 0
  const engine = async () => { calls++; throw new Error('Timed out') }
  const opts = { voice: 'zh-TW-HsiaoChenNeural', cacheDir: tmp(), engine }

  const a = await synth('第一句。', opts)
  const b = await synth('第二句。', opts)
  assert.equal(calls, 4) // two attempts per line
  const c = await synth('第三句。', opts)
  const d = await synth('第四句。', opts)
  assert.equal(calls, 4) // no calls once the breaker is open

  for (const r of [a, b, c, d]) {
    assert.equal(r.estimated, true)
    assert.equal(r.file, null)
    assert.ok(r.duration > 0)
  }
  assert.match(c.error, /已略過/)
})

test('合成成功會寫入快取，第二次不再呼叫合成器，並重設失敗計數', async () => {
  resetBreaker()
  let calls = 0
  const engine = async (text, _opts, mp3) => { calls++; fs.writeFileSync(mp3, 'fake'); return [{ part: text, start: 0, end: 900 }] }
  const opts = { voice: 'zh-TW-HsiaoChenNeural', cacheDir: tmp(), engine, measure: () => 1.25 }

  const first = await synth('你好。', opts)
  assert.equal(first.cached, false)
  assert.equal(first.duration, 1.25)
  const again = await synth('你好。', opts)
  assert.equal(again.cached, true)
  assert.equal(again.duration, 1.25)
  assert.equal(calls, 1)
})

test('估算時間時，英文詞與全形字都算進去，標點只算停頓', async () => {
  resetBreaker()
  const engine = async () => { throw new Error('offline') }
  const r = await synth('這個 skill 很好。', { voice: 'v', cacheDir: tmp(), engine })
  assert.deepEqual(r.words.map((w) => w.part), ['這', '個', 'skill', '很', '好。'])
  assert.ok(r.duration > 1)
})

test('離線模式不呼叫配音服務；之前配過音的句子仍用快取', async () => {
  resetBreaker()
  const cacheDir = tmp()
  let calls = 0
  const engine = async (text, opts, mp3) => { calls++; fs.writeFileSync(mp3, 'x'); return [{ part: text, start: 0, end: 500 }] }
  const off = await synth('還沒配過音。', { voice: 'v', cacheDir, engine, measure: () => 1, offline: true })
  assert.equal(calls, 0)
  assert.equal(off.estimated, true)
  assert.equal(off.offline, true)
  assert.equal(off.file, null)
  await synth('配過音了。', { voice: 'v', cacheDir, engine, measure: () => 1 })
  assert.equal(calls, 1)
  const hit = await synth('配過音了。', { voice: 'v', cacheDir, engine, measure: () => 1, offline: true })
  assert.equal(calls, 1)
  assert.equal(hit.cached, true)
})

test('配音服務回 429 時會等一下再試，等過三次還是不行才算失敗', async () => {
  resetBreaker()
  const waits = []
  const sleep = async (ms) => { waits.push(ms) }
  let calls = 0
  const flaky = async () => { calls++; if (calls <= 2) throw new Error('Unexpected server response: 429'); return [{ part: '好', start: 0, end: 500 }] }
  const ok = await synth('等一下就好。', { voice: 'v', cacheDir: tmp(), engine: flaky, measure: () => 1, sleep })
  assert.equal(ok.estimated, false)
  assert.deepEqual(waits, [15000, 30000])

  waits.length = 0
  calls = 0
  const always = async () => { calls++; throw new Error('Unexpected server response: 429') }
  const bad = await synth('一直被擋。', { voice: 'v', cacheDir: tmp(), engine: always, sleep })
  assert.equal(bad.estimated, true)
  assert.match(bad.error, /429/)
  assert.deepEqual(waits, [15000, 30000, 60000])
  assert.equal(calls, 4)
})

test('不是 429 的錯誤不等待，照原本的次數重試', async () => {
  resetBreaker()
  const waits = []
  let calls = 0
  const engine = async () => { calls++; throw new Error('Timed out') }
  await synth('連不上。', { voice: 'v', cacheDir: tmp(), engine, sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(waits, [])
  assert.equal(calls, 2)
})

test('backoff 給空陣列時遇到 429 不等待（體檢用）', async () => {
  resetBreaker()
  const waits = []
  let calls = 0
  const engine = async () => { calls++; throw new Error('Unexpected server response: 429') }
  const r = await synth('測試。', { voice: 'v', cacheDir: tmp(), engine, backoff: [], sleep: async (ms) => { waits.push(ms) } })
  assert.equal(r.estimated, true)
  assert.deepEqual(waits, [])
  assert.equal(calls, 1)
})
