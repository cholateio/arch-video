# 分鏡格式

分鏡是一個 JSON 檔，描述整支影片：有哪些章節、每個場景用哪個元件、放什麼內容、旁白怎麼說。
`arch-video build <分鏡檔>` 讀它產出影片。完整範例見 `examples/demo/storyboard.json`。

## 整體結構

```json
{
  "meta": {
    "name": "demo",
    "title": "arch-blueprint 元件示範",
    "voice": "zh-TW-HsiaoChenNeural",
    "theme": "night",
    "properNouns": ["arch-blueprint"]
  },
  "chapters": [{ "id": "workflow", "short": "流程" }],
  "scenes": [
    {
      "id": "rule",
      "type": "statement",
      "chapter": "workflow",
      "transition": "wipe",
      "data": {},
      "lines": [{ "text": "字幕顯示的句子。", "say": "實際唸出來的句子。" }]
    }
  ]
}
```

| 欄位 | 說明 |
|---|---|
| `meta.name` | 輸出的資料夾與檔名 |
| `meta.voice` | 配音的聲音，預設 `zh-TW-HsiaoChenNeural` |
| `meta.theme` | 主題，預設 `night`；另有 `blueprint` |
| `meta.properNouns` | 旁白裡可以保留英文的專有名詞 |
| `meta.allow` | 機密掃描放行的字串，要和被擋下的內容完全相同、至少六個字。只有使用者同意公開的內容才放，例如專案對外的聯絡信箱 |
| `chapters` | 章節清單，顯示成左上角的一排章節標示，目前這一章會亮起來。每一章寫 `short`：四個字以內的中文名稱（「為什麼」「架構」「排程」）。沒寫 `short` 時改用 `label`（英文大寫），只顯示目前這一章的名稱，其餘是圓點 |
| `scenes[].id` | 小寫英數與連字號，字母開頭，不可重複 |
| `scenes[].type` | 場景元件，見下方 |
| `scenes[].chapter` | 屬於哪一章；不寫就不顯示章節標示 |
| `scenes[].transition` | 進場轉場：`cut`（預設）、`wipe`、`push`、`push-up`、`zoom` |
| `scenes[].lines` | 旁白。`text` 是字幕；`say` 是實際唸的話，省略時等於 `text` |

## 機密掃描

`build` 一開始會掃描分鏡裡所有的文字，以及 `map` 場景載入的架構圖檔。
發現疑似金鑰、權杖、授權標頭、寫死的密碼、內部位址、內部主機名稱、電子郵件，或混合大小寫與數字的長字串，
就報錯並停止；這時旁白還沒送到配音服務。

- 處理方式：把那段內容拿掉，或把值換成 `••••`。
- 使用者同意公開的字串，原樣加進 `meta.allow`。片段、標點、少於六個字的項目會報錯。
- 掃描只認得常見的格式，通過不代表沒有機密。

## 預覽不配音

`--stills-only` 不連配音服務：之前配過音的句子用快取，其餘用字數估算時間。
旁白的文字不會離開這台電腦，所以腳本還沒確認前只跑預覽。長度是估計值，實際配音後會有出入。
加上 `--voice` 預覽時才會配音，只在腳本已經確認、需要準確時間時使用。

## 觸發點（`at`）

場景裡的元素大多可以加 `at`，決定它什麼時候出現。
**畫面一律比旁白先到**：元素會提前 0.8 秒出現，觀眾先看到、再聽到。

| 寫法 | 意思 |
|---|---|
| 省略 | 場景內容開始時（第一句旁白在這之後 0.5 秒才開始） |
| `"分區"` | 旁白講到「分區」所在的**子句**開始之前 0.8 秒。依序在各句裡找第一個出現的地方；找不到會報錯 |
| `2` | 第 3 句（從 0 算）開始之前 0.8 秒 |
| `{ "line": 1, "offset": 0.4 }` | 第 2 句開始後 0.4 秒。這是精確時間，不會提前，也不保證在旁白講到之前完成；只在需要手動微調時使用 |

- 子句以標點（，、；：。？！）分隔。觸發詞在子句的哪個位置都一樣：元素在那個子句開始前就出現。
- 同一個子句裡有好幾個觸發詞時，元素照旁白的先後順序接連出現。
- 元素如果排在場景的旁白講完之後才出現，會警告。

只寫字串的欄位，也可以寫成 `{ "text": "...", "at": "..." }` 來加觸發點。

## 場景元件

### `title`：標題

專案名稱以打字方式出現，四角有裁切標記。

```json
{
  "kicker": "SKILL BREAKDOWN",
  "title": "arch-blueprint",
  "subtitle": { "text": "把專案畫成一張黑白藍圖", "at": "一張藍圖" },
  "tags": [{ "text": "SVG", "at": "兩個顏色" }]
}
```

- `title` 是半形字時才有打字效果。

### `statement`：大字標語

一段一段從下方推上來，下方有一條尺寸標註線。

```json
{
  "kicker": "CORE PRINCIPLE",
  "segments": [
    { "text": "先分區，", "at": "先分區" },
    { "text": "再連線", "at": "再連線", "tone": "accent" }
  ],
  "note": "RULE 01"
}
```

- `kicker` 在場景一開始就出現，旁白鋪陳時畫面才不會空著。
- `segments[].tone`：`accent` 或 `accent2`，會上色並加底線。
- `segments[].break`：`true` 代表從這一段換行。
- `note` 是標註線下方的標籤，可以寫成 `{ "text", "at" }`。
- 一行太長會警告，請換行或縮短。

### `file`：檔案視窗

顯示一段檔案節錄，旁白講到哪幾行就標出來，並在右側掛註解。

```json
{
  "path": "arch-blueprint/SKILL.md",
  "lines": ["## 工作流程", "", "1. 分析專案"],
  "highlights": [{ "from": 3, "to": 3, "at": "分析專案", "note": "先讀懂專案" }]
}
```

- 最多 11 行。一行超過約 58 個半形字寬會警告：自己從行尾截斷並加上「…」。
- `highlights[].from`、`to` 是行號（從 1 算），`to` 省略時等於 `from`。
- `note` 最多約 12 個全形字寬（依主題的字級而定），超過會警告。

### `flow`：流程

2 到 5 個圓圈一字排開，圈裡是圖示，中間用箭頭連接。

```json
{
  "title": "從專案到一張圖",
  "steps": [
    { "icon": "magnifying-glass", "label": "分析專案", "at": "分析專案" },
    { "icon": "list-checks", "label": "提案拆解", "tone": "accent", "at": "提案拆解" }
  ],
  "note": { "text": "第二步要等你確認，才會往下走", "at": "確認" }
}
```

- `icon` 是 Phosphor 圖示的名稱（https://phosphoricons.com）；寫錯會報錯並列出相近的名稱。
- `tone`：`ink`（預設）、`accent`、`accent2`。

### `map`：藍圖地圖

直接使用 arch-blueprint 產出的 SVG。分區、節點、連線依序畫出來；旁白講到某一區時鏡頭拉近。

```json
{
  "svg": "overview.svg",
  "focus": [{ "zone": "zone-backend", "at": "後端" }]
}
```

- `svg` 的路徑相對於分鏡檔。
- `draw: false`：直接顯示畫好的圖，不重畫一次。接在另一個 `map` 場景後面繼續講時使用。
- `title: true` 才顯示 SVG 自己的圖名，預設不顯示。
- 圖的顏色會自動換成目前主題的底色與線條色。
- `focus` 是鏡頭的步驟，每一步寫 `at` 加上下面其中一種：

  | 寫法 | 效果 |
  |---|---|
  | `"zone": "zone-backend"` | 拉近到那一區，外框變成強調色，其他部分淡掉 |
  | `"nodes": ["n-api", "n-query"]` | 鏡頭框住這幾個節點，其他部分淡掉 |
  | `"trace": ["e-api-query"]` | 追蹤這條連線：線變成強調色、有一段光點沿線跑，兩端的節點保持亮著 |
  | 三種都不寫 | 拉回全圖 |

  分區、節點、連線的 id 就是 arch-blueprint SVG 裡的 id；寫錯會報錯並列出可用的 id。

逐區講解加資料流追蹤的寫法：

```json
{
  "svg": "overview.svg",
  "draw": false,
  "focus": [
    { "zone": "zone-agent", "at": "中間" },
    { "at": "現在跟著" },
    { "trace": ["e-writer-check"], "at": "草稿" }
  ]
}
```

### `chat`：對話

對話泡泡，適合開場的情境與「怎麼用」。最多 4 則，每則最多兩行。

```json
{
  "messages": [
    { "who": "them", "name": "新同事", "text": "這個專案是怎麼運作的？" },
    { "who": "me", "name": "你", "text": "等我找一下。", "at": "你說" }
  ]
}
```

- `who`：`me` 靠右、`them` 靠左。

### `compare`：對比卡片

左右兩張卡片，例如兩種痛點、適合與不適合。每張最多 4 項。

```json
{
  "left": { "title": "適合", "mood": "good", "items": [{ "text": "想快速看懂全貌", "at": "全貌" }] },
  "right": { "title": "不適合", "mood": "bad", "items": ["要畫到細節層級"] }
}
```

- `mood`：`good`（打勾）、`bad`（打叉）、`plain`（預設）。
- 左邊的卡片在場景一開始就出現。右邊的卡片沒寫 `at` 時，在講到它第一個項目的那一句開始之前出現。

### `list`：清單

有標題的條列，最多 5 項。

```json
{
  "title": "重點回顧",
  "style": "check",
  "items": [{ "text": "先分區，再連線", "at": "先分區" }, { "text": "一張圖說一件事", "sub": "節點最多十二個" }]
}
```

- `style`：`number`（編號，適合預告）、`check`（打勾，適合回顧）、`bullet`（預設）。

### `stat`：大數字

一到三個大數字加說明。整數會從 0 數上去。

```json
{ "title": "為什麼不用內建排程", "items": [{ "value": "12", "unit": "個", "label": "節點上限", "tone": "accent", "at": "節點" }] }
```

- `title` 選填。旁白先鋪陳、數字晚一點才講到時，加上標題，場景開頭畫面才不會空著。
- 每個數字都要在旁白裡講到它的原因或影響，否則會警告。

### `tree`：檔案樹

列出檔案結構，旁白講到哪個檔案，它就亮起來並顯示說明。最多 8 列。

```json
{
  "root": "arch-blueprint/",
  "items": [
    { "name": "scripts/" },
    { "name": "check.py", "depth": 2, "note": "檢查腳本", "at": "檢查腳本", "icon": "file-py" }
  ]
}
```

- 名稱以 `/` 結尾的是資料夾；`depth` 是縮排層級（預設 1）；`icon` 可指定 Phosphor 圖示。

### `cycle`：循環

三到五個步驟排成一圈，用箭頭連起來，適合「重複做到某個條件成立」的流程。

```json
{
  "center": { "text": "直到零錯誤", "at": "直到" },
  "steps": [{ "icon": "pencil-ruler", "label": "畫圖", "at": "畫圖" }],
  "loopAt": "循環",
  "note": { "text": "最後還要親眼看過一次", "at": "用眼睛" }
}
```

- `loopAt`：最後一段回到起點的箭頭什麼時候畫出來。

### `terminal`：終端機

指令逐字打出來，輸出接在後面。最多 8 行。

```json
{
  "title": "terminal",
  "lines": [
    { "type": "cmd", "text": "python3 scripts/check.py overview.svg", "at": "一行指令" },
    { "type": "ok", "text": "✓ overview.svg  (0 錯誤, 0 警告)", "at": "零錯誤" }
  ]
}
```

- `type`：`cmd`（指令）、`out`（一般輸出，預設）、`ok`（成功）、`err`（失敗）。
- 輸出的格式要照程式實際會印的寫，不可以編造程式不會印出的內容。能實際執行（不連外、不寫入）就用真實的輸出；
  不能執行時，範例的值可以自己舉，並在審核點二說明這是示意。
- 每一行都要等上一行打完才會出現。兩行的觸發點太近、下一行因此比旁白晚出現時會警告。

### `layout`：版面加零件

把畫面分成一到三格，每一格放一個**零件**。同一批零件換個組合就是不同的畫面：圖配重點、圖配數字、兩張圖並排、流程配視窗。
數量、時間、進度、狀態這類內容用它畫出來，不要用 `stat` 報數字、用 `compare` 條列。

| 零件 | 畫什麼 |
|---|---|
| `units` | 一格代表一個：幾個裡面的幾個、一批一批消化 |
| `slots` | 時間格：該發生幾次、實際發生幾次 |
| `meter` | 長條：實際用量離上限多遠 |
| `panel` | 示意的清單視窗：執行紀錄、佇列、資料表，列的狀態可以變 |
| `steps` | 小流程，可以直排 |
| `term` | 小終端機 |
| `figure` | 一個大數字 |
| `points` | 幾行重點，可以加卡片外框 |

```json
{
  "title": "假設積了 300 則沒翻",
  "parts": [
    { "widget": "units", "head": "有上限", "mood": "good", "total": 300, "group": 10,
      "steps": [{ "take": 10, "at": "有上限" }, { "take": 290, "rounds": 29, "at": "慢慢消化", "span": 2.2 }],
      "left": { "label": "還沒翻", "unit": "則" }, "tally": { "label": "用了", "unit": "輪" },
      "foot": { "text": "代價：要 30 個小時才追上", "at": "代價" } },
    { "widget": "units", "head": "沒有上限", "mood": "bad", "total": 300, "group": 10,
      "steps": [{ "take": 300, "tone": "accent", "at": "同一輪", "span": 0.5 }],
      "left": { "label": "還沒翻", "unit": "則" }, "tally": { "label": "用了", "unit": "輪" } }
  ]
}
```

- `title` 選填，可以寫成 `{ "text", "at" }`。
- `arrange`：`single`（一格置中）、`split`（左右兩格）、`stack`（上下兩格，兩格會靠在一起當成一張圖）、`trio`（三格）。
  省略時依 `parts` 的數量決定：一個是 `single`、兩個是 `split`、三個是 `trio`。
- `ratio`：`split` 與 `stack` 兩格的比例，例如 `[3, 2]`，預設 `[1, 1]`。`stack` 時它是每一格最多能用的高度：
  內容比較矮就往中間靠攏，放不下會警告。
- 每一格（`parts` 的一項）共用的欄位，其餘欄位屬於零件：
  - `widget`：零件名稱。
  - `head`：零件上方的小標。`mood` 是 `good` 或 `bad` 時，小標前面會有打勾或打叉。
  - `foot`：零件下方的一句話，可以寫成 `{ "text", "at" }`。
  - `enter`：這一格什麼時候進場（觸發點）。預設全部隨場景一起進場，畫面不會有一半空著；零件裡的變化仍照各自的 `at`。
- 放了 `figure`、`units`、`slots`、`meter` 的場景，旁白要講到畫面上數字的原因或影響，否則會警告（和 `stat` 相同）。
- 零件需要的高度超過它那一格時會警告：調整 `ratio`、換一種排法，或把內容減少。

#### 零件 `figure`：一個大數字

```json
{ "widget": "figure", "value": "10", "unit": "則", "label": "每一輪的上限", "tone": "accent", "at": 0 }
```

整數會從 0 數上去。適合放在圖的旁邊，點出圖裡最重要的那個數。

#### 零件 `units`：一格代表一個

```json
{ "widget": "units", "total": 40, "group": 10, "steps": [{ "take": 10, "at": 0 }] }
```

- `total`：格子總數，1 到 400。`group`：每一列的格數會是它的倍數（通常填一批的大小）。
- `steps`：每一步把接下來的 `take` 格填滿。`tone` 是 `accent2`（預設）或 `accent`；`span` 是填滿要花的秒數；
  `rounds` 是這一步讓 `tally` 增加多少（預設 1），用來把很多輪合成一步快轉。
- `left`：還沒填的格數，會跟著倒數。`tally`：累計的次數，會跟著往上數。兩個都選填，格式是 `{ "label", "unit"? }`。
- 用來講「幾個裡面的幾個」「一批一批消化」。格子擠到看不清楚時會警告。

#### 零件 `slots`：時間格

```json
{ "widget": "slots", "total": 24, "ends": ["0 時", "24 時"],
  "rows": [{ "label": "應該觸發", "on": 24 }, { "label": "某一天實際觸發（示意）", "on": [0, 3, 4, 9, 13, 17, 22], "tone": "accent", "at": "實際" }] }
```

- `total`：一列有幾格，2 到 48。`ends`：軸兩端的標籤。
- `rows`：一到三列。`on` 寫數字是從頭亮幾格，寫陣列是亮哪幾格（從 0 算）。`span` 是亮完要花的秒數。
- `sum`：選填，`{ "label", "unit"?, "per"? }`，在旁邊顯示最後一列亮的格數乘上 `per`。
- 用來講「該發生幾次、實際發生幾次」「哪幾個時段有、哪幾個沒有」。亮哪幾格若是舉例而不是實際紀錄，要在 `label` 標明示意。

#### 零件 `meter`：同一把尺上的長條

```json
{ "widget": "meter", "unit": "則", "max": 240,
  "bars": [{ "label": "一天最多", "value": 240, "tone": "accent2", "at": "240 則" }, { "label": "實測單日最高", "value": 148, "tone": "accent", "at": "148 則" }] }
```

- `bars`：一到四條，整數會數上去。`max` 是尺的終點，省略時比最大值多留一點。
- `limit`：選填，`{ "value", "label", "at"? }`，畫一條貫穿所有長條的虛線，用來標上限或門檻。
- 用來講「實際用量離上限多遠」。和 `slots` 上下疊在一起時可以互相對照；`slots` 的 `total` 在 24 以上時兩者一樣寬。

#### 零件 `points`：幾行重點

```json
{ "widget": "points", "frame": true, "style": "check", "items": ["先讀再畫，圖才對得上程式", { "text": "檢查交給腳本", "sub": "不靠眼睛", "at": "腳本" }] }
```

- `items`：一到五項，每項最多兩行。`style` 是 `bullet`（預設）、`check`、`cross`、`number`。
- `frame: true` 會加上卡片外框。配上這一格的 `head` 與 `mood`，就是一張對比卡片。
- 用在圖的旁邊，寫出這張圖要觀眾記住的一兩句話。整個畫面只有 `points` 和 `figure` 時算純文字場景。

#### 零件 `steps`：小流程

```json
{ "widget": "steps", "direction": "column", "steps": [{ "icon": "magnifying-glass", "label": "讀程式碼" }, { "icon": "pencil-simple", "label": "畫圖", "tone": "accent", "at": "再畫" }] }
```

- 二到五步。`icon` 是 Phosphor 圖示名稱。`direction` 是 `row` 或 `column`，省略時依這一格的寬度決定。
- 用在流程只是畫面的一半時（另一半放重點、數字或視窗）。流程本身就是整個場景的主角時用 `flow`。

#### 零件 `term`：小終端機

```json
{ "widget": "term", "title": "terminal（示意）", "lines": [{ "type": "cmd", "text": "pnpm run translate", "at": "一行指令" }, { "type": "ok", "text": "Translated 9/9", "at": "結果" }] }
```

欄位和 `terminal` 場景相同，最多六行。這一格比較窄時字會自動縮小一級；還是放不下會警告。輸出的寫法照 `terminal` 的規則。

#### 零件 `panel`：示意的清單視窗

```json
{ "widget": "panel", "title": "執行紀錄（示意）",
  "rows": [{ "text": "10 月 1 日", "state": "ok", "badge": "0 / 10" },
           { "text": "10 月 2 日", "state": "wait", "then": { "state": "fail", "badge": "已停用", "at": "停用" } }],
  "buttons": ["重新啟用"] }
```

- 一個通用的視窗，用來把「正在講的那個東西」畫出來：執行紀錄、佇列、資料表的幾列。
- `rows`：一到七列。`state` 是 `ok`、`fail`、`wait`、`off`；`badge` 是右邊的小標籤。
  `then` 讓這一列在某個觸發點換成另一個狀態或標籤，用來演出「原本在等，後來失敗了」這種變化。
- `buttons`：最多三個，第一個是主要動作。
- **內容不是素材裡的實際紀錄時，`title` 要標明「示意」。** 列的格式照那個工具實際會顯示的東西寫，不編造它沒有的欄位。
  它是通用的外觀，不模仿任何真實產品的介面。

## 產出

```
out/<name>/<name>.mp4          影片
out/<name>/stills/sheet.jpg    每個場景一張的靜態預覽總表
out/<name>/stills/NN-<id>.png  各場景的靜態預覽圖
out/<name>/timeline.json       各場景、各句的起訖時間
out/<name>/project/            HyperFrames 專案（中間產物）
```

`--stills-only` 只產出預覽圖，不渲染影片，也不連配音服務。`--theme <主題>` 可臨時換主題，輸出到 `out/<name>-<主題>/`。
