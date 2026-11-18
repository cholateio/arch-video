// Phosphor duotone icons (MIT). Each icon is one colour plus a faint fill layer and takes the text colour of its
// container, so theme accents tint it without separate coloured assets. Icon names: https://phosphoricons.com
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
