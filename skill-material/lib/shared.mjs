// The sensitive-content scanner lives in the video skill. The two skills sit side by side, either in the repo
// (skill/ next to skill-material/) or installed (arch-video/ next to arch-material/).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function loadScanner() {
  for (const rel of ['../../skill/lib/secrets.mjs', '../../arch-video/lib/secrets.mjs']) {
    const url = new URL(rel, import.meta.url)
    if (fs.existsSync(fileURLToPath(url))) return (await import(url.href)).scanText
  }
  return null
}
