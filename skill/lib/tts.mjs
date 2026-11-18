// 配音層：一句旁白 → 一個音檔 + 秒數 + 字詞時間戳。以「音色＋語速＋文字」為鍵快取。
// 目前只有 edge-tts 一個實作；連不上時退回估算時間（沒有聲音，影片仍可產出）。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { EdgeTTS } from 'node-edge-tts'
import { hash, isWide } from './util.mjs'

const probe = (file) =>
  parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

// 連不上配音服務時的估算：全形字每字 0.23 秒、英文詞每詞 0.34 秒、標點停頓 0.28 秒
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

// edge-tts：把一句話合成到 mp3，回傳字詞時間戳
async function edge(text, { voice, rate, proxy }, mp3) {
  const tts = new EdgeTTS({ voice, lang: voice.split('-').slice(0, 2).join('-'), rate, saveSubtitles: true, timeout: 15000, proxy })
  await tts.ttsPromise(text, mp3)
  const words = JSON.parse(fs.readFileSync(`${mp3}.json`, 'utf8'))
  fs.rmSync(`${mp3}.json`)
  return words
}

// 熔斷：配音服務連不上時，每一句都要等逾時才會失敗。連續 BREAK_AFTER 句失敗就視為服務不通，
// 這次執行剩下的句子直接改用估算時間，不再逐句等待。
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
