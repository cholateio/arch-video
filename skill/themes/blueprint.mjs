// 主題「活的藍圖」（淺色）：紙色底、墨線，沿用 arch-blueprint 的配色。
// 一個主題的所有設計數值都在這一個檔案；themes/base.css 與場景元件只引用這些值。
export default {
  name: 'blueprint',
  color: {
    paper: '#faf8f4', // 底色
    surface: '#faf8f4', // 卡片、視窗、節點的填色
    ink: '#1a1a1a', // 線條與文字
    accent: '#e8590c', // 強調色：標示「現在正在講的東西」
    accent2: '#0b7a75', // 第二強調色：只在需要和強調色區分時使用（例如流程裡不同性質的步驟）
    wipe: '#1a1a1a', // 換章節時橫條的顏色
    progress: '#1a1a1a',
    chipBg: '#faf8f4',
    rule: '#1a1a1a', // 標題下方短線
  },
  glow: 'none', // 疊在畫面上的光暈
  scrim: 'none', // 字幕後方的漸層遮罩（字幕有底框時不需要）
  sub: { size: 42, weight: 400, bg: '#1a1a1a', fg: '#faf8f4', shadow: 'none' }, // 字幕
  font: {
    mono: '"JetBrains Mono", "Noto Sans TC", monospace', // 圖內文字、標籤、程式碼
    tc: '"Noto Sans TC", "JetBrains Mono", sans-serif', // 字幕、標語、註解
  },
  // 字級（px）。title 由大到小挑第一個放得下的；statement 依一行的寬度由短到長取用。
  type: {
    title: [104, 84, 68],
    statement: [96, 84, 68, 56],
    kicker: 22, // 小標
    chip: 22, // 左上角章節標示
    lead: 40, // 標題下方的副標
    tag: 20, // 標題的標籤
    dimnote: 20, // 標語下方標註線的標籤
    bar: 24, // 檔案視窗標題列
    code: 30, // 檔案內容
    codeNum: 24, // 行號
    note: 34, // 檔案視窗右側註解
    heading: 46, // 流程的標題
    label: 34, // 流程步驟名稱
    pill: 34, // 流程下方的膠囊註解
  },
  layout: { align: 'left', inset: 96 }, // 標題與標語靠左，離舞台左緣 96px
  frame: { width: 1920, height: 1080, fps: 30 },
  stage: { x: 120, y: 120, width: 1680, height: 750 }, // 場景內容可用的範圍
  mapStage: { x: 120, y: 96, width: 1680, height: 804 }, // 藍圖地圖用的範圍，比一般舞台高
  line: { main: 3, thin: 2 },
  dim: 0.16, // 非焦點元素的不透明度
}
