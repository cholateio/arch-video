// Every temporary folder a test file makes lives under one root, removed when that test process exits,
// so test runs leave nothing behind in the system temp folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let root = null
export function tempDir(prefix) {
  if (!root) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-test-'))
    process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }))
  }
  return fs.mkdtempSync(path.join(root, prefix))
}
