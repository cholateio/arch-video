// 圖示：Phosphor 的 duotone 版本（MIT）。圖示是單色加一層淡色填滿，顏色跟著所在元素的文字顏色，
// 所以用主題的強調色就能上色，不必另外準備彩色圖檔。圖示名稱見 https://phosphoricons.com
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './util.mjs'

const DIR = path.join(ROOT, 'node_modules/@phosphor-icons/core/assets/duotone')

export function icon(name) {
  const file = path.join(DIR, `${name}-duotone.svg`)
  if (!fs.existsSync(file)) {
    const all = fs.readdirSync(DIR).map((f) => f.replace(/-duotone\.svg$/, ''))
    const near = all.filter((n) => name.split('-').some((part) => part.length > 2 && n.includes(part))).slice(0, 8)
    throw new Error(`沒有「${name}」這個圖示${near.length ? `（相近的有：${near.join('、')}）` : ''}`)
  }
  return fs.readFileSync(file, 'utf8').trim()
}
