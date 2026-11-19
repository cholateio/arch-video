// Theme "blueprint" (light): paper ground and ink lines, the arch-blueprint palette.
// Every design value of a theme lives in its one file; themes/base.css and the scene components only reference them.
export default {
  name: 'blueprint',
  color: {
    paper: '#faf8f4', // ground
    surface: '#faf8f4', // fill of cards, windows and nodes
    ink: '#1a1a1a', // lines and text
    accent: '#e8590c', // marks what the narration is talking about right now
    accent2: '#0b7a75', // only where something must be told apart from the accent (e.g. a different kind of step in a flow)
    wipe: '#1a1a1a', // bars of the chapter wipe
    progress: '#1a1a1a',
    chipBg: '#faf8f4',
    rule: '#1a1a1a', // short rule under the title
  },
  glow: 'none', // glow layered over the frame
  scrim: 'none', // gradient behind subtitles (not needed when subtitles have a box)
  sub: { size: 42, weight: 400, bg: '#1a1a1a', fg: '#faf8f4', shadow: 'none' }, // subtitles
  font: {
    mono: '"JetBrains Mono", "Noto Sans TC", monospace', // diagram text, labels, code
    tc: '"Noto Sans TC", "JetBrains Mono", sans-serif', // subtitles, statements, callouts
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
    body: 36, // running text: chat bubbles, card items, tree notes
    small: 24, // secondary text: speaker names, list sub-lines
    stat: 150, // big numbers
    count: 76, // counters beside a widget
    row: 30, // rows inside a panel
  },
  layout: { align: 'left', inset: 96 }, // title and statement are left-aligned, 96px from the stage edge
  frame: { width: 1920, height: 1080, fps: 30 },
  stage: { x: 120, y: 120, width: 1680, height: 750 }, // area available to scene content
  mapStage: { x: 120, y: 96, width: 1680, height: 804 }, // area for the blueprint map; taller than the normal stage
  line: { main: 3, thin: 2 },
  dim: 0.16, // opacity of out-of-focus elements
}
