// The gate between the material skill and the video skill. Uses the material skill's own fixture: a small git repo
// and a library in a temp folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gate, basisProblems, materialFile, workDir, shotFiles } from '../lib/material.mjs'
import { tempDir } from './tmp.mjs'

// The material skill is a sibling folder: skill-material/ in the repo, arch-material/ when installed.
const sibling = ['../../skill-material/tests/fixture.mjs', '../../arch-material/tests/fixture.mjs']
  .map((rel) => new URL(rel, import.meta.url)).find((url) => fs.existsSync(fileURLToPath(url)))
const { fixture, git } = sibling ? await import(sibling.href) : {}
const needs = { skip: sibling ? false : '找不到素材 skill 的測試範本（兩個 skill 要放在同一個資料夾底下）' }

const TODAY = new Date('2026-11-21T00:00:00Z')
const run = (f) => gate(f.file, { today: TODAY })
const has = (list, re) => assert.ok(list.some((s) => re.test(s)), `沒有符合 ${re} 的訊息：\n${list.join('\n')}`)
const board = (...basis) => ({ scenes: basis.map((b, i) => ({ id: `s${i}`, type: 'statement', ...(b === undefined ? {} : { basis: b }) })) })

test('審核過、沒有過期的素材可以用；條目連同狀態都列得出來', needs, async () => {
  const g = await run(fixture())
  assert.deepEqual(g.stops, [])
  assert.equal(g.ok, true)
  assert.equal(g.entries.get('A1.3'), '不明')
  assert.equal(g.entries.get('A1.2'), '有出處')
  assert.ok(g.entries.has('A1') && g.entries.has('S1') && g.entries.has('N1'))
  assert.equal(g.entries.get('bg:hosted-scheduler#B1'), '有出處')
  // The library is shared: an entry this material does not point at is not part of it.
  assert.equal(g.entries.has('bg:hosted-scheduler#B2'), false)
  assert.equal(g.backgrounds.length, 1)
})

test('素材不存在、還沒審核、沒通過檢查，都會停下來', needs, async () => {
  const f = fixture()
  has((await gate(path.join(f.library, 'nope.md'), { today: TODAY })).stops, /沒有這個專案的素材/)
  f.edit('審核：2026-11-20', '審核：還沒')
  const unreviewed = await run(f)
  assert.equal(unreviewed.ok, false)
  has(unreviewed.stops, /還沒有經過 owner 審核/)
  f.edit('審核：還沒', '審核：2026-11-20')
  f.edit('〔有出處〕 `proj:src/fetch.mjs#SOURCES`', '〔有出處〕 `proj:src/fetch.mjs#NO_SUCH_NAME`')
  has((await run(f)).stops, /沒有通過檢查/)
})

test('來源在整理之後變了，素材算過期，停下來', needs, async () => {
  const f = fixture()
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), 'export const MORE = 1\n')
  git(f.repo, 'commit', '-q', '-am', 'more')
  const g = await run(f)
  assert.equal(g.ok, false)
  has(g.stops, /素材過期了/)
})

test('來源有素材沒引用的未 commit 變動：可以用，但會提醒', needs, async () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.repo, 'notes.txt'), 'work in progress\n')
  const g = await run(f)
  assert.equal(g.ok, true)
  has(g.notes, /還沒 commit 的變動不在素材裡/)
})

test('場景的 basis 只能指到素材裡有的條目；原因不明與查不到的背景不能講', needs, async () => {
  const f = fixture()
  f.edit('- `bg:hosted-scheduler#B1` 為什麼排程不準時', '- `bg:hosted-scheduler#B1` 為什麼排程不準時\n- `bg:hosted-scheduler#B2` 延後多久')
  const { entries } = await run(f)
  assert.deepEqual(basisProblems(board(['A1.1', 'A1.2', 'F1'], ['bg:hosted-scheduler#B1'], ['A1', 'S1'], []), entries), { errors: [], warnings: [] })
  const bad = basisProblems(board(['A9.1'], ['A1.3'], ['bg:hosted-scheduler#B2'], 'A1.1', ['bg:other#B1']), entries)
  has(bad.errors, /s0.*「A9\.1」不在素材裡/)
  has(bad.errors, /s1.*「A1\.3」.*〔不明〕/)
  has(bad.errors, /s2.*查不到來源的背景/)
  has(bad.errors, /s3.*要寫成編號的陣列/)
  has(bad.errors, /s4.*「bg:other#B1」不在素材裡/)
})

test('沒寫 basis 的場景會警告；超過一半的場景 basis 是空的也會警告', needs, async () => {
  const { entries } = await run(fixture())
  has(basisProblems(board(['A1.1'], undefined, undefined), entries).warnings, /沒有寫 basis：s1、s2/)
  has(basisProblems(board(['A1.1'], ['F1'], [], [], [], []), entries).warnings, /6 個場景裡有 4 個的 basis 是空的/)
  assert.deepEqual(basisProblems(board(['A1.1'], ['F1'], ['A1.2'], [], [], []), entries).warnings, [])
})

test('meta.material 可以是專案名稱或素材檔的路徑；工作資料夾在素材庫裡', () => {
  assert.equal(materialFile('proj'), path.join(os.homedir(), 'arch-material', 'proj.md'))
  assert.equal(materialFile('../lib/proj.md', '/work/video'), path.resolve('/work/lib/proj.md'))
  assert.equal(materialFile('~/elsewhere/proj.md', '/work'), path.join(os.homedir(), 'elsewhere', 'proj.md'))
  assert.equal(workDir('/lib/proj.md'), path.join('/lib', 'video', 'proj'))
})

test('截圖只能用素材登記過的：basis 裡要有一條主張引用它，檔案要在那個來源裡', () => {
  const dir = tempDir('shots-')
  fs.mkdirSync(path.join(dir, 'screens'))
  fs.writeFileSync(path.join(dir, 'screens', 'a.png'), '')
  const material = { repos: [{ code: 'data', location: dir }], items: [{ id: 'F1', coords: [{ raw: 'data:screens/a.png' }] }, { id: 'F2', coords: [] }] }
  const scene = (image, basis) => ({ id: 'x', type: 'shot', basis, data: { image } })
  const ok = { scenes: [scene('data:screens/a.png', ['F1'])] }
  assert.deepEqual(shotFiles(ok, material), [])
  assert.equal(ok.scenes[0].data.file, path.join(dir, 'screens', 'a.png'))
  assert.match(shotFiles({ scenes: [scene('data:screens/a.png', ['F2'])] }, material).join(), /basis 裡的一條素材主張引用/)
  assert.match(shotFiles({ scenes: [scene('data:screens/b.png', ['F1'])] }, { ...material, items: [{ id: 'F1', coords: [{ raw: 'data:screens/b.png' }] }] }).join(), /找不到截圖/)
  assert.match(shotFiles({ scenes: [scene('screens/a.png', ['F1'])] }, material).join(), /素材的座標/)
  assert.match(shotFiles({ scenes: [scene('data:screens/a.jpg', ['F1'])] }, material).join(), /只收 PNG/)
})
