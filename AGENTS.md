<!-- Tool-neutral project memory. Never put local paths, costs or personal data here. -->
# arch-video

## Project goal

把一個 repo 變成有旁白、字幕、章節的技術架構解說影片的 Claude Code skill，給想向其他工程師介紹專案架構的人用。
repo 裡有兩個 skill：`arch-material` 把專案整理成帶出處的素材，`arch-video` 把素材做成影片。
權威需求：`docs/specs/2026-11-19-arch-video-design.md`、`docs/specs/2026-11-19-material-skill-design.md`。

## Stack

- Language / framework: Node.js 22+（ES modules，無框架）；HyperFrames 渲染（HTML → mp4）；GSAP 動畫
- Services: Microsoft Edge 朗讀服務（配音，經 `node-edge-tts`，免金鑰）；其餘全在本機
- System tools: ffmpeg、ffprobe；無頭 Chrome 由 `hyperframes browser ensure` 取得
- Test: `npm --prefix skill test`、`npm --prefix skill-material test`
- Integration check: `npm --prefix skill run demo`（配音需要連網；會實際渲染一支示範片到 `skill/out/`）

## File layout

- `skill/` — skill 本體，可整個資料夾複製後 `npm install` 使用
  - `skill/SKILL.md` — 給 Claude 的工作流程：體檢、整理素材、審核點一、畫架構圖、寫腳本與分鏡、預覽、審核點二、渲染、交付
  - `skill/scripts/arch-video.mjs` — 指令進入點：`doctor`、`build <分鏡檔>`
  - `skill/lib/` — `doctor`（體檢）、`build`（產片主流程）、`tts`（配音與快取）、`timeline`（時間軸與觸發點）、`compose`（合成 HyperFrames 專案）、`render`（呼叫 HyperFrames 與 ffmpeg）、`secrets`（機密掃描）、`icons`、`util`
  - `skill/scenes/` — 場景元件，一個檔案一種：`title`、`statement`、`file`、`flow`、`map`、`chat`、`compare`、`list`、`stat`、`tree`、`cycle`、`terminal`、`layout`
  - `skill/widgets/` — 零件，一個檔案一種，放在 `layout` 場景的格子裡：`figure`、`units`、`slots`、`meter`、`points`、`steps`、`term`、`panel`
  - `skill/themes/` — 主題：`<名稱>.mjs` 放該主題的所有設計數值，`base.css` 是共用樣式
  - `skill/references/` — 整理素材、寫腳本與分鏡的規則：`source-rules.md`、`script-rules.md`、`storyboard-format.md`、`review-checklist.md`
  - `skill/examples/demo/` — 示範分鏡與它用到的藍圖（跑測試與調整版面用）
  - `skill/examples/arch-blueprint/` — 第一支正式影片的分鏡與架構圖
  - `skill/tests/` — 單元測試（不連網、不渲染）
- `skill-material/` — 整理素材的 skill。沒有相依套件，只需要 Node.js 與 git；機密掃描用的是 `skill/lib/secrets.mjs`，所以兩個 skill 要放在同一個資料夾底下
  - `skill-material/SKILL.md` — 給 Claude 的工作流程：清點、文件地圖、主旨與故事線、因果弧、上網查背景、架構拆解、審核點、更新
  - `skill-material/scripts/arch-material.mjs` — 指令進入點：`init`、`check <素材檔>`、`status <素材檔>`、`stamp <素材檔>`
  - `skill-material/lib/` — `material`（解析素材檔與背景知識）、`repo`（唯讀地讀來源 repo）、`check`（格式、座標、機密）、`status`（和來源現在的版本比對）、`local`（哪些來源要記指紋，三個指令共用）、`shared`（找到影片 skill 的機密掃描）
  - `skill-material/references/` — `source-rules.md`（怎麼讀、以誰為準、機密、上網查背景）、`material-format.md`（素材檔的格式）、`verify-checklist.md`（給查證者的清單）
  - `skill-material/tests/` — 單元測試（在暫存資料夾建立小的 git repo，不連網）
- `docs/specs/` — 需求與設計決定，是「要做什麼」的依據
- `docs/DEVELOPMENT.md` — 指令、注意事項
- `materials/` — 參考影片，他人作品，不進版控
- `out/` — 產出的影片與中間產物，不進版控（在哪個資料夾執行指令，就出現在那裡的 `out/`）

## Constraints

- HyperFrames 的遙測一律關閉（`HYPERFRAMES_NO_TELEMETRY=1`）；絕不使用會上傳的指令：`publish`、`share`、`cloud`。
  所有 HyperFrames 呼叫都走 `skill/lib/render.mjs` 的 `hf()`，不要在別處自行呼叫。
- `materials/` 裡的參考影片是他人作品：不 commit，也不把它們的畫面截圖放進 repo。
- 這是公開 repo，隨附的素材只能用 MIT、Apache-2.0、CC0、OFL 這類授權；unDraw 禁止打包再散布，不可放入。
- 腳本只用 Node.js，不依賴 bash 或 Python：同一套要能在 Windows 與 WSL 執行。
- 場景元件不可寫死顏色、字型、字級：一律取自 `skill/themes/<名稱>.mjs`。
- `hyperframes`、`node-edge-tts` 等相依套件鎖定確切版本，兩台機器的產出才一致。
- 分鏡有問題要報錯或警告，不可默默略過（例如旁白裡找不到觸發詞）。
- Path-type constraints are mirrored in `kit.toml [protected]`; keep the two in sync (one glob per line).

## Conventions

- Conventional commits（`type(scope): 摘要`）；commit 前跑兩個 skill 的測試。
- 改了素材檔的格式：`skill-material/lib/material.mjs`、`references/material-format.md` 與測試裡的範本三處一起改。
- 程式內註解與識別字用英文；給使用者的訊息（指令輸出、錯誤、警告）與文件用繁體中文。
- 新增場景元件：在 `skill/scenes/` 加一個檔案並登記到 `index.mjs`，樣式加進 `themes/base.css`，
  用法寫進 `skill/references/storyboard-format.md`。新增零件相同，檔案放在 `skill/widgets/`。
- 改了畫面就重跑 `npm --prefix skill run demo`，並實際看 `stills/sheet.jpg`。
- GitHub Actions: top-level `permissions: contents: read`, raised per job only when needed.
- GitHub Actions: pin every `uses:` to a 40-character commit SHA with a trailing `# vX.Y.Z` comment.

## Where to look

- `docs/specs/` — requirements and design decisions
- `docs/DEVELOPMENT.md` — restart, commands, environment variables, gotchas
- `skill-material/references/material-format.md` — 素材檔與背景知識的格式
- `skill-material/references/source-rules.md` — 讀素材的規則：以誰為準、什麼算已實裝、機密、上網查背景
- `skill/references/source-rules.md` — 影片 skill 原本的素材規則與內容大綱格式；影片 skill 改成讀素材庫之後會移除
- `skill/references/script-rules.md` — 旁白與分鏡的規則
- `skill/references/storyboard-format.md` — 分鏡檔格式與各場景元件的欄位
