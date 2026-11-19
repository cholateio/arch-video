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
| `npm test` | 單元測試：時間軸、觸發點、場景合成、機密掃描、配音的快取與熔斷、體檢。不連網、不渲染，約一秒跑完 |
| `npm run demo` | 整條流程跑一次：配音、合成、lint、預覽圖、渲染、成品檢查。任一步失敗會以非零結束 |
| `npm run stills` | 只產出預覽圖，不渲染也不配音（配過音的句子用快取）；改版面時用這個比較快 |
| `node scripts/arch-video.mjs build <分鏡檔>` | 產出任一份分鏡的影片 |
| `... --stills-only --voice` | 預覽時也配音，時間才準（調整版面與動畫時用）。不加 `--voice` 的預覽不連配音服務，沒配過音的句子用字數估算時間 |
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
- **數字從 0 數上去要用 `fromTo`**：`from({ innerText: 0 })` 會讓數字停在 0（見 `scenes/stat.mjs`）。
- **換章節的 `wipe` 會自動輪流三種樣式**（橫條、圓形、直條），依出現的次序決定，不是寫在分鏡裡。
- **`<audio>` 一定要有 `id`**，否則 HyperFrames 渲染出來沒有聲音，而且不會報錯（lint 才會抓到）。
- **觸發詞用字元位置對時間。** 配音服務的斷詞會把詞切開（「十二個」變成「十」「二個」），
  所以 `timeline.mjs` 把各段文字接起來找起始字元，不直接比對詞。
- **有 `say` 的句子，觸發詞要從 `say` 裡挑。** 時間戳來自實際唸出來的文字。
- **機密掃描排在配音之前。** 旁白文字會送到外部的配音服務，所以 `build.mjs` 先跑 `secrets.mjs` 的 `scanBoard()`，有發現就停。
  回報時只印遮蔽後的片段。`meta.allow` 只接受和找到的內容完全相同、至少六個字的字串。測試裡的假金鑰要在執行時拼出來，不要寫成完整的字面值，否則 commit 會被 kit 的機密檢查擋下。
- **觸發點比旁白早 0.8 秒，而且對齊子句的開頭，不是觸發詞本身。** `timeline.mjs` 的 `CUE_LEAD` 控制提前量；
  子句靠配音回傳的詞尾標點判斷。同一個子句的後續觸發詞最多再晚 0.3 秒，所以每個觸發點至少比子句早 0.5 秒：
  元件內部再加的延遲（例如圖示、標籤晚 0.3 秒）不可以超過 0.5 秒。打字效果要在旁白講到之前打完（用 `ctx.deadline()`）。
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
- `SKILL.md` 的流程只在一組小型的測試素材上由全新的對話跑到審核點二（未渲染）；還沒有在真實的專案、大量素材（需要分給子代理讀）或沒有 repo 的素材上跑過。
- 機密掃描只認得常見的格式；沒有對真實專案的內容測過誤判率。
- 「預覽不配音、審核點二通過後才配音」是實測之後才改的：程式單獨測過不會連外，但還沒有全新的對話照新的 `SKILL.md` 走過步驟 7 到 9。
- 從審核點二到渲染、交付（步驟 9、10）還沒有由全新的對話跑過。
- Morph 轉場尚未實作。

## Docs map

| File | What it holds |
|------|---------------|
| `AGENTS.md` | Goal, stack, layout, constraints and conventions (tool-neutral) |
| `docs/specs/` | Requirement specs |
| `docs/DEVELOPMENT.md` | This file |
| `skill/references/script-rules.md` | 寫旁白與分鏡的規則 |
| `skill/references/storyboard-format.md` | 分鏡檔格式與各場景元件的欄位 |
