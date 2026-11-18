// Single entry point for HyperFrames: telemetry is always off and the upload commands (publish, share, cloud) are never used.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT } from './util.mjs'

const HF = path.join(ROOT, 'node_modules/hyperframes/bin/hyperframes.mjs')
const ENV = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1' }

export function hf(args, cwd) {
  const r = spawnSync(process.execPath, [HF, ...args], { cwd, env: ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  return { ok: r.status === 0, out: r.stderr ?? '' }
}
