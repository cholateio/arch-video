// TTS layer: one narration line -> one audio file, its duration and word timestamps. Cached by voice + rate + text.
// edge-tts is the only engine for now; when it is unreachable a line falls back to an estimated duration (no audio, the video still builds).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { EdgeTTS } from 'node-edge-tts'
import { hash, isWide } from './util.mjs'

const probe = (file) =>
  parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

// Fallback estimate: 0.23s per full-width char, 0.34s per Latin word, 0.28s pause per punctuation mark.
function estimate(text) {
  const tokens = text.match(/[A-Za-z0-9_.\-/]+|[^\sA-Za-z0-9_.\-/]/g) ?? []
  const words = []
  let t = 80
  for (const tok of tokens) {
    const d = /[A-Za-z0-9]/.test(tok) ? 340 : isWide(tok) && !/[，。、；：？！「」『』（）]/.test(tok) ? 230 : 280
    if (d !== 280) words.push({ part: tok, start: t, end: t + d })
    t += d
  }
  return { duration: t / 1000 + 0.1, words }
}

// edge-tts: synthesise one line to mp3 and return its word timestamps.
async function edge(text, { voice, rate, proxy }, mp3) {
  const tts = new EdgeTTS({ voice, lang: voice.split('-').slice(0, 2).join('-'), rate, saveSubtitles: true, timeout: 15000, proxy })
  await tts.ttsPromise(text, mp3)
  const words = JSON.parse(fs.readFileSync(`${mp3}.json`, 'utf8'))
  fs.rmSync(`${mp3}.json`)
  return words
}

// Circuit breaker: when the service is unreachable, every line only fails after a timeout. After BREAK_AFTER
// consecutive failed lines the service is treated as down and the rest of this run goes straight to the estimate.
const ATTEMPTS = 2
const BREAK_AFTER = 2
let failedInARow = 0
export const resetBreaker = () => { failedInARow = 0 }

export async function synth(text, { voice, rate = 'default', cacheDir, engine = edge, measure = probe }) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const key = hash(voice, rate, text)
  const mp3 = path.join(cacheDir, `${key}.mp3`)
  const meta = path.join(cacheDir, `${key}.json`)
  if (fs.existsSync(mp3) && fs.existsSync(meta)) return { ...JSON.parse(fs.readFileSync(meta, 'utf8')), file: mp3, cached: true }
  if (failedInARow >= BREAK_AFTER) return { ...estimate(text), estimated: true, file: null, error: '配音服務連不上，已略過' }

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || undefined
  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const words = await engine(text, { voice, rate, proxy }, mp3)
      const out = { duration: measure(mp3), words, estimated: false }
      fs.writeFileSync(meta, JSON.stringify(out))
      failedInARow = 0
      return { ...out, file: mp3, cached: false }
    } catch (e) {
      lastError = e
      fs.rmSync(mp3, { force: true })
      fs.rmSync(`${mp3}.json`, { force: true })
    }
  }
  failedInARow++
  return { ...estimate(text), estimated: true, file: null, error: String(lastError?.message ?? lastError) }
}
