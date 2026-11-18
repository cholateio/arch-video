---
name: arch-video
description: Use when asked to turn a software project, repo, skill or MCP server into a narrated explainer / walkthrough / architecture video (mp4). 當使用者要求把專案、repo、skill 或 MCP server「做成影片」「架構解說影片」「介紹影片」「講解影片」時使用；即使沒指定風格或長度也用本 skill。
---

# arch-video — 把 repo 變成架構解說影片

讀一個 repo，寫出旁白與分鏡，產出一支有旁白、字幕、章節的 1080p 影片。
核心精神：**一個場景只講一個概念；畫面跟著旁白走；分鏡先給人看過，才花時間渲染。**

`<skill>` 代表本檔所在的資料夾。所有產片動作都透過 `<skill>/scripts/arch-video.mjs`，
不要自己寫 HTML，也不要直接呼叫 hyperframes。

目前為 skill 與 MCP server 類的專案設計。其他類型可以做，但場景元件只有五種，先告訴使用者這個限制。

## 工作流程（依序執行；只在步驟 5 停下來等使用者）

### 0. 體檢

```bash
node <skill>/scripts/arch-video.mjs doctor
```

- 有「缺」：照它列的方法補。要安裝或下載東西之前，先用一句話告訴使用者要裝什麼，再執行。
  相依套件用 `npm install`（在 `<skill>` 裡執行）。
- 只有「注意」：可以繼續。配音連不上時，成品會是沒有聲音的純字幕版，要在步驟 5 告訴使用者。

### 1. 分析專案

- 讀 README、進入點、資料夾結構；skill 類專案讀 `SKILL.md` 與它引用的腳本和文件。
- 用 **arch-blueprint** skill 產出架構圖，存到目標 repo 的 `docs/architecture/overview.svg`。
  - arch-blueprint 規定「畫之前先給使用者確認拆解」。在本流程裡，這個確認併入步驟 5：
    照它的規則做完刪減測試後直接畫出暫定版、跑它的檢查腳本，**不要在這裡停下來問**。
  - 目標 repo 已經有這張圖就直接用，並在步驟 5 說明是沿用的。
  - 沒有 arch-blueprint skill：停下來告訴使用者需要安裝它，或由使用者決定做一支不含架構圖的影片。

### 2. 寫腳本

先讀 `<skill>/references/script-rules.md`，照它寫。

- 長度：使用者沒指定就做 2 到 3 分鐘，大約 12 到 16 個場景、每個場景 1 到 3 句旁白。
- 骨架（可依專案調整）：
  1. 開場：這是什麼、解決什麼問題（`title`）
  2. 核心想法：一句話（`statement`）
  3. 全貌：架構圖全圖（`map`）
  4. 每一章：拉近到那一區（`map`）、拿檔案內容佐證（`file`）、說明怎麼跑（`flow`）
  5. 收尾：一句讓人帶走的話（`statement`）
- **每一句旁白都要在 repo 裡找得到根據。** 找不到根據的說法不要寫；不確定的列進步驟 5 的「不確定的地方」。
- **`file` 場景顯示的是檔案原文。** 可以省略整行、可以從行尾截斷並加上「…」、可以去掉 Markdown 的粗體與反引號記號，
  不可以改寫用字。

### 3. 寫分鏡

照 `<skill>/references/storyboard-format.md` 的格式，寫到目標 repo 的 `docs/video/storyboard.json`。
範例見 `<skill>/examples/demo/storyboard.json`。

- `map` 場景的 `svg` 路徑相對於分鏡檔，通常是 `../architecture/overview.svg`。
- 專有名詞列在 `meta.properNouns`；其他英文詞在 `say` 改成中文說法。
- 另外建立 `docs/video/.gitignore`，內容是一行 `out/`，產出才不會被 commit。

### 4. 預覽

```bash
node <skill>/scripts/arch-video.mjs build docs/video/storyboard.json --stills-only --out docs/video/out
```

- 報錯就修分鏡；警告也要全部處理到沒有為止。
  - 例外：「配音服務連不上」的警告不是分鏡的問題，改分鏡消不掉。帶著它繼續，在步驟 5 和步驟 7 告訴使用者成品沒有聲音。
- **實際打開 `docs/video/out/<name>/stills/sheet.jpg` 看圖**，逐一確認：
  - 文字沒有超出畫面、沒有互相重疊。
  - 每個場景只看畫面就說得出它在講什麼。
  - 強調色只落在那個場景的重點上。
  - 流程圖類場景（`map`、`flow`）沒有連續超過兩個。
- 有問題就改分鏡再跑一次，直到通過。

### 5. 審核點（唯一一次停下來）

用一則訊息給使用者下面四樣，然後停下來等回覆：

1. **架構拆解**：分區、每區的節點、主要資料流。
2. **腳本**：一張表，每個場景一列，欄位是「場景、元件、旁白」。唸法和字幕不同的句子要標出來。
3. **預覽總表**：把 `sheet.jpg` 傳給使用者（或給完整路徑），並寫出預估長度。
4. **不確定的地方**：你做的假設、找不到根據而略過的內容、配音連不上等限制。

使用者要求修改就改分鏡、重跑步驟 4，再給一次。使用者放行後才往下。

### 6. 渲染

```bash
node <skill>/scripts/arch-video.mjs build docs/video/storyboard.json --out docs/video/out
```

結束時它會印出「成品檢查」：長度、有沒有畫面、有沒有聲音。以非零結束就是失敗，照錯誤訊息處理，不要回報成功。

### 7. 交付

告訴使用者：

- 影片的完整路徑與長度。
- 還留著的警告。
- **你沒有驗證的事**：你聽不到聲音，所以配音的音質、語調、畫面和語音是否同步，都要請使用者自己聽過。

## 不可以做的事

- 不使用 HyperFrames 的 `publish`、`share`、`cloud`：它們會把專案或影片上傳到外部服務。
- 不修改 `<skill>` 裡的程式、場景元件或主題，除非使用者明確要求。
- 不為了通過檢查而刪掉警告對應的內容；分鏡類的警告代表畫面真的有問題，要修的是分鏡。
- 不把目標 repo 裡的金鑰、帳號、內部網址寫進旁白或檔案節錄。

## 參考

- `references/script-rules.md` — 旁白與分鏡的規則
- `references/storyboard-format.md` — 分鏡檔格式、各場景元件的欄位、觸發點寫法
- `examples/demo/storyboard.json` — 可以直接執行的範例
