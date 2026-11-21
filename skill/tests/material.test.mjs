// The gate between the material skill and the video skill. Uses the material skill's own fixture: a small git repo
// and a library in a temp folder.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gate, basisProblems, materialFile, workDir, shotFiles, lockFile } from '../lib/material.mjs'
import { materialChanges } from '../lib/build.mjs'
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

test('素材更新後，影片用到、內容變了的條目：預覽警告，渲染停下，使用者放行後才記成新版本', needs, async () => {
  const f = fixture()
  const work = tempDir('lock-')
  const boardPath = path.join(work, 'storyboard.json')
  const lock = lockFile(boardPath)
  const b = board(['A1.2'], ['A1'], ['bg:hosted-scheduler#B1'])
  const changes = async (opts) => {
    const warnings = []
    materialChanges(b, boardPath, (await run(f)).texts, { warn: (w) => warnings.push(w), ...opts })()
    return warnings
  }
  assert.deepEqual(await changes({ stillsOnly: true }), [])
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(lock, 'utf8')).entries).sort(), ['A1', 'A1.2', 'bg:hosted-scheduler#B1'])

  // A moved coordinate or a re-checked background date is not a change of what the entry says.
  f.edit('〔有出處〕 `proj:src/fetch.mjs#LIMIT`', '〔有出處〕 `proj:src/fetch.mjs:1-2`')
  fs.writeFileSync(path.join(f.library, 'background/hosted-scheduler.md'), fs.readFileSync(path.join(f.library, 'background/hosted-scheduler.md'), 'utf8').replace('〔有出處 2026-11-20〕', '〔有出處 2026-11-21〕'))
  assert.deepEqual(await changes({}), [])

  f.edit('每一輪最多十則（來源數見 →F1）', '每一輪最多二十則（來源數見 →F1）')
  const before = fs.readFileSync(lock, 'utf8')
  const warned = await changes({ stillsOnly: true })
  has(warned, /影片用到的 2 條內容變了/)
  has(warned, /A1\.2（場景 s0）：「〔有出處〕選擇：每一輪最多十則.*」→「〔有出處〕選擇：每一輪最多二十則/)
  has(warned, /A1（場景 s1）：弧的內容改了\n\s+－ - \*\*A1\.2\*\* 〔有出處〕選擇：每一輪最多十則[^\n]*\n\s+＋ - \*\*A1\.2\*\* 〔有出處〕選擇：每一輪最多二十則/)
  assert.equal(fs.readFileSync(lock, 'utf8'), before)
  await assert.rejects(changes({}), /內容變了，已停止/)

  // Dropping the id from the basis and adding it back does not make the change go away.
  materialChanges(board(['F1']), boardPath, (await run(f)).texts, { stillsOnly: true, warn: () => {} })()
  await assert.rejects(changes({}), /A1\.2/)

  assert.deepEqual(await changes({ stillsOnly: true, accept: true }), [])
  assert.deepEqual(await changes({}), [])
  assert.ok(JSON.parse(fs.readFileSync(lock, 'utf8')).entries.F1, '後來加進 basis 的條目也記下來')
})

test('只改了〔推得〕的推法，或弧裡沒有編號的段落，也算內容變了', needs, async () => {
  const f = fixture()
  const boardPath = path.join(tempDir('lock-'), 'storyboard.json')
  const b = board(['A1.4'], ['A1'])
  const changes = async (opts) => materialChanges(b, boardPath, (await run(f)).texts, { warn: () => {}, ...opts })()
  await changes({ stillsOnly: true })
  f.edit('- 推法：10 則乘以 24 輪。', '- 推法：10 則乘以 24 輪，再扣掉維護時段。')
  await assert.rejects(changes({}), /A1\.4（場景 s0）：.*推法：10 則乘以 24 輪。）」→.*再扣掉維護時段/)
  await changes({ stillsOnly: true, accept: true })
  await changes({})
  f.edit('`proj:src/fetch.mjs#LIMIT` 一個常數', '`proj:src/fetch.mjs#LIMIT` 兩個常數')
  await assert.rejects(changes({}), /影片用到的 1 條內容變了[\s\S]*A1（場景 s1）：弧的內容改了\n\s+－ - `…` 一個常數\n\s+＋ - `…` 兩個常數/)
  await changes({ stillsOnly: true, accept: true })
  // A code literal that is not a coordinate of this material is wording, not a place.
  f.edit('兩個常數', '兩個常數 `MAX_PER_RUN`')
  await changes({ stillsOnly: true, accept: true })
  f.edit('`MAX_PER_RUN`', '`MAX_PER_TICK`')
  await assert.rejects(changes({}), /＋ - `…` 兩個常數 `MAX_PER_TICK`/)
  await changes({ stillsOnly: true, accept: true })
  // Swapping two lines changes the story without adding or removing a line.
  f.edit('- **A1.1** 所求：花費不能失控。 〔有出處〕 `proj:docs/design.md#Why a cap`\n- **A1.2**', '- **A1.2**')
  f.edit('- **A1.3**', '- **A1.1** 所求：花費不能失控。 〔有出處〕 `proj:docs/design.md#Why a cap`\n- **A1.3**')
  await assert.rejects(changes({}), /只有順序改了，新的順序：\n\s+1\. - 故事線：S1[\s\S]*5\. - \*\*A1\.2\*\*[\s\S]*6\. - \*\*A1\.1\*\*/)
})

test('口述的日期換了算變動；背景知識重新查證的日期不算', needs, async () => {
  const f = fixture()
  const boardPath = path.join(tempDir('lock-'), 'storyboard.json')
  f.edit('所求：花費不能失控。 〔有出處〕 `proj:docs/design.md#Why a cap`', '所求：花費不能失控。 〔口述 2026-11-20〕')
  const check = async (opts) => materialChanges(board(['A1.1'], ['bg:hosted-scheduler#B1']), boardPath, (await run(f)).texts, { warn: () => {}, ...opts })()
  await check({ stillsOnly: true })
  f.edit('〔口述 2026-11-20〕', '〔口述 2026-11-21〕')
  await assert.rejects(check({}), /A1\.1（場景 s0）：「〔口述 2026-11-20〕所求/)
})

test('長的條目改在句尾，也看得到改了什麼', needs, async () => {
  const f = fixture()
  const boardPath = path.join(tempDir('lock-'), 'storyboard.json')
  const long = '所求：花費不能失控，'.repeat(8)
  f.edit('所求：花費不能失控。', `${long}甲。`)
  const changes = async (opts) => materialChanges(board(['A1.1']), boardPath, (await run(f)).texts, { warn: () => {}, ...opts })()
  await changes({ stillsOnly: true })
  f.edit(`${long}甲。`, `${long}乙。`)
  await assert.rejects(changes({}), /甲。」→「[^」]*乙。」/)
})

test('主張的文字裡像座標的字詞照樣比對；接受新版本的預覽失敗時，記錄不會改', needs, async () => {
  const f = fixture()
  const boardPath = path.join(tempDir('lock-'), 'storyboard.json')
  const check = async (opts) => materialChanges(board(['A1.4'], ['A1']), boardPath, (await run(f)).texts, { warn: () => {}, ...opts })
  // The coordinates after the status mark are places; moving them is not a change.
  ;(await check({ stillsOnly: true }))()
  f.edit('影響：一天最多 240 則。 〔推得〕 `proj:src/fetch.mjs#LIMIT`', '影響：一天最多 240 則。 〔推得〕 `proj:src/fetch.mjs:1-2`')
  ;(await check({}))()
  // Before the status mark it is wording, even when it looks like a coordinate.
  f.edit('影響：一天最多 240 則。', '影響：一天最多 240 則（`proj:old`）。')
  ;(await check({ stillsOnly: true, accept: true }))()
  f.edit('`proj:old`', '`proj:new`')
  await assert.rejects(check({}), /A1\.4（場景 s0）[\s\S]*A1（場景 s1）[\s\S]*proj:new/)
  ;(await check({ stillsOnly: true, accept: true }))()

  f.edit('10 則乘以 24 輪', '10 則乘以 12 輪')
  const before = fs.readFileSync(lockFile(boardPath), 'utf8')
  await check({ stillsOnly: true, accept: true }) // the build fails afterwards, so the returned save is never called
  assert.equal(fs.readFileSync(lockFile(boardPath), 'utf8'), before)
  await assert.rejects(check({}), /A1\.4/)
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
