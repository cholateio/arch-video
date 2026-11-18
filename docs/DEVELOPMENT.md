# Development

Everything you need to pick this project back up after months away.

## Restart in 30 seconds

```bash
cd skill
npm install
npx hyperframes browser ensure   # 第一次才需要：取得渲染用的無頭 Chrome
npm test                         # 單元測試，不連網
npm run demo                     # 產出 out/demo/demo.mp4（配音需要連網）
```

## Commands

以下都在 `skill/` 裡執行。

| Command | Purpose |
|---------|---------|
| `node scripts/arch-video.mjs doctor` | 體檢：Node、相依套件、ffmpeg、無頭 Chrome、配音連線。缺套件時也能跑 |
| `npm test` | 單元測試：時間軸、觸發點、配音的快取與熔斷、體檢。不連網、不渲染，不到一秒跑完 |
| `npm run demo` | 整條流程跑一次：配音、合成、lint、預覽圖、渲染、成品檢查。任一步失敗會以非零結束 |
| `npm run stills` | 同上但不渲染影片，只產出預覽圖；改版面時用這個比較快 |
| `node scripts/arch-video.mjs build <分鏡檔>` | 產出任一份分鏡的影片 |
| `... --theme blueprint` | 臨時換主題，輸出到 `out/<name>-blueprint/` |
| `... --out <資料夾>` | 指定輸出位置，預設是目前資料夾底下的 `out/` |

## Environment variables

不需要 `.env`，也沒有金鑰。

| Variable | Purpose |
|----------|---------|
| `HTTPS_PROXY` | 選填。配音連線要經過代理伺服器時設定 |
| `HYPERFRAMES_BROWSER_PATH` | 選填。指定已安裝的 Chrome 執行檔，HyperFrames 就不會自己下載 |

## Easy to forget

- **`hyperframes browser path` 會順便下載 Chrome**，不是唯讀指令。體檢因此只看環境變數與快取資料夾，不呼叫它。
- **進入點用動態載入**：`scripts/arch-video.mjs` 依指令才載入模組，沒裝相依套件時 `doctor` 才跑得起來。
  `lib/doctor.mjs` 不可以在檔案開頭載入 `node_modules` 裡的東西。
- **`<audio>` 一定要有 `id`**，否則 HyperFrames 渲染出來沒有聲音，而且不會報錯（lint 才會抓到）。
- **觸發詞用字元位置對時間。** 配音服務的斷詞會把詞切開（「十二個」變成「十」「二個」），
  所以 `timeline.mjs` 把各段文字接起來找起始字元，不直接比對詞。
- **有 `say` 的句子，觸發詞要從 `say` 裡挑。** 時間戳來自實際唸出來的文字。
- **可以「畫出來」的線不能直接帶箭頭。** 箭頭是另一個元素，線畫完才顯示，否則箭頭會先出現在終點（見 `scenes/map.mjs`）。
- **GSAP 要動的元素不要在 CSS 寫 `scale(0)` 這類變形。** 初始狀態用 `ctx.init()` 或 `fromTo` 設定。
- **字型與 GSAP 是從 `node_modules` 複製進輸出專案的**，渲染時不連網。
- **配音快取在 `skill/.cache/tts/`**，鍵是「聲音＋語速＋文字」。換聲音或改一個字都會重新合成那一句。
- **配音連不上時不會中斷**：那一句改用估算的時間、沒有聲音，並列出警告。
  連續兩句失敗後，這次執行剩下的句子直接略過，不再逐句等逾時（`lib/tts.mjs` 的熔斷）。
- **預覽總表逐一列出輸入檔，不用 glob**：Windows 的 ffmpeg 不支援 `-pattern_type glob`。
- **WSL 沒有硬體 GPU**，HyperFrames 會印一段軟體渲染的提示，可以忽略。
- **靜態預覽圖取的是每個場景「最後一句剛講完」的那一刻**，所有元素都已出現、下一個轉場還沒開始。
- **藍圖地圖的顏色是字串替換來的**：arch-blueprint 的圖固定用 `#faf8f4` 與 `#1a1a1a`，
  `scenes/map.mjs` 把這兩個值換成主題的顏色。arch-blueprint 若改了配色，這裡要跟著改。

## Not verified yet

- Windows 原生環境還沒跑過整條流程；體檢找 Chrome 快取的位置（`~/.cache/hyperframes/chrome`）在 Windows 上未確認，找不到時只會列為「注意」。
- `SKILL.md` 的整條流程還沒有實際跑過一次。
- Morph 轉場尚未實作；`zoom` 轉場寫好了但示範片沒有用到。

## Docs map

| File | What it holds |
|------|---------------|
| `AGENTS.md` | Goal, stack, layout, constraints and conventions (tool-neutral) |
| `docs/specs/` | Requirement specs |
| `docs/DEVELOPMENT.md` | This file |
| `skill/references/script-rules.md` | 寫旁白與分鏡的規則 |
| `skill/references/storyboard-format.md` | 分鏡檔格式與各場景元件的欄位 |
