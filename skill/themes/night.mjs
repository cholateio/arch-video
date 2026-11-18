// 主題「夜間」（深色）：近黑底、暖白線條與文字、琥珀色強調，版面置中。
export default {
  name: 'night',
  color: {
    paper: '#0d0e11',
    surface: '#171a20',
    ink: '#f4f1ea',
    accent: '#f2a348', // 強調色：標示「現在正在講的東西」
    accent2: '#5cc4a8', // 第二強調色：只在需要和強調色區分時使用（例如流程裡不同性質的步驟）
    wipe: '#1e2128',
    progress: 'rgba(244, 241, 234, 0.45)',
    chipBg: 'transparent',
    rule: '#f2a348',
  },
  // 左上暖色、右下冷色的兩團光暈，疊在內容上方，所以底色與卡片會一起被染色
  glow: 'radial-gradient(60% 60% at 10% 6%, rgba(222, 150, 80, 0.13), transparent 70%), radial-gradient(55% 65% at 94% 72%, rgba(84, 116, 210, 0.12), transparent 70%)',
  // 字幕沒有底框，所以畫面底部加一層漸層，蓋住拉近時延伸到字幕後面的圖
  scrim: 'linear-gradient(to top, rgba(13, 14, 17, 0.94) 0%, rgba(13, 14, 17, 0.94) 50%, transparent 100%)',
  sub: { size: 44, weight: 700, bg: 'transparent', fg: '#ffffff', shadow: '0 2px 14px rgba(0, 0, 0, 0.9), 0 0 3px rgba(0, 0, 0, 0.9)' },
  font: {
    mono: '"JetBrains Mono", "Noto Sans TC", monospace',
    tc: '"Noto Sans TC", "JetBrains Mono", sans-serif',
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
  layout: { align: 'center', inset: 0 },
  frame: { width: 1920, height: 1080, fps: 30 },
  stage: { x: 120, y: 120, width: 1680, height: 750 },
  mapStage: { x: 120, y: 96, width: 1680, height: 804 },
  line: { main: 2, thin: 1.5 },
  dim: 0.2,
}
