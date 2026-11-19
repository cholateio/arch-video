# arch-video

你想向其他工程師介紹一個專案的架構，但做一支解說影片要寫腳本、畫圖、配音、對時間。寫好一份分鏡檔，跑一個指令，就得到一支有旁白、字幕和章節的 1080p 影片。

![示範片的六個場景：打字出現的標題、大字標語、四個步驟的流程、標出重點行的檔案視窗、拉近到後端分區的架構圖、結尾標語](docs/images/hero.jpg)

- **旁白帶動畫面**：每句旁白先合成語音、量出秒數，畫面上的元素在旁白講到它之前就出現。
- **十三種場景元件**：對話、對比卡片、清單、大數字、檔案樹、終端機、流程、循環、架構圖等，你只填內容，版面與動畫是現成的。
  其中「版面」元件可以把格子、時間格、長條這些零件組合在同一個畫面，用來畫數量與進度。
- **架構圖會自己畫出來**：直接讀 [arch-blueprint](https://github.com/cholateio/arch-blueprint) 產出的 SVG，逐區拉近講解，再沿著連線把資料流一條一條走過。
- **分鏡寫錯會先告訴你**：旁白裡找不到觸發詞、字幕超過一行、場景開場空白太久、元素比旁白晚出現，都會在渲染前報出來。

- **先整理素材再寫腳本**：給 Claude 的流程會把程式碼和技術文件整理成一份附出處的內容大綱，以程式碼為準，還沒實裝的功能不進影片。
- **講原因，不只報告現況**：影片的主體是幾個關鍵的決定，每個決定講當初的問題、怎麼選、為什麼、不這樣會怎樣。原因要有出處（註解、設計紀錄、commit 訊息），查不到就不講。
- **機密不會被唸出來**：送出配音之前先掃描分鏡，發現疑似金鑰、內部位址或電子郵件就停下來。

設計時主要的對象是 skill、MCP server 與中小型的程式專案；Windows 上還沒有完整測試過。

## How it works

```
分鏡檔 ──► 逐句配音 ──► 時間軸 ──► 合成 HTML ──► 渲染 mp4
              └─► 每句的秒數與字詞時間，決定畫面元素何時出現
```

沒有伺服器也沒有資料庫；除了配音以外，全部在你的電腦上完成。

## Install

你需要 Node.js 22 以上，以及 ffmpeg。

1. 下載這個 repo，進入 `skill` 資料夾。
2. 執行 `npm install`。
3. 執行 `node scripts/arch-video.mjs doctor`，它會告訴你還缺什麼。
4. 執行 `npm run demo`，示範片會出現在 `out/demo/demo.mp4`。第一次會自動下載渲染用的無頭 Chrome。

要讓 Claude Code 替你從一個 repo 做出影片，把 `skill` 資料夾複製成 `~/.claude/skills/arch-video`，然後對它說「把這個專案做成架構解說影片」。
它會先給你看架構拆解、腳本和每個場景的預覽圖，你放行後才渲染。

要自己寫分鏡，複製 `examples/demo/storyboard.json` 來改，格式見 `references/storyboard-format.md`，
然後執行 `node scripts/arch-video.mjs build <你的分鏡檔>`。

## Privacy & security

- 渲染、字型、圖示都在本機，不需要任何金鑰或帳號。
- 旁白的文字會送到 Microsoft Edge 的朗讀服務合成語音；合成結果快取在 `skill/.cache/`，同一句不會重送。
- HyperFrames 預設會回傳使用統計，這個專案的指令一律把它關閉，也不使用任何會上傳專案或影片的指令。

## License

[MIT](LICENSE). 渲染使用 [HyperFrames](https://github.com/heygen-com/hyperframes) 與 GSAP，圖示來自 [Phosphor Icons](https://phosphoricons.com)，字型是 JetBrains Mono 與 Noto Sans TC，配音經由 node-edge-tts。
