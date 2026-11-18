import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const hash = (...parts) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16)

// A field may be a plain string or { text, at }, where `at` ties it to a narration cue.
export const norm = (x) => (x == null ? null : typeof x === 'string' ? { text: x } : x)

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
export const isWide = (ch) => WIDE.test(ch)

// Estimated width in monospace layout: 0.6em per half-width char (the JetBrains Mono advance), 1em per full-width char.
export const textPx = (s, size) => [...String(s)].reduce((n, ch) => n + (isWide(ch) ? size : size * 0.6), 0)

export const round = (n) => Math.round(n * 1000) / 1000
