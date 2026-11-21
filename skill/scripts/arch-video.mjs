#!/usr/bin/env node
// Usage:
//   node scripts/arch-video.mjs doctor
//   node scripts/arch-video.mjs material <project|file.md>
//   node scripts/arch-video.mjs build <storyboard.json> [--stills-only [--voice]] [--theme <name>] [--out <dir>]
// Commands are imported lazily so that `doctor` still runs when the npm dependencies are not installed yet.
const [cmd, file, ...flags] = process.argv.slice(2)

if (cmd === 'doctor') {
  const { doctor } = await import('../lib/doctor.mjs')
  process.exit((await doctor()) ? 0 : 1)
} else if (cmd === 'material' && file) {
  const { gate, materialFile, workDir } = await import('../lib/material.mjs')
  const g = await gate(materialFile(file))
  const list = (title, items) => { if (items.length) console.log(`\n${title}\n${items.map((s) => `  - ${s}`).join('\n')}`) }
  console.log(`素材：${g.file}`)
  if (g.material) {
    const m = g.material
    console.log(`審核：${m.review ?? '?'}；整理日期：${m.date ?? '?'}；來源：${m.repos.map((r) => `${r.code} ${r.commit}`).join('、')}`)
    console.log(`故事線 ${g.check.counts.storylines} 條、因果弧 ${g.check.counts.arcs} 條、主張 ${g.check.counts.claims} 條`)
    list('因果弧', g.check.arcs.map((a) => `${a.id}（${a.storylines.join('、') || '?'}）${a.question}`))
    list('不能講的：原因不明的主張、查不到來源的背景', [...g.entries].filter(([, s]) => s === '不明' || s === '查不到').map(([id]) => id))
    list('這份素材用到的背景知識（整份讀過再編排）', g.backgrounds)
  }
  if (g.notes.length) list('提醒', g.notes)
  else if (g.material) console.log('\n提醒：沒有')
  if (!g.ok) {
    list('還不能做影片', g.stops)
    console.log('\n先用 arch-material skill 整理或更新素材，owner 審核過再回來。')
    process.exit(1)
  }
  console.log(`\n素材可以用。工作資料夾：${workDir(g.file)}`)
} else if (cmd === 'build' && file) {
  try {
    // Imported inside the try: loading it also loads the material skill's scanner, which may be missing.
    const { build } = await import('../lib/build.mjs')
    await build(file, flags)
  } catch (e) {
    // Print the message only: a stack trace buries it and echoes source lines.
    console.error(`\n錯誤：${e?.message ?? e}`)
    process.exit(1)
  }
} else {
  console.error(`用法：
  node scripts/arch-video.mjs doctor
      檢查這台機器能不能產片，缺什麼會列出怎麼補
  node scripts/arch-video.mjs material <專案名稱|素材檔>
      確認素材可以用來做影片：存在、owner 審核過、沒有過期。印出故事線、因果弧、不能講的條目與工作資料夾
  node scripts/arch-video.mjs build <storyboard.json> [--stills-only [--voice]] [--theme <主題>] [--out <資料夾>]
      產出 <out>/<name>/<name>.mp4 與 <out>/<name>/stills/（每個場景一張預覽圖與一張總表）
      --stills-only  只產出預覽圖，不渲染影片。不連配音服務，時間用字數估算，旁白不會送到外部
      --voice        搭配 --stills-only：預覽時也配音，時間才準。旁白會送到配音服務，腳本確認後才用
      --theme        臨時換主題（預設讀分鏡的 meta.theme，沒寫就是 night），輸出到 <out>/<name>-<主題>/
      --out          輸出位置，預設是分鏡檔所在資料夾底下的 out/`)
  process.exit(2)
}
