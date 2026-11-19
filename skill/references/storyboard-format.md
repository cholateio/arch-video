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
  "chapters": [{ "id": "workflow", "label": "WORKFLOW" }],
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
| `chapters` | 章節清單。`label` 顯示在左上角的章節標示，用英文大寫 |
| `scenes[].id` | 小寫英數與連字號，字母開頭，不可重複 |
| `scenes[].type` | 場景元件，見下方 |
| `scenes[].chapter` | 屬於哪一章；不寫就不顯示章節標示 |
| `scenes[].transition` | 進場轉場：`cut`（預設）、`wipe`、`push`、`push-up`、`zoom` |
| `scenes[].lines` | 旁白。`text` 是字幕；`say` 是實際唸的話，省略時等於 `text` |

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

- 最多 11 行；太長的行會被截斷。
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
{ "items": [{ "value": "12", "unit": "個", "label": "節點上限", "tone": "accent", "at": "節點" }] }
```

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
- 輸出要照實寫，不可以編造程式不會印出的內容。
- 每一行都要等上一行打完才會出現。兩行的觸發點太近、下一行因此比旁白晚出現時會警告。

## 產出

```
out/<name>/<name>.mp4          影片
out/<name>/stills/sheet.jpg    每個場景一張的靜態預覽總表
out/<name>/stills/NN-<id>.png  各場景的靜態預覽圖
out/<name>/timeline.json       各場景、各句的起訖時間
out/<name>/project/            HyperFrames 專案（中間產物）
```

`--stills-only` 只產出預覽圖，不渲染影片。`--theme <主題>` 可臨時換主題，輸出到 `out/<name>-<主題>/`。
