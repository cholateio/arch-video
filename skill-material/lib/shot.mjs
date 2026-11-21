// Screenshots of a running app, for the material's examples. Drives the headless Chrome that HyperFrames already
// downloaded, over the DevTools protocol with Node's own WebSocket: no extra packages.
// A fresh profile every time, so nothing is ever logged in: only what any visitor can see gets captured.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

// The site decides between its phone and desktop layouts by width; below this the viewport also reports touch.
const MOBILE_BELOW = 820
const STEP_SETTLE_MS = 1500
const START_TIMEOUT_MS = 20000
const LOAD_TIMEOUT_MS = 45000

export function findChrome(env = process.env, home = os.homedir()) {
  if (env.HYPERFRAMES_BROWSER_PATH) return fs.existsSync(env.HYPERFRAMES_BROWSER_PATH) ? env.HYPERFRAMES_BROWSER_PATH : null
  const root = path.join(home, '.cache', 'hyperframes', 'chrome')
  if (!fs.existsSync(root)) return null
  const names = new Set(['chrome-headless-shell', 'chrome-headless-shell.exe', 'chrome', 'chrome.exe'])
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isFile() && names.has(e.name)) return full
      if (e.isDirectory() && depth < 4) { const hit = walk(full, depth + 1); if (hit) return hit }
    }
    return null
  }
  return walk(root, 0)
}

// argv after `shot <url> <out>`. Steps keep their order: they are played back one after another.
export function parseShotArgs(argv) {
  const o = { width: 1440, height: 900, scale: 1, wait: 4000, steps: [], element: null }
  const val = (i, flag) => {
    if (argv[i + 1] == null || argv[i + 1].startsWith('--')) throw new Error(`${flag} 後面要接值`)
    return argv[i + 1]
  }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--size') {
      const m = /^(\d+)x(\d+)$/.exec(val(i, a))
      if (!m) throw new Error('--size 要寫成 <寬>x<高>，例如 390x844')
      o.width = Number(m[1]); o.height = Number(m[2]); i++
    } else if (a === '--scale') { o.scale = Number(val(i, a)); i++; if (!(o.scale > 0 && o.scale <= 4)) throw new Error('--scale 要在 0 到 4 之間') }
    else if (a === '--wait') { o.wait = Number(val(i, a)); i++; if (!(o.wait >= 0)) throw new Error('--wait 要是毫秒數') }
    else if (a === '--click') { o.steps.push({ click: val(i, a) }); i++ }
    else if (a === '--scroll') { o.steps.push({ scroll: val(i, a) }); i++ }
    else if (a === '--hide') { o.steps.push({ hide: val(i, a) }); i++ }
    else if (a === '--pause') { const ms = Number(val(i, a)); i++; if (!(ms >= 0)) throw new Error('--pause 要是毫秒數'); o.steps.push({ pause: ms }) }
    else if (a === '--element') { o.element = val(i, a); i++ }
    else if (a.startsWith('--')) throw new Error(`不認得的選項：${a}`)
    else pos.push(a)
  }
  const [url, out] = pos
  if (!url || !out || pos.length > 2) throw new Error('用法：arch-material shot <網址> <輸出.png> [選項]')
  if (!/^https?:\/\//.test(url)) throw new Error(`網址要以 http:// 或 https:// 開頭：${url}`)
  if (!out.endsWith('.png')) throw new Error('輸出檔要是 .png')
  return { url, out, ...o }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Linux images often lack colour emoji and rarer scripts, and pages then show empty boxes. Extra font folders come from
// ARCH_MATERIAL_FONT_DIRS; under WSL the Windows fonts are added too. Fonts are only used to draw, never copied anywhere.
export function fontDirs(env = process.env, platform = process.platform, exists = fs.existsSync) {
  if (platform !== 'linux') return []
  const dirs = (env.ARCH_MATERIAL_FONT_DIRS ?? '').split(path.delimiter).filter(Boolean)
  if (exists('/mnt/c/Windows/Fonts')) dirs.push('/mnt/c/Windows/Fonts')
  return dirs.filter((d) => exists(d))
}

function fontEnv(profile) {
  const dirs = fontDirs()
  if (!dirs.length) return process.env
  const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const conf = path.join(profile, 'fonts.conf')
  fs.writeFileSync(conf, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n${dirs.map((d) => `  <dir>${xml(d)}</dir>`).join('\n')}\n</fontconfig>\n`)
  return { ...process.env, FONTCONFIG_FILE: conf }
}

function launch(chrome, profile) {
  const proc = spawn(chrome, ['--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], env: fontEnv(profile) })
  return new Promise((resolve, reject) => {
    let err = ''
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`Chrome 在 ${START_TIMEOUT_MS / 1000} 秒內沒有啟動：${err.slice(-300)}`)) }, START_TIMEOUT_MS)
    proc.stderr.on('data', (d) => {
      err += d
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
      if (m) { clearTimeout(timer); resolve({ proc, ws: m[1] }) }
    })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome 結束了（${code}）：${err.slice(-300)}`)) })
  })
}

function connect(url) {
  const ws = new WebSocket(url)
  let seq = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result)
    } else if (msg.method) for (const l of listeners) l(msg)
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const once = (method, sessionId, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等不到 ${method}（${ms / 1000} 秒）`)), ms)
    const l = (msg) => {
      if (msg.method !== method || msg.sessionId !== sessionId) return
      clearTimeout(timer)
      listeners.splice(listeners.indexOf(l), 1)
      resolve(msg.params)
    }
    listeners.push(l)
  })
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ send, once, close: () => ws.close() })
    ws.onerror = () => reject(new Error('連不上 Chrome 的除錯介面'))
  })
}

// Returns { file, width, height } of the written PNG, in image pixels.
export async function shoot(o, { chrome = findChrome(), log = () => {} } = {}) {
  if (!chrome) throw new Error('找不到無頭 Chrome。先跑一次 arch-video 的 doctor 或產一次片（HyperFrames 會下載），或把環境變數 HYPERFRAMES_BROWSER_PATH 設成 Chrome 的執行檔')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-material-shot-'))
  let proc
  let cdp
  try {
    const started = await launch(chrome, profile)
    proc = started.proc
    cdp = await connect(started.ws)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const mobile = o.width < MOBILE_BELOW
    await cdp.send('Page.enable', {}, s)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: o.scale, mobile }, s)
    if (mobile) {
      // Sites that pick their phone layout from the user agent would otherwise still serve the desktop page.
      const { userAgent } = await cdp.send('Browser.getVersion')
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: mobileAgent(userAgent) }, s)
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, s)
    }
    const loaded = cdp.once('Page.loadEventFired', s, LOAD_TIMEOUT_MS)
    log(`開啟 ${o.url}（${o.width}x${o.height}${mobile ? '，手機版' : ''}）`)
    await cdp.send('Page.navigate', { url: o.url }, s)
    await loaded
    await sleep(o.wait)
    const run = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s)
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`
    for (const step of o.steps) {
      if (step.pause != null) { await sleep(step.pause); continue }
      if (step.hide) {
        // Sticky headers and floating buttons would otherwise sit on top of the element being captured.
        const n = await run(`(() => { const all = document.querySelectorAll(${JSON.stringify(step.hide)}); all.forEach((el) => { el.style.visibility = 'hidden' }); return all.length })()`)
        if (!n) throw new Error(`頁面上找不到「${step.hide}」`)
        log(`隱藏 ${step.hide}（${n} 個）`)
        continue
      }
      const sel = step.click ?? step.scroll
      const found = await run(`(() => { const el = ${q(sel)}; if (!el) return false; el.scrollIntoView({ block: 'center' }); ${step.click ? 'el.click();' : ''} return true })()`)
      if (!found) throw new Error(`頁面上找不到「${sel}」`)
      log(`${step.click ? '點' : '捲到'} ${sel}`)
      await sleep(STEP_SETTLE_MS)
    }
    let clip
    if (o.element) {
      const box = await run(`(() => { const el = ${q(o.element)}; if (!el) return null; el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
      if (!box || !box.width || !box.height) throw new Error(`頁面上找不到「${o.element}」，或它沒有大小`)
      await sleep(500)
      clip = { ...box, scale: 1 }
    }
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) }, s)
    const buf = Buffer.from(shot.data, 'base64')
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true })
    fs.writeFileSync(o.out, buf)
    return { file: o.out, ...pngSize(buf) }
  } finally {
    cdp?.close()
    proc?.kill()
    await sleep(300)
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

// The browser's own agent string turned into an Android phone's, keeping the real Chrome version.
export const mobileAgent = (ua) => ua.replace(/\([^)]*\)/, '(Linux; Android 10; K)').replace('HeadlessChrome/', 'Chrome/').replace(/ Safari\//, ' Mobile Safari/')

export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
