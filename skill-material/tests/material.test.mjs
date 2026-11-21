// Material check tests. Each test builds a small git repo and a library in a temp folder; nothing leaves the machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseCoord, parseMaterial } from '../lib/material.mjs'
import { check } from '../lib/check.mjs'
import { status, stamp } from '../lib/status.mjs'
import { fingerprint, isCredential } from '../lib/repo.mjs'
import { fixture, git, write, LESSONS, BACKGROUND } from './fixture.mjs'
import { parseShotArgs, fontDirs, pngSize, mobileAgent } from '../lib/shot.mjs'

const TODAY = new Date('2026-11-21T00:00:00Z')
const run = (f) => check(f.file, { today: TODAY })
const has = (list, re) => assert.ok(list.some((s) => re.test(s)), `沒有符合 ${re} 的訊息：\n${list.join('\n')}`)

test('座標的四種寫法', () => {
  assert.deepEqual(parseCoord('ingest:scripts/fetch.ts#SOURCES'), { raw: 'ingest:scripts/fetch.ts#SOURCES', repo: 'ingest', path: 'scripts/fetch.ts', anchor: 'SOURCES', from: null, to: null })
  assert.deepEqual(parseCoord('ingest:docs/a.md:12-20'), { raw: 'ingest:docs/a.md:12-20', repo: 'ingest', path: 'docs/a.md', anchor: null, from: 12, to: 20 })
  assert.equal(parseCoord('ingest:docs/a.md:7').to, 7)
  assert.deepEqual(parseCoord('ingest@0fd8535'), { raw: 'ingest@0fd8535', repo: 'ingest', commit: '0fd8535' })
  assert.deepEqual(parseCoord('bg:hosted-scheduler#B1'), { raw: 'bg:hosted-scheduler#B1', bg: 'hosted-scheduler', entry: 'B1' })
  assert.equal(parseCoord('ingest:docs/小節 有空白.md#為什麼 要有上限').anchor, '為什麼 要有上限')
  const bad = ['scripts/fetch.ts:3', 'ingest:../x', 'ingest:/etc/x', 'workflow_dispatch', 'bg:../../notes#B1', 'bg:a/b#B1', 'ingest:a.md:0', 'ingest:a.md:20-10']
  for (const b of bad) assert.equal(parseCoord(b), null, b)
})

test('存放憑證的檔案認得出來，範本不算', () => {
  for (const p of ['.env', 'app/.env.local', 'deploy/key.pem', 'credentials.json', '.npmrc']) assert.ok(isCredential(p), p)
  for (const p of ['.env.example', 'src/secrets.mjs', 'docs/token.md']) assert.ok(!isCredential(p), p)
})

test('照格式寫的素材檢查通過，原因不明與查不到的背景列成問題', async () => {
  const f = fixture()
  const r = await run(f)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.warnings, [])
  assert.deepEqual(r.counts, { storylines: 1, arcs: 1, claims: 8, coords: 12, backgrounds: 1 })
  assert.deepEqual(r.questions, ['A1.3 原因：為什麼正好是十？'])
  assert.equal(r.arcs[0].question, '為什麼每一輪只翻十則？')
})

test('背景知識查不到的條目被引用時，列進要問 owner 的清單', async () => {
  const f = fixture()
  f.edit('- `bg:hosted-scheduler#B1` 為什麼排程不準時', '- `bg:hosted-scheduler#B1` 為什麼排程不準時\n- `bg:hosted-scheduler#B2` 會延後多久')
  const r = await run(f)
  assert.deepEqual(r.errors, [])
  has(r.questions, /hosted-scheduler#B2（背景，查不到）/)
})

test('主張的狀態與出處寫錯會報錯', async () => {
  const cases = [
    ['- **F1** 來源有兩個。 〔有出處〕 `proj:src/fetch.mjs#SOURCES`', '- **F1** 來源有兩個。', /F1 沒有狀態標記/],
    ['- **F1** 來源有兩個。 〔有出處〕 `proj:src/fetch.mjs#SOURCES`', '- **F1** 來源有兩個。 〔有出處〕', /F1 標了〔有出處〕卻沒有座標/],
    ['  - 推法：10 則乘以 24 輪。\n', '', /A1\.4 標了〔推得〕，下一行要寫怎麼推的/],
    ['〔不明〕', '〔口述〕', /A1\.3 的〔口述〕要帶日期/],
    ['`proj:src/fetch.mjs#SOURCES`', '`proj:src/fetch.mjs#FEEDS`', /找不到「FEEDS」/],
    ['`proj:src/fetch.mjs#SOURCES`', '`proj:src/gone.mjs`', /在素材記錄的版本裡找不到/],
    ['`proj:src/fetch.mjs:1-2`', '`proj:src/fetch.mjs:1-99`', /沒有第 99 行/],
    ['`proj:src/fetch.mjs#SOURCES`', '`site:src/fetch.mjs`', /代號 site 不在版本表裡/],
    ['`proj:src/fetch.mjs#SOURCES`', '`src/fetch.mjs`', /座標「src\/fetch\.mjs」格式不對/],
    ['`proj:src/fetch.mjs#SOURCES`', '`proj:.env`', /指向存放憑證的檔案/],
    ['`proj:src`', '`proj:src#LIMIT`', /是資料夾，不能再指定小節或行號/],
    ['→F1', '→F9', /「→F9」指到的編號不存在/],
    ['- **D1** Fetch', '- **N1** Fetch', /編號 N1 重複了/],
    ['- **A1.2** 選擇：', '- **A1.2** 做法：', /A1 少了「選擇：」開頭的主張/],
    ['- 終點：結果：每一輪最多十則。', '- 終點：每一輪最多十則。', /A1 的終點要以/],
    ['- 故事線：S1', '- 故事線：S4', /A1 的故事線 S4 不存在/],
    ['`bg:hosted-scheduler#B1`', '`bg:hosted-scheduler#B7`', /裡沒有 B7/],
    ['`bg:hosted-scheduler#B1`', '`bg:no-such-topic#B1`', /找不到背景知識 background\/no-such-topic\.md/],
    ['格式版本：1\n', '', /要有一行「格式版本：1」/],
    ['範圍：只講 proj 本身。\n', '', /要有一行「範圍：…」/],
    ['## 排除', '## 其他', /少了「## 排除」這一節/],
    ['#### 物證', '#### 證據', /不認得的小節「證據」/],
    ['審核：2026-11-20\n', '', /要有一行「審核：還沒」/],
    ['審核：2026-11-20', '審核：2026-99-99', /後面只能是「還沒」或一個日期/],
    ['整理日期：2026-11-20', '整理日期：2026-99-99', /「整理日期：」後面要是日期/],
    [' | 2026-11-20 |\n\n| 不在 commit', ' | 昨天 |\n\n| 不在 commit', /來源 proj 的日期「昨天」不是日期/],
    ['〔不明〕', '〔口述 2026-13-40〕', /A1\.3 的〔口述〕要帶日期/],
    ['交給資料表（S1）', '交給資料表', /D1 沒有標明屬於哪一條故事線/],
    ['交給資料表（S1）', '交給資料表（S3）', /D1 標的故事線 S3 不存在/],
  ]
  for (const [from, to, re] of cases) {
    const f = fixture()
    f.edit(from, to)
    has((await run(f)).errors, re)
  }
})

test('素材裡出現疑似機密會報錯，而且不把值印出來', async () => {
  const f = fixture()
  const token = `gh${'p_'}${'A1b2C3d4E5'.repeat(4)}`
  f.edit('- **F1** 來源有兩個。', `- **F1** 來源有兩個，權杖是 ${token}。`)
  const r = await run(f)
  has(r.errors, /疑似機密或個資（GitHub 權杖/)
  assert.ok(!r.errors.join('\n').includes(token))
})

test('沒有物證、故事線沒有弧、不在版控的來源沒記指紋，都會警告', async () => {
  const f = fixture()
  f.edit('- `proj:src/fetch.mjs#LIMIT` 一個常數\n- `proj:docs/LESSONS.md` 一筆教訓紀錄\n', '')
  f.edit('- **S1** 抓來源並翻譯。經過：N1。', '- **S1** 抓來源並翻譯。經過：N1。\n- **S2** 順便找出直播。')
  f.edit('`proj:docs/design.md` | 為什麼要有上限', '`proj:docs/LESSONS.md` | 教訓紀錄')
  f.edit(/\| `proj:docs\/LESSONS\.md` \| [0-9a-f]{12} \|\n/.exec(fs.readFileSync(f.file, 'utf8'))[0], '')
  const r = await run(f)
  assert.deepEqual(r.errors, [])
  has(r.warnings, /A1 沒有物證/)
  has(r.warnings, /故事線 S2 沒有任何一條弧/)
  has(r.warnings, /有 1 個來源不在版控裡.*proj:docs\/LESSONS\.md/)
})

test('背景知識過了保存期限，檢查與狀態都會提醒重新確認', async () => {
  const f = fixture()
  const later = new Date('2027-08-01T00:00:00Z')
  has((await check(f.file, { today: later })).warnings, /B1 是 \d+ 天前查的/)
  const s = status(f.file, { today: later })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.backgrounds.map((b) => `${b.slug}#${b.id}`), ['hosted-scheduler#B1'])
})

test('還沒審核的素材檢查會過，但標明還不能拿去做影片', async () => {
  const f = fixture()
  f.edit('審核：2026-11-20', '審核：還沒')
  const r = await run(f)
  assert.deepEqual(r.errors, [])
  assert.equal(r.reviewed, false)
  has(r.notes, /還沒有經過 owner 審核/)
})

test('來源沒有變，素材是最新的', () => {
  const f = fixture()
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, true)
  assert.equal(s.repos[0].state, 'same')
})

test('來源多了 commit：列出引用到變動檔案的條目，以及素材沒有引用的新檔案', async () => {
  const f = fixture()
  write(path.join(f.repo, 'src/fetch.mjs'), 'export const SOURCES = ["a"]\nexport const LIMIT = 10\n')
  write(path.join(f.repo, 'jobs/streams.mjs'), 'export const CHANNELS = 26\n')
  git(f.repo, 'add', '.')
  git(f.repo, 'commit', '-q', '-m', 'feat: find streams')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  const r = s.repos[0]
  assert.equal(r.state, 'changed')
  assert.equal(r.commits.length, 1)
  assert.deepEqual(r.touched.map((t) => t.path), ['src/fetch.mjs'])
  assert.deepEqual(r.touched[0].where, ['F1', 'A1.2', 'A1.4', 'A1 的物證', 'N1', 'D1', 'M1'])
  assert.deepEqual(r.other.map((t) => `${t.status} ${t.path}`), ['A jobs/streams.mjs'])
  // The check still reads the recorded version, so the material stays valid until it is updated.
  const c = await run(f)
  assert.deepEqual(c.errors, [])
  has(c.notes, /現在的版本.*和素材記錄的.*不同/)
})

test('檔案改名時，引用舊路徑的條目也列得出來', () => {
  const f = fixture()
  git(f.repo, 'mv', 'docs/design.md', 'docs/decisions.md')
  git(f.repo, 'commit', '-q', '-m', 'docs: rename')
  const t = status(f.file, { today: TODAY }).repos[0].touched
  assert.deepEqual(t.map((x) => `${x.status} ${x.from} → ${x.path}`), ['R docs/design.md → docs/decisions.md'])
  assert.deepEqual(t[0].where, ['A1.1', '排除'])
})

test('不在版控的來源內容變了、被引用的檔案有未 commit 的修改，都算過期', () => {
  const f = fixture()
  write(path.join(f.repo, 'docs/LESSONS.md'), `${LESSONS}\n新的一條教訓。\n`)
  let s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.stamps.map((x) => `${x.raw} ${x.state} ${x.where}`), ['proj:docs/LESSONS.md changed A1 的物證'])

  const g = fixture()
  fs.appendFileSync(path.join(g.repo, 'src/fetch.mjs'), '// edited\n')
  s = status(g.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.equal(s.repos[0].dirty[0].path, 'src/fetch.mjs')
  assert.ok(s.repos[0].dirty[0].where.includes('F1'))
})

test('還沒 commit 的修改查證過、記下指紋之後不再算過期；再改一次又會被找出來', async () => {
  const f = fixture()
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), '// work in progress\n')
  has((await run(f)).warnings, /有還沒 commit 的修改：.*proj:src\/fetch\.mjs/)
  const rows = stamp(f.file).text.split('\n').filter((l) => /^\| `proj:src/.test(l))
  assert.deepEqual(rows.map((l) => l.split('`')[1]), ['proj:src', 'proj:src/fetch.mjs'])
  f.edit('| `proj:docs/LESSONS.md` |', `${rows.join('\n')}\n| \`proj:docs/LESSONS.md\` |`)
  assert.deepEqual((await run(f)).warnings, [])
  assert.equal(status(f.file, { today: TODAY }).fresh, true)
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), '// more\n')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.ok(s.stamps.find((x) => x.raw === 'proj:src/fetch.mjs').where.includes('F1'))
  has((await run(f)).warnings, /內容已經和記下指紋時不同/)
})

test('只在一手文件地圖出現的檔案變了，不算有條目受影響', () => {
  const f = fixture()
  f.edit('`proj:docs/design.md#Why a cap`', '`proj:src/fetch.mjs#LIMIT`')
  f.edit('| 自動補抓 | 未實裝 | `proj:docs/design.md` |', '| 自動補抓 | 未實裝 | `proj:src` |')
  fs.appendFileSync(path.join(f.repo, 'docs/design.md'), 'More.\n')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, true)
  assert.equal(s.loose, 1)
})

test('「→」可以指到一條弧', async () => {
  const f = fixture()
  f.edit('- **F1** 來源有兩個。', '- **F1** 來源有兩個（上限見 →A1）。')
  assert.deepEqual((await run(f)).errors, [])
})

test('記錄的 commit 不在現在的歷史上，建議整份重新整理', () => {
  const f = fixture()
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), '// amended\n')
  git(f.repo, 'add', '.')
  git(f.repo, 'commit', '-q', '--amend', '-m', 'rewritten')
  git(f.repo, 'reflog', 'expire', '--expire=now', '--all')
  git(f.repo, 'gc', '-q', '--prune=now')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.equal(s.repos[0].state, 'unknown')
  assert.equal(s.rebuild.length, 1)
})

test('建議整份重來看的是被引用的位置有幾個變了：一個資料夾座標底下改再多檔案也只算一個', () => {
  const f = fixture()
  const names = ['a', 'b', 'c', 'd', 'e', 'f']
  for (const n of names) write(path.join(f.repo, `lib/${n}.mjs`), `export const ${n} = 1\n`)
  git(f.repo, 'add', '.')
  git(f.repo, 'commit', '-q', '-m', 'lib')
  f.edit(`| ${f.commit} |`, `| ${git(f.repo, 'rev-parse', '--short=7', 'HEAD')} |`)
  f.edit('- **F1** 來源有兩個。', '- **F1** 來源有兩個。 〔有出處〕 `proj:src/fetch.mjs#SOURCES`\n- **F2** 共用模組放在同一個資料夾。 〔有出處〕 `proj:lib`\n- **F3** 憑證檔不進版控。')
  f.edit('- **F3** 憑證檔不進版控。 〔有出處〕 `proj:src/fetch.mjs#SOURCES`', '- **F3** 憑證檔不進版控。 〔有出處〕 `proj:.gitignore`')
  for (const n of names) fs.appendFileSync(path.join(f.repo, `lib/${n}.mjs`), '// touched\n')
  git(f.repo, 'commit', '-q', '-am', 'touch lib')
  const one = status(f.file, { today: TODAY })
  assert.equal(one.fresh, false)
  assert.equal(one.repos[0].touched.length, 6)
  assert.deepEqual(one.rebuild, [])
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), '// touched\n')
  fs.appendFileSync(path.join(f.repo, 'docs/design.md'), '\nMore.\n')
  git(f.repo, 'commit', '-q', '-am', 'touch more')
  has(status(f.file, { today: TODAY }).rebuild, /6 個位置裡有 4 個變了/)
})

test('不是 git repo 的來源（包含放在別的 repo 裡的普通資料夾）用指紋比對', async () => {
  const f = fixture()
  const notes = path.join(f.repo, 'notes')
  write(path.join(notes, 'intro.md'), '# Intro\n\n## Why\n\nBecause.\n')
  fs.appendFileSync(path.join(f.repo, '.gitignore'), 'notes/\n')
  git(f.repo, 'commit', '-q', '-am', 'chore: ignore notes')
  f.edit(f.commit, git(f.repo, 'rev-parse', '--short=7', 'HEAD'))
  f.edit('\n| 不在 commit 裡的來源 | 指紋 |', `| notes | ${notes} | 無 | 2026-11-20 |\n\n| 不在 commit 裡的來源 | 指紋 |`)
  f.edit('- **F1** 來源有兩個。', '- **F2** 作者寫過一份介紹。 〔有出處〕 `notes:intro.md#Why`\n- **F1** 來源有兩個。')
  let r = await run(f)
  assert.deepEqual(r.errors, [])
  has(r.warnings, /有 1 個來源不在版控裡.*notes:intro\.md/)
  const table = stamp(f.file).text
  assert.ok(/\| notes \| .* \| 無 \|/.test(table))
  const row = /\| `notes:intro\.md` \| [0-9a-f]{12} \|/.exec(table)[0]
  f.edit('| `proj:docs/LESSONS.md` |', `${row}\n| \`proj:docs/LESSONS.md\` |`)
  r = await run(f)
  assert.deepEqual([r.errors, r.warnings], [[], []])
  assert.equal(status(f.file, { today: TODAY }).fresh, true)
  fs.appendFileSync(path.join(notes, 'intro.md'), 'More.\n')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.stamps.map((x) => `${x.raw} ${x.where}`), ['notes:intro.md F2'])
})

test('stamp 印出現在的 commit 與不在版控來源的指紋', () => {
  const f = fixture()
  const r = stamp(f.file)
  assert.deepEqual(r.missing, [])
  assert.ok(r.text.includes(`| proj | ${f.repo} | ${f.commit} |`))
  assert.ok(r.text.includes(`| \`proj:docs/LESSONS.md\` | ${fingerprint(Buffer.from(LESSONS))} |`))
})

test('來源在整理之後多了 commit 時，stamp 會說出版本要從哪個換成哪個', () => {
  const f = fixture()
  assert.deepEqual(stamp(f.file).moved, [])
  fs.appendFileSync(path.join(f.repo, 'src/fetch.mjs'), 'export const MORE = 1\n')
  git(f.repo, 'commit', '-q', '-am', 'more')
  const head = git(f.repo, 'rev-parse', '--short=7', 'HEAD')
  assert.deepEqual(stamp(f.file).moved, [{ code: 'proj', from: f.commit, to: head }])
})

test('解析不會把表格以外的反引號當成座標', () => {
  const m = parseMaterial('# x\n\n## 現況事實\n- **F1** 由 `workflow_dispatch` 觸發。 〔有出處〕 `a:b.yml#workflow_dispatch`\n')
  assert.deepEqual(m.problems, [])
  assert.deepEqual(m.items[0].coords.map((c) => c.raw), ['a:b.yml#workflow_dispatch'])
  assert.equal(m.items[0].text, '由 `workflow_dispatch` 觸發。')
})

test('背景知識的日期不是真的日期、來源網址帶著機密，都會報錯', async () => {
  const f = fixture()
  const bg = path.join(f.library, 'background/hosted-scheduler.md')
  fs.writeFileSync(bg, BACKGROUND.replace('〔有出處 2026-11-20〕', '〔有出處 2026-02-31〕'))
  has((await run(f)).errors, /B1 沒有查證日期，或日期不是真的日期/)
  assert.equal(status(f.file, { today: TODAY }).fresh, false)
  const hook = `https://hooks.slack${'.com'}/services/T0000000/B0000000/${'abcdEFGH1234'}`
  fs.writeFileSync(bg, BACKGROUND.replace('https://example.com/docs/schedule', hook))
  const r = await run(f)
  has(r.errors, /hosted-scheduler\.md 第 \d+ 行：疑似機密或個資（webhook 網址/)
  assert.ok(!r.errors.join('\n').includes(hook))
})

test('素材引用的背景知識檔案不見了，算過期', () => {
  const f = fixture()
  fs.rmSync(path.join(f.library, 'background/hosted-scheduler.md'))
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.missing, ['background/hosted-scheduler.md'])
})

test('背景知識檔還在、但素材引用的條目不見了，也算過期', () => {
  const f = fixture()
  fs.writeFileSync(path.join(f.library, 'background/hosted-scheduler.md'), BACKGROUND.replace(/- \*\*B1\*\*.*\n/, ''))
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.missing, ['background/hosted-scheduler.md 的 B1'])
})

test('指紋表裡殘留一個其實在版控裡的資料夾，不會蓋掉底下的新檔案', async () => {
  const f = fixture()
  f.edit('| `proj:docs/LESSONS.md` |', '| `proj:src` | 000000000000 |\n| `proj:docs/LESSONS.md` |')
  write(path.join(f.repo, 'src/streams.mjs'), 'export const CHANNELS = 26\n')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.ok(s.repos[0].dirty.some((d) => d.path === 'src/streams.mjs'))
  has((await run(f)).warnings, /內容已經和記下指紋時不同：proj:src/)
})

test('還沒 commit 的變動：素材引用到的算過期，沒引用到的另外列出來', () => {
  const f = fixture()
  write(path.join(f.repo, 'README.md'), '# proj\n')
  let s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, true)
  assert.equal(s.loose, 1)
  assert.deepEqual(s.repos[0].dirty, [{ path: 'README.md', untracked: true, where: [] }])
  // A new file under a folder the material points at may be a new part of what that claim describes.
  write(path.join(f.repo, 'src/streams.mjs'), 'export const CHANNELS = 26\n')
  s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.repos[0].dirty.find((d) => d.path === 'src/streams.mjs').where, ['M1'])
  // A local-only source that carries a fingerprint is compared by content, not listed as a new file.
  assert.ok(!s.repos[0].dirty.some((d) => d.path === 'docs/LESSONS.md'))
})

test('已經 stage 但還沒 commit 的改名，引用舊路徑的條目也找得到', () => {
  const f = fixture()
  git(f.repo, 'mv', 'docs/design.md', 'docs/decisions.md')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  const d = s.repos[0].dirty.find((x) => x.path === 'docs/decisions.md')
  assert.equal(d.from, 'docs/design.md')
  assert.deepEqual(d.where, ['A1.1', '排除'])
})

test('普通資料夾來源裡的資料夾座標也有指紋，底下的檔案變了算過期', async () => {
  const f = fixture()
  const notes = path.join(f.root, 'notes')
  write(path.join(notes, 'talks/a.md'), 'A\n')
  f.edit('\n| 不在 commit 裡的來源 | 指紋 |', `| notes | ${notes} | 無 | 2026-11-20 |\n\n| 不在 commit 裡的來源 | 指紋 |`)
  f.edit('- **F1** 來源有兩個。', '- **F2** 作者講過兩場。 〔有出處〕 `notes:talks`\n- **F1** 來源有兩個。')
  const row = /\| `notes:talks` \| [0-9a-f]{12} \|/.exec(stamp(f.file).text)[0]
  f.edit('| `proj:docs/LESSONS.md` |', `${row}\n| \`proj:docs/LESSONS.md\` |`)
  assert.deepEqual((await run(f)).errors, [])
  assert.equal(status(f.file, { today: TODAY }).fresh, true)
  write(path.join(notes, 'talks/b.md'), 'B\n')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.stamps.map((x) => `${x.raw} ${x.state} ${x.where}`), ['notes:talks changed F2'])
})

test('不在版控的來源沒有記指紋時，status 不會回報最新', () => {
  const f = fixture()
  f.edit(/\| `proj:docs\/LESSONS\.md` \| [0-9a-f]{12} \|\n/.exec(fs.readFileSync(f.file, 'utf8'))[0], '')
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.unstamped, ['proj:docs/LESSONS.md'])
})

test('被引用的資料夾底下多了還沒 commit 的新檔案，check 也會要求記指紋', async () => {
  const f = fixture()
  write(path.join(f.repo, 'src/streams.mjs'), 'export const CHANNELS = 26\n')
  has((await run(f)).warnings, /有還沒 commit 的修改：proj:src。/)
  const row = /\| `proj:src` \| [0-9a-f]{12} \|/.exec(stamp(f.file).text)[0]
  f.edit('| `proj:docs/LESSONS.md` |', `${row}\n| \`proj:docs/LESSONS.md\` |`)
  assert.deepEqual((await run(f)).warnings, [])
  assert.equal(status(f.file, { today: TODAY }).fresh, true)
})

test('被引用的檔案改名搬到別處：記下指紋後不再算過期，新位置列為提醒', async () => {
  const f = fixture()
  fs.mkdirSync(path.join(f.repo, 'jobs'))
  git(f.repo, 'mv', 'src/fetch.mjs', 'jobs/fetch.mjs')
  assert.equal(status(f.file, { today: TODAY }).fresh, false)
  const rows = stamp(f.file).text.split('\n').filter((l) => /^\| `proj:src/.test(l))
  assert.equal(rows.length, 2)
  assert.ok(/^\| `proj:src\/fetch\.mjs` \| 無 \|$/.test(rows[1]), rows[1])
  f.edit('| `proj:docs/LESSONS.md` |', `${rows.join('\n')}\n| \`proj:docs/LESSONS.md\` |`)
  assert.deepEqual((await run(f)).warnings, [])
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, true)
  assert.deepEqual(s.repos[0].dirty, [{ path: 'jobs/fetch.mjs', untracked: false, from: 'src/fetch.mjs', where: [] }])
})

test('符號連結不會被跟過去：座標指到它會報錯，資料夾裡的連結改了方向指紋會變', async () => {
  const f = fixture()
  const notes = path.join(f.root, 'notes')
  const outside = path.join(f.root, 'outside.md')
  write(outside, '# Outside\n')
  write(path.join(notes, 'talks/a.md'), 'A\n')
  fs.symlinkSync(outside, path.join(notes, 'talks/link.md'))
  f.edit('\n| 不在 commit 裡的來源 | 指紋 |', `| notes | ${notes} | 無 | 2026-11-20 |\n\n| 不在 commit 裡的來源 | 指紋 |`)
  f.edit('- **F1** 來源有兩個。', '- **F2** 作者講過兩場。 〔有出處〕 `notes:talks`\n- **F1** 來源有兩個。')
  const row = /\| `notes:talks` \| [0-9a-f]{12} \|/.exec(stamp(f.file).text)[0]
  f.edit('| `proj:docs/LESSONS.md` |', `${row}\n| \`proj:docs/LESSONS.md\` |`)
  assert.equal(status(f.file, { today: TODAY }).fresh, true)
  // Same content behind the link, different target: the fingerprint follows where the link points.
  const other = path.join(f.root, 'other.md')
  write(other, '# Outside\n')
  fs.rmSync(path.join(notes, 'talks/link.md'))
  fs.symlinkSync(other, path.join(notes, 'talks/link.md'))
  assert.equal(status(f.file, { today: TODAY }).fresh, false)
  f.edit('〔有出處〕 `notes:talks`', '〔有出處〕 `notes:talks/link.md`')
  has((await run(f)).errors, /是符號連結，不會被讀取/)
})

test('被引用、不在版控、也沒記指紋的來源後來不見了，status 會說出來', () => {
  const f = fixture()
  f.edit(/\| `proj:docs\/LESSONS\.md` \| [0-9a-f]{12} \|\n/.exec(fs.readFileSync(f.file, 'utf8'))[0], '')
  fs.rmSync(path.join(f.repo, 'docs/LESSONS.md'))
  const s = status(f.file, { today: TODAY })
  assert.equal(s.fresh, false)
  assert.deepEqual(s.missing, ['proj:docs/LESSONS.md'])
  assert.ok(!stamp(f.file).text.includes('LESSONS'))
})

test('已經 commit 的符號連結、以及路徑中間經過連結的檔案，都不會被讀取', async () => {
  const f = fixture()
  fs.symlinkSync('design.md', path.join(f.repo, 'docs/alias.md'))
  git(f.repo, 'add', 'docs/alias.md')
  git(f.repo, 'commit', '-q', '-m', 'docs: alias')
  f.edit(f.commit, git(f.repo, 'rev-parse', '--short=7', 'HEAD'))
  f.edit('`proj:docs/design.md#Why a cap`', '`proj:docs/alias.md#Why a cap`')
  has((await run(f)).errors, /proj:docs\/alias\.md#Why a cap」是符號連結/)

  const g = fixture()
  const notes = path.join(g.root, 'notes')
  write(path.join(notes, 'real/a.md'), 'A\n')
  fs.symlinkSync('real', path.join(notes, 'shortcut'))
  g.edit('\n| 不在 commit 裡的來源 | 指紋 |', `| notes | ${notes} | 無 | 2026-11-20 |\n\n| 不在 commit 裡的來源 | 指紋 |`)
  g.edit('- **F1** 來源有兩個。', '- **F2** 作者講過一場。 〔有出處〕 `notes:shortcut/a.md`\n- **F1** 來源有兩個。')
  has((await run(g)).errors, /notes:shortcut\/a\.md」是符號連結/)
})

test('截圖指令：選項照寫的順序變成步驟；網址、輸出檔與數值寫錯會報錯', () => {
  const o = parseShotArgs(['https://example.com/?v=reader', 'out/a.png', '--size', '390x844', '--scale', '2', '--click', '.menu', '--pause', '500', '--hide', 'header', '--element', '#post'])
  assert.deepEqual([o.width, o.height, o.scale, o.element], [390, 844, 2, '#post'])
  assert.deepEqual(o.steps, [{ click: '.menu' }, { pause: 500 }, { hide: 'header' }])
  assert.throws(() => parseShotArgs(['example.com', 'a.png']), /http/)
  assert.throws(() => parseShotArgs(['https://example.com', 'a.jpg']), /\.png/)
  assert.throws(() => parseShotArgs(['https://example.com', 'a.png', '--size', '390']), /寬/)
  assert.throws(() => parseShotArgs(['https://example.com', 'a.png', '--click']), /要接值/)
  assert.throws(() => parseShotArgs(['https://example.com', 'a.png', '--nope']), /不認得/)
})

test('截圖指令：Linux 才補字型資料夾，WSL 加上 Windows 的字型；PNG 的尺寸從檔頭讀', () => {
  const has = (...ok) => (p) => ok.includes(p)
  assert.deepEqual(fontDirs({}, 'win32', has('/mnt/c/Windows/Fonts')), [])
  assert.deepEqual(fontDirs({ ARCH_MATERIAL_FONT_DIRS: '/a' + path.delimiter + '/b' }, 'linux', has('/a', '/mnt/c/Windows/Fonts')), ['/a', '/mnt/c/Windows/Fonts'])
  const head = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(head, 0); head.write('IHDR', 12, 'ascii'); head.writeUInt32BE(780, 16); head.writeUInt32BE(1688, 20)
  assert.deepEqual(pngSize(head), { width: 780, height: 1688 })
  assert.equal(pngSize(Buffer.from('not a png at all, really not')), null)
})

test('截圖指令：手機版換成手機的 User-Agent，保留 Chrome 的版本', () => {
  const ua = mobileAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/158.0.0.0 Safari/537.36')
  assert.equal(ua, 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36')
})
