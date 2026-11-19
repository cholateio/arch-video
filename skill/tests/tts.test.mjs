// TTS layer tests with a fake synthesiser; no network.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { synth, resetBreaker } from '../lib/tts.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arch-video-tts-'))

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
