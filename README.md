# arch-video

你想向其他工程師介紹一個專案的架構，可是做一支解說影片要整理內容、寫腳本、畫圖、配音、對時間。對 Claude Code 說「把這個專案做成架構解說影片」，它會先把專案整理成句句有出處的素材，再做成有旁白和字幕的 1080p 影片。

![示範片的六個場景：打字出現的標題、大字標語、四個步驟的流程、標出重點行的檔案視窗、拉近到後端分區的架構圖、結尾標語](docs/images/hero.jpg)

- **只講有出處的事**：素材的每一句都指得回程式碼、設計紀錄或官方文件；影片的每個場景標明根據哪幾條，對不到或原因查不到，產片就會停下來。
- **從使用情境講起**：影片照「誰需要它、它給你什麼、怎麼做到」的順序走，用專案的實際資料與網站截圖舉例，講到決定時連原因一起講。
- **畫面跟著旁白走**：每句先配音、量出秒數，元素在旁白講到時出現；架構圖逐區拉近，再沿著連線把資料流一條一條走過。
- **渲染前先檢查**：超過預定長度、專有名詞沒先介紹、字幕放不下一行、元素出現得太早或太晚、疑似金鑰或內部位址，都會在花時間渲染之前報出來。

分鏡裡的一個場景：

```json
{
  "id": "pipeline", "type": "flow", "transition": "wipe",
  "data": { "title": "從專案到一張圖", "steps": [{ "icon": "magnifying-glass", "label": "分析專案", "at": "分析專案" }, …] },
  "lines": [{ "text": "整個流程有四步。" }, { "text": "分析專案、提案拆解、產出 SVG，最後自檢。", "say": "分析專案、提案拆解、產出向量圖，最後自檢。" }]
}
```

預覽時的輸出：

```
▸ 時間軸與合成
  總長 112.7 秒，10 個場景，252 個動畫
     0.0s  intro        title      cut
    16.4s  pipeline     flow       wipe
    91.5s  overview     map        wipe
▸ 檢查
  lint：0 個錯誤
```

設計時主要的對象是 skill、MCP server 與中小型的程式專案；Windows 上還沒有完整測試過。

## How it works

```
專案 ──► 素材（arch-material，你審核）──► 編排與分鏡（你審核）
分鏡 ──► 逐句配音 ──► 時間軸 ──► 合成 HTML ──► 渲染 mp4
              └─► 每句的秒數與字詞時間，決定畫面元素何時出現
```

沒有伺服器也沒有資料庫；除了配音以外，全部在你的電腦上完成。

## Install

你需要 Claude Code、Node.js 22 以上、git 與 ffmpeg。

1. 下載這個 repo，把 `skill` 複製成 `~/.claude/skills/arch-video`，`skill-material` 複製成 `~/.claude/skills/arch-material`（兩個要放在同一層）。
2. 在 `~/.claude/skills/arch-video` 裡執行 `npm install`，再執行 `node scripts/arch-video.mjs doctor`，照它列的補齊缺的東西。
3. 在你的專案裡對 Claude Code 說「整理這個專案的素材」。它會給你看主旨、每個決定的原因與查不到的問題，你確認後才算審核過。
4. 再說「把這個專案做成架構解說影片」。它會先給你看編排，再給你看腳本與每個場景的預覽圖，你放行後才配音、渲染。

## Privacy & security

- 素材、分鏡與影片都放在 `~/arch-material/`，只有你的帳號讀得到；整理素材時對你的專案只讀，不會在專案裡多出檔案。
- 旁白的文字在你確認腳本之後，才會送到 Microsoft Edge 的朗讀服務合成語音；結果快取在 `skill/.cache/`。上網查背景知識時，查詢只包含公開的服務與技術名稱。
- 截圖用沒有登入狀態的全新瀏覽器，只截得到不必登入就能開的頁面；但內網或本機上這類頁面一樣截得到。截圖裡的字機密掃描讀不到，所以每一張都會先給你看。
- 不需要任何金鑰或帳號。HyperFrames 的使用統計一律關閉，也不使用任何會上傳專案或影片的指令。

## License

[MIT](LICENSE). 渲染使用 [HyperFrames](https://github.com/heygen-com/hyperframes) 與 GSAP，圖示來自 [Phosphor Icons](https://phosphoricons.com)，字型是 JetBrains Mono 與 Noto Sans TC，配音經由 node-edge-tts。
