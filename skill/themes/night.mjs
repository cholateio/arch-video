// Theme "night" (dark): near-black ground, warm white lines and text, amber accent, centred layout.
export default {
  name: 'night',
  color: {
    paper: '#0d0e11',
    surface: '#171a20',
    ink: '#f4f1ea',
    accent: '#f2a348', // marks what the narration is talking about right now
    accent2: '#5cc4a8', // only where something must be told apart from the accent (e.g. a different kind of step in a flow)
    wipe: '#1e2128',
    progress: 'rgba(244, 241, 234, 0.45)',
    chipBg: 'transparent',
    rule: '#f2a348',
  },
  // Warm glow top-left, cool glow bottom-right. Layered above the content so the ground and cards are tinted together.
  glow: 'radial-gradient(60% 60% at 10% 6%, rgba(222, 150, 80, 0.13), transparent 70%), radial-gradient(55% 65% at 94% 72%, rgba(84, 116, 210, 0.12), transparent 70%)',
  // Subtitles have no box, so a gradient at the bottom hides map content that extends behind them when zoomed in.
  scrim: 'linear-gradient(to top, rgba(13, 14, 17, 0.94) 0%, rgba(13, 14, 17, 0.94) 50%, transparent 100%)',
  sub: { size: 44, weight: 700, bg: 'transparent', fg: '#ffffff', shadow: '0 2px 14px rgba(0, 0, 0, 0.9), 0 0 3px rgba(0, 0, 0, 0.9)' },
  font: {
    mono: '"JetBrains Mono", "Noto Sans TC", monospace',
    tc: '"Noto Sans TC", "JetBrains Mono", sans-serif',
  },
  // Font sizes in px. title: the largest that fits is used; statement: picked by row width, shortest row first.
  type: {
    title: [104, 84, 68],
    statement: [96, 84, 68, 56],
    kicker: 22, // small label above a title or statement
    chip: 22, // chapter chip, top-left
    lead: 40, // subtitle under the title
    tag: 20, // title tags
    dimnote: 20, // label under the statement's dimension line
    bar: 24, // file window title bar
    code: 30, // file content
    codeNum: 24, // line numbers
    note: 34, // callouts beside the file window
    heading: 46, // flow title
    label: 34, // flow step names
    pill: 34, // pill caption under the flow
  },
  layout: { align: 'center', inset: 0 },
  frame: { width: 1920, height: 1080, fps: 30 },
  stage: { x: 120, y: 120, width: 1680, height: 750 },
  mapStage: { x: 120, y: 96, width: 1680, height: 804 },
  line: { main: 2, thin: 1.5 },
  dim: 0.2,
}
