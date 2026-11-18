# arch-video 設計規格

日期：2026-11-19
狀態：已由 owner 確認（grill 訪談 Round 0–2）
標記：**[user]** = user 決定；**[mine]** = 我的決定，owner 可推翻。

## 1. 目標

一個 Claude Code skill：`/arch-video <repo>`。輸入一個 repo，輸出一支有旁白、燒錄字幕、
章節結構的 1080p 技術架構解說影片（mp4）。

- **[user]** 輸入是一個 repo；先支援 skill / MCP 類專案；觀眾是工程師。
- **[user]** 產品本體是「repo → 章節 → 一畫面一概念的分鏡 → 旁白逐句對齊」這條流程；
  視覺是可抽換的主題。
- **[user]** 形式是 skill，不另做 agent（中途要在主對話停下來審核一次）。
- **[user]** Windows 原生與 WSL 都要能跑，不能莫名卡住。

### 試作與過關標準

- **[user]** 第一支講 arch-blueprint skill。
- **[user]** 2–3 分鐘、1080p、16:9。過關：除了配音音色以外，owner 願意直接公開。

### 永久不做 **[user]**

生成式影片模型、虛擬人像主播、自動上傳、多語版本、背景音樂。

## 2. 流程

| # | 階段 | 產物 | 說明 |
|---|---|---|---|
| 0 | doctor | 體檢報告 | 檢查 Node、瀏覽器、ffmpeg、配音連線；缺什麼明講怎麼補 **[mine]** |
| 1 | analyze | 拆解清單 + `overview.svg` | 用 arch-blueprint 分析目標 repo **[user]** |
| 2 | script | 章節 → 場景 → 旁白句 | 一個場景只講一個概念 |
| 3 | storyboard | `storyboard.json` | 每個場景：元件類型、資料、旁白句、觸發點、進場轉場 |
| 4 | preview | 每場景一張靜態圖 | 審核用 **[mine]** |
| 5 | **審核點** | owner 放行或退回 | 唯一一次停頓：拆解、腳本、分鏡一起審 **[user]** |
| 6 | tts | 每句一個音檔 + 秒數 | 逐句合成、以「文字＋音色」為鍵快取 **[mine]** |
| 7 | timeline | 各句起訖時間 | 由音檔秒數加句間留白算出，驅動動畫與字幕 **[mine]** |
| 8 | compose | HyperFrames HTML | 分鏡資料 + 元件庫 + 主題 |
| 9 | render | mp4 | 畫面、旁白、燒錄字幕 |
| 10 | check | 自檢報告 | 抽格看圖、長度與字幕溢出檢查 |

arch-blueprint 自己要求的「畫圖前確認拆解」併入第 5 步，不另外停 **[user]**。

給 Claude 的操作步驟寫在 `skill/SKILL.md`；第 0 步是 `arch-video doctor`，第 4、6–10 步是 `arch-video build`。
成果放在目標 repo 的 `docs/video/`（分鏡）與 `docs/video/out/`（產出，不進版控）**[mine]**。

## 3. 視覺

主題可切換：`skill/themes/<名稱>.mjs` 放該主題的所有設計數值，`skill/themes/base.css` 與場景元件只引用這些值。

- **[user]** 預設主題是 `night`（深色）：近黑底、暖白線條與文字、版面置中、字幕白字無底框。
- **[mine]** 保留 `blueprint`（淺色）：紙色 `#faf8f4`、墨黑 `#1a1a1a`，沿用 arch-blueprint 的配色。
- **[user]** 字級調小：大字標語最大 96px、標題最大 104px（原本 190px 與 160px 太大）。
- **[user]** 兩個強調色。**[mine]** 分工：強調色標示「現在正在講的東西」；
  第二強調色只在需要和強調色區分時使用（例如流程裡不同性質的步驟）。
- **[user]** 彩色圖示。**[mine]** 用 Phosphor 的 duotone 圖示，顏色跟著主題的強調色。
- **[mine]** arch-blueprint 的圖放進影片時自動換成主題的底色與線條色，arch-blueprint 本身不改。
- **[mine]** 自己的特色保留在：線條逐筆畫出、等寬字（JetBrains Mono）、工程圖的裁切標記與尺寸標註線。
- **[user]** 不能全是流程圖。規則 **[mine]**：
  - 藍圖全圖只在章節交界出現幾秒，當地圖用。
  - 流程圖類場景不超過總長三分之一，不連續超過兩個。
- **[user]** 旁白與字幕繁體中文；圖內文字英文（arch-blueprint 規則）。

### 場景元件（固定一套，模型只填資料）**[user]**

- 已完成：標題 `title`、大字標語 `statement`、檔案視窗 `file`、藍圖地圖 `map`、流程 `flow`。
- 待做 **[mine]**：終端機、檔案樹、對比卡片、清單、比喻線條畫。

### 轉場：只准四種，各有固定含義 **[mine]**（PPT 換頁概念 **[user]**）

| 場景關係 | 轉場 |
|---|---|
| 同一主題延續 | Morph：元素從舊位置移到新位置（尚未實作） |
| 流程的下一步 | Push：方向跟著流程方向 |
| 拉近看細節 | Zoom |
| 換章節 | 幾何圖形擦除（yui540 式的玩具感只放這裡） |

### 插畫與圖示 **[mine]**

- 比喻插畫由模型以墨線風格現畫 SVG，限簡單幾何。
- 圖示與人物：lucide-animated、Devicon、Open Peeps。
- 不用 AI 生圖；不放 unDraw（其授權禁止打包再散布，repo 是公開的）。

## 4. 配音與時間軸

- **[user]** AI 配音、零月費；女聲 `zh-TW-HsiaoChenNeural`。
- **[user]** 旁白只保留專有名詞的英文，其餘用中文說；字幕可以顯示英文原詞。
  做法 **[mine]**：每句旁白的 `text` 是字幕、`say` 是實際唸的話；專有名詞列在分鏡的 `meta.properNouns`，
  其餘英文詞出現在唸法裡時程式會警告。規則全文在 `skill/references/script-rules.md`。
- **[mine]** edge-tts，配音層可抽換。一句旁白同時是一段音檔、一行字幕、一個動畫觸發點。
- **[mine]** 句中觸發點優先用字詞時間戳；拿不到就按字數比例估算。
- **[mine]** 配音連線被擋時退成純字幕版，時間軸改用字數估算。
- **[mine]** Groq 試作階段不使用（Groq 文件 2026-11-18：語音合成只有英文與沙烏地阿拉伯語）。

## 5. 引擎與可攜性

- **[user]** 渲染引擎 HyperFrames（Apache 2.0；HTML 加時間屬性，無頭 Chrome 逐格渲染，ffmpeg 編碼）。
- **[mine]** 只用自己的元件與四種轉場，不取用 HyperFrames 目錄裡的現成區塊造型。
- **[mine]** 腳本全用 Node，不依賴 bash 或 Python，Windows 與 WSL 跑同一套。
- **[mine]** 可以用環境變數 `HYPERFRAMES_BROWSER_PATH` 指定機器上已安裝的 Chrome；沒指定時 HyperFrames 第一次渲染會自動下載。
- **[mine]** 第一步先渲染 5 秒短片驗證；失敗就退回「Playwright 逐格截圖加 ffmpeg」自製方案。

## 6. Repo

- **[user]** 公開。四支參考影片是他人作品，排除在版控之外。
- **[user]** 同意在本機安裝無頭 Chromium 與 npm 套件。

## 7. 驗證結果（2026-11-19，WSL）

用 HyperFrames 0.9.67 與 node-edge-tts 1.2.12 實測，兩支約 11 秒的測試片在 `out/`（不進版控）。

- **引擎可用**：不需 sudo。無頭 Chrome 由 `hyperframes browser ensure` 下載到使用者快取目錄，約 19 秒。
- **渲染速度**：11.8 秒、1080p、30fps 的片子約 6 秒渲染完。
- **動畫**：GSAP 的 SVG 筆畫動畫（`strokeDashoffset`）與變色可用；CSS `@keyframes` 動畫也能逐格定位。
- **音軌**：多個 `<audio>` 依各自的 `data-start` 正確混入。`<audio>` 必須有 `id`，否則渲染出來沒聲音。
- **配音**：`zh-TW-HsiaoChenNeural`、`zh-TW-YunJheNeural` 都能合成，每句約 0.7 秒，附字詞時間戳。
- **觸發點要用字元位置**：斷詞會把詞切開（「十二個」被切成「十」「二個」），
  所以把各段文字接起來找關鍵詞的起始字元，再回推時間，不能直接比對詞。

### 實測後新增的決定 **[mine]**

- **關閉遙測**：HyperFrames 預設會回傳使用統計。skill 執行時一律設 `HYPERFRAMES_NO_TELEMETRY=1`。
- **不用上傳類指令**：`publish`、`share`、`cloud` 會把專案或影片傳到 HeyGen，一律不用。
  HyperFrames Pro 的範本與雲端渲染是付費功能，本專案不使用；本機渲染免費。
- **字型與 GSAP 隨專案附帶**：預設做法是渲染時從 Google Fonts 與 CDN 下載，受限的網路可能擋。
  改成用 npm 安裝 GSAP、字型檔放進專案。
- **固定版本**：鎖定 `hyperframes` 與 `node-edge-tts` 的確切版本，兩台機器產出一致。
- **審核預覽圖**用 `hyperframes snapshot`，交付前跑 `hyperframes lint`。
- **離線配音備案**：HyperFrames 內建本機語音模型 Kokoro，說明列出支援中文，但需要 Python，尚未測試。

## 8. 尚未驗證

- Windows 原生環境整條流程；`browser ensure` 能否找到已安裝的 Chrome 或 Edge。
- 受限的網路是否擋 edge-tts 的連線。
- 配音的音質與觸發點是否對得上語音（我聽不到，要 owner 聽測試片）。
- 逐句合成的語氣連貫度（測試片只有兩句）。
- lucide-animated、Devicon、Open Peeps 的授權（目前來自第三方整理，使用前到官方頁面確認）。
- Remotion 的付費授權門檻（第三方說法；已不採用，僅記錄）。
- yui540 的實際動態（只讀到網站文字）。
- 參考影片只看了每支前半段 12 格，聽不到聲音；節奏與配音風格未參考。

## 9. 與最初需求的差異

- 不複製參考影片的外觀，只借用編排規則：一畫面一概念、元素隨旁白出現、元件重複使用、強調色極少。
- 參考影片判斷為程式渲染而非影像模型生成，本專案同樣走程式渲染。
- 「skill 或 agent」定為 skill。
