import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const hash = (...parts) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16)

// 欄位可以寫成字串，或寫成 { text, at } 來指定它跟著哪個旁白詞出現
export const norm = (x) => (x == null ? null : typeof x === 'string' ? { text: x } : x)

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
export const isWide = (ch) => WIDE.test(ch)

// 等寬字排版的估算寬度：半形字 0.6em（JetBrains Mono 的字寬），全形字 1em
export const textPx = (s, size) => [...String(s)].reduce((n, ch) => n + (isWide(ch) ? size : size * 0.6), 0)

export const round = (n) => Math.round(n * 1000) / 1000
