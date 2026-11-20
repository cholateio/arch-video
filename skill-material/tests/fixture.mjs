// A small git repo plus a material library in a temp folder. Shared with the video skill's tests, which need a
// material file that passes the check.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fingerprint } from '../lib/repo.mjs'

export const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=noreply@example.com', ...args], { encoding: 'utf8' }).trim()
export const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }

export const LESSONS = '# Lessons\n\n翻譯連續十二天沒有成功，執行紀錄卻全部是綠的。\n'
export const BACKGROUND = `# 代管的排程服務

用過的專案：proj

- **B1** 排程在負載高的時候會延後執行。 〔有出處 2026-11-20〕 <https://example.com/docs/schedule>
- **B2** 延後多久沒有公開的數字。 〔查不到 2026-11-20〕
`

export function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-material-'))
  const repo = path.join(root, 'proj')
  const library = path.join(root, 'library')
  write(path.join(repo, 'src/fetch.mjs'), 'export const SOURCES = ["a", "b"]\n// One run never sends more than this.\nexport const LIMIT = 10\n')
  write(path.join(repo, 'docs/design.md'), '# Design\n\n## Why a cap\n\nSpending must stay bounded.\n')
  write(path.join(repo, '.env'), 'PLACEHOLDER=1\n')
  write(path.join(repo, '.gitignore'), '.env\ndocs/LESSONS.md\n')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
  write(path.join(repo, 'docs/LESSONS.md'), LESSONS)
  write(path.join(library, 'background/hosted-scheduler.md'), BACKGROUND)
  fs.chmodSync(library, 0o700)
  const commit = git(repo, 'rev-parse', '--short=7', 'HEAD')
  const file = path.join(library, 'proj.md')
  const text = `# 素材：proj

## 總覽

格式版本：1
整理日期：2026-11-20
審核：2026-11-20
範圍：只講 proj 本身。

### 主旨
proj 每小時抓一次來源，翻譯後存起來。最重要的主張是每一輪的花費有上限。

### 整理時的版本
| 代號 | 位置 | commit | 日期 |
|---|---|---|---|
| proj | ${repo} | ${commit} | 2026-11-20 |

| 不在 commit 裡的來源 | 指紋 |
|---|---|
| \`proj:docs/LESSONS.md\` | ${fingerprint(Buffer.from(LESSONS))} |

### 故事線
- **S1** 抓來源並翻譯。經過：N1。

### 一手文件地圖
| 文件 | 講什麼 | 讀了多少 |
|---|---|---|
| \`proj:docs/design.md\` | 為什麼要有上限 | 全部讀完 |

## 現況事實
- **F1** 來源有兩個。 〔有出處〕 \`proj:src/fetch.mjs#SOURCES\`

## 因果弧

### A1 為什麼每一輪只翻十則？
- 故事線：S1
- 起點：一次送太多會讓花費失控。
- 終點：結果：每一輪最多十則。

#### 主張
- **A1.1** 所求：花費不能失控。 〔有出處〕 \`proj:docs/design.md#Why a cap\`
- **A1.2** 選擇：每一輪最多十則（來源數見 →F1）。 〔有出處〕 \`proj:src/fetch.mjs#LIMIT\`
- **A1.3** 原因：為什麼正好是十？ 〔不明〕
- **A1.4** 影響：一天最多 240 則。 〔推得〕 \`proj:src/fetch.mjs#LIMIT\`
  - 推法：10 則乘以 24 輪。
- **A1.5** 帶得走：先定每一輪的上限，再談頻率。

#### 需要的背景
- \`bg:hosted-scheduler#B1\` 為什麼排程不準時

#### 物證
- \`proj:src/fetch.mjs#LIMIT\` 一個常數
- \`proj:docs/LESSONS.md\` 一筆教訓紀錄

## 架構拆解
- **N1** Fetch（擷取）：抓來源。 〔有出處〕 \`proj:src/fetch.mjs\`
- **D1** Fetch 把貼文交給資料表（S1）。 〔有出處〕 \`proj:src/fetch.mjs:1-2\`
- **M1** 省略了重試；實際上每個來源會重試一次。 〔有出處〕 \`proj:src\`

## 排除
| 內容 | 原因 | 位置 |
|---|---|---|
| 自動補抓 | 未實裝 | \`proj:docs/design.md\` |
`
  fs.writeFileSync(file, text)
  const edit = (from, to) => {
    const now = fs.readFileSync(file, 'utf8')
    assert.ok(now.includes(from), `fixture lacks: ${from}`)
    fs.writeFileSync(file, now.replace(from, to))
  }
  return { root, repo, library, file, commit, edit }
}
