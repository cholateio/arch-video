#!/usr/bin/env node
// Usage:
//   node scripts/arch-video.mjs doctor
//   node scripts/arch-video.mjs build <storyboard.json> [--stills-only [--voice]] [--theme <name>] [--out <dir>]
// Commands are imported lazily so that `doctor` still runs when the npm dependencies are not installed yet.
const [cmd, file, ...flags] = process.argv.slice(2)

if (cmd === 'doctor') {
  const { doctor } = await import('../lib/doctor.mjs')
  process.exit((await doctor()) ? 0 : 1)
} else if (cmd === 'build' && file) {
  const { build } = await import('../lib/build.mjs')
  try {
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
  node scripts/arch-video.mjs build <storyboard.json> [--stills-only [--voice]] [--theme <主題>] [--out <資料夾>]
      產出 <out>/<name>/<name>.mp4 與 <out>/<name>/stills/（每個場景一張預覽圖與一張總表）
      --stills-only  只產出預覽圖，不渲染影片。不連配音服務，時間用字數估算，旁白不會送到外部
      --voice        搭配 --stills-only：預覽時也配音，時間才準。旁白會送到配音服務，腳本確認後才用
      --theme        臨時換主題（預設讀分鏡的 meta.theme，沒寫就是 night），輸出到 <out>/<name>-<主題>/
      --out          輸出位置，預設是目前資料夾底下的 out/`)
  process.exit(2)
}
