// Preflight check. Imports nothing from node_modules at load time, so it runs before `npm install`.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT } from './util.mjs'

const version = (cmd) => {
  const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null
}

// level: 'ok' | 'fail' (cannot build) | 'note' (can build, with a limitation)
export async function collect({ env = process.env, checkTts = true } = {}) {
  const rows = []
  const add = (level, name, detail, fix) => rows.push({ level, name, detail, fix })

  const major = Number(process.versions.node.split('.')[0])
  if (major >= 22) add('ok', 'Node.js', `v${process.versions.node}`)
  else add('fail', 'Node.js', `v${process.versions.node}，需要 22 以上`, '安裝 Node.js 22 以上：https://nodejs.org')

  const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies)
  const missing = deps.filter((d) => !fs.existsSync(path.join(ROOT, 'node_modules', d, 'package.json')))
  if (!missing.length) add('ok', '相依套件', `${deps.length} 個都已安裝`)
  else add('fail', '相依套件', `缺 ${missing.length} 個：${missing.join('、')}`, `在 ${ROOT} 執行 npm install`)

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const v = version(tool)
    if (v) add('ok', tool, v.replace(/ Copyright.*/, ''))
    else add('fail', tool, '找不到', '安裝 ffmpeg 並加入 PATH（https://ffmpeg.org/download.html；Ubuntu 可用 sudo apt install ffmpeg）')
  }

  // The content of a video comes from the material skill, which needs git to compare versions.
  const { materialSkill } = await import('./material.mjs')
  if (await materialSkill()) add('ok', 'arch-material', '素材 skill 在旁邊')
  else add('fail', 'arch-material', '找不到素材 skill', '把 arch-material skill 放在 arch-video 旁邊（同一個資料夾底下）；影片的內容一律來自它整理的素材')
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' })
  if (git.status === 0) add('ok', 'git', git.stdout.trim())
  else add('fail', 'git', '找不到', '安裝 git 並加入 PATH；確認素材有沒有過期時要用它比對版本')

  // `hyperframes browser path` downloads Chrome as a side effect, so look at the env var and the cache directory instead.
  const custom = env.HYPERFRAMES_BROWSER_PATH
  const cache = path.join(os.homedir(), '.cache', 'hyperframes', 'chrome')
  if (custom && fs.existsSync(custom)) add('ok', '無頭 Chrome', `使用 HYPERFRAMES_BROWSER_PATH 指定的 ${custom}`)
  else if (custom) add('fail', '無頭 Chrome', `HYPERFRAMES_BROWSER_PATH 指向的檔案不存在：${custom}`, '改成 Chrome 執行檔的正確路徑，或拿掉這個環境變數讓 HyperFrames 自動下載')
  else if (fs.existsSync(cache) && fs.readdirSync(cache).length) add('ok', '無頭 Chrome', '已下載')
  else add('note', '無頭 Chrome', '尚未下載，第一次產片時 HyperFrames 會自動下載', '網路擋下載的話，把環境變數 HYPERFRAMES_BROWSER_PATH 設成已安裝的 Chrome 執行檔路徑')

  // The TTS check needs the npm packages and ffprobe (to measure the clip), so it only runs once those are in place.
  const ready = !missing.length && rows.every((r) => r.name !== 'ffprobe' || r.level === 'ok')
  if (checkTts && ready) {
    const { synth, resetBreaker } = await import('./tts.mjs')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-video-doctor-')) // fresh cache dir so the request really goes out
    resetBreaker()
    const r = await synth('配音連線測試', { voice: 'zh-TW-HsiaoChenNeural', cacheDir: tmp, backoff: [] })
    fs.rmSync(tmp, { recursive: true, force: true })
    resetBreaker()
    if (!r.estimated) add('ok', '配音連線', '連得上 Microsoft Edge 朗讀服務')
    else if (/\b429\b/.test(r.error)) add('note', '配音連線', '連得上，但服務要求放慢（短時間內配了太多句）', '過幾分鐘再配音；渲染時遇到會自動等待再試')
    else add('note', '配音連線', `連不上（${r.error}）。影片仍可產出，但沒有聲音、只有字幕`, '受限的網路請設定環境變數 HTTPS_PROXY，或換一個網路')
  } else if (checkTts) {
    add('note', '配音連線', '上面缺的項目補齊後才能檢查')
  }
  return rows
}

export async function doctor(opts) {
  const rows = await collect(opts)
  const tag = { ok: 'OK  ', fail: '缺  ', note: '注意' }
  console.log('arch-video 體檢\n')
  for (const r of rows) {
    console.log(`  ${tag[r.level]}  ${r.name}：${r.detail}`)
    if (r.level !== 'ok' && r.fix) console.log(`        → ${r.fix}`)
  }
  const fails = rows.filter((r) => r.level === 'fail').length
  const notes = rows.filter((r) => r.level === 'note').length
  console.log(fails ? `\n還缺 ${fails} 項，補齊後再跑一次體檢。` : notes ? `\n可以產片，但有 ${notes} 項要注意。` : '\n可以產片。')
  return fails === 0
}
