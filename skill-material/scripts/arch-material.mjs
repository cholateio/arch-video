#!/usr/bin/env node
// Entry point: init, check, status, stamp. No dependencies beyond Node and git.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const USAGE = `用法：
  arch-material init [素材庫]            建立素材庫（預設 ~/arch-material），只有自己讀得到
  arch-material check <素材檔>           檢查格式、座標、背景知識與機密
  arch-material status <素材檔>          素材記錄的版本和來源現在的版本比起來，哪些條目受影響
  arch-material stamp <素材檔>           印出「整理時的版本」要填的表格

  --repo <代號>=<路徑>                   來源不在素材記錄的位置時（例如換了電腦）指定它在哪`

function parse(argv) {
  const args = { _: [], repos: {} }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') {
      const [code, ...rest] = (argv[++i] ?? '').split('=')
      if (!code || !rest.length) throw new Error('--repo 要寫成 <代號>=<路徑>')
      args.repos[code] = rest.join('=')
    } else if (argv[i].startsWith('--')) throw new Error(`不認得的選項：${argv[i]}`)
    else args._.push(argv[i])
  }
  return args
}

const need = (file) => {
  if (!file) throw new Error(USAGE)
  if (!fs.existsSync(file)) throw new Error(`找不到素材檔：${file}`)
  return file
}
const list = (title, items) => { if (items.length) console.log(`\n${title}\n${items.map((s) => `  - ${s}`).join('\n')}`) }

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parse(rest)
  if (cmd === 'init') {
    const dir = path.resolve(args._[0] ?? path.join(os.homedir(), 'arch-material'))
    fs.mkdirSync(path.join(dir, 'background'), { recursive: true })
    // Owner-only: the library holds the owner's remarks and where sensitive things are.
    fs.chmodSync(dir, 0o700)
    console.log(`素材庫：${dir}\n背景知識放在 ${path.join(dir, 'background')}，一個專案一個檔放在素材庫底下。`)
    return 0
  }
  if (cmd === 'check') {
    const { check } = await import('../lib/check.mjs')
    const r = await check(need(args._[0]), { repos: args.repos })
    console.log(`故事線 ${r.counts.storylines} 條、因果弧 ${r.counts.arcs} 條、主張 ${r.counts.claims} 條、座標 ${r.counts.coords} 個、背景知識 ${r.counts.backgrounds} 份`)
    list('因果弧', r.arcs.map((a) => `${a.id}（${a.storylines.join('、') || '?'}）${a.question}`))
    list('要問 owner 的（原因不明、背景查不到）', r.questions)
    list('提醒', r.notes)
    list(`警告（${r.warnings.length}）`, r.warnings)
    list(`錯誤（${r.errors.length}）`, r.errors)
    console.log(r.errors.length ? '\n檢查沒過。' : r.warnings.length ? '\n格式與座標都對，還有警告要處理。' : r.reviewed ? '\n檢查通過，owner 審核過。' : '\n檢查通過，還沒經過 owner 審核。')
    return r.errors.length ? 1 : 0
  }
  if (cmd === 'status') {
    const { status } = await import('../lib/status.mjs')
    const r = status(need(args._[0]), { repos: args.repos })
    const name = { A: '新增', M: '修改', D: '刪除', R: '改名' }
    for (const repo of r.repos) {
      if (repo.state === 'same') console.log(`${repo.code}：和素材記錄的版本一樣（${repo.recorded}）`)
      if (repo.state === 'folder') console.log(`${repo.code}：不是 git repo，用指紋比對`)
      if (repo.state === 'missing') console.log(`${repo.code}：找不到資料夾，無法比對`)
      if (repo.state === 'unknown' || repo.state === 'diverged') console.log(`${repo.code}：記錄的 commit ${repo.recorded} 找不到，或不在現在這條歷史上`)
      if (repo.state === 'changed') {
        console.log(`${repo.code}：素材記錄的是 ${repo.recorded}，現在是 ${repo.head}，中間有 ${repo.commits.length} 個 commit`)
        list('  這段期間的 commit', repo.commits)
        list('  素材引用到、而且變了的檔案（重新查證右邊這些條目）', repo.touched.map((f) => `${name[f.status] ?? f.status} ${f.from ? `${f.from} → ` : ''}${f.path}：${f.where.join('、')}`))
        list('  變了、但素材沒有引用的檔案（看 commit 訊息，判斷有沒有新的功能或決定）', repo.other.map((f) => `${name[f.status] ?? f.status} ${f.from ? `${f.from} → ` : ''}${f.path}`))
      }
      const show = (d) => `${d.untracked ? '新檔案 ' : ''}${d.from ? `${d.from} → ` : ''}${d.path}`
      list(`  ${repo.code} 有還沒 commit 的變動，而且素材引用到（重新查證右邊這些條目）`, repo.dirty.filter((d) => d.where.length).map((d) => `${show(d)}：${d.where.join('、')}`))
      list(`  ${repo.code} 有還沒 commit 的變動，素材沒有引用（確認不是新的功能或決定）`, repo.dirty.filter((d) => !d.where.length).map(show))
    }
    list('記了指紋的來源變了（不在版控的檔案，或當時還沒 commit 的修改）', r.stamps.map((s) => `${s.raw}（${s.state === 'missing' ? '檔案不見了' : '內容不同'}）：${s.where.join('、') || '沒有條目直接引用，看一下有沒有新的原因'}`))
    list('不在版控的來源沒有記指紋，無法判斷有沒有變（跑 stamp）', r.unstamped)
    list('背景知識該重新確認來源了', r.backgrounds.map((b) => `${b.slug}#${b.id}（${b.age == null ? '沒有查證日期' : `${b.age} 天前查的`}）`))
    list('素材引用的來源或背景知識不見了', r.missing)
    list('建議整份重新整理', r.rebuild)
    console.log(!r.fresh ? '\n素材過期了：照上面的清單更新，更新完跑 stamp 與 check。'
      : r.loose ? `\n素材記錄的內容沒有過期，但來源有 ${r.loose} 個還沒 commit 的變動不在素材裡：告訴 owner，由 owner 決定要不要等 commit 之後再更新素材。`
      : '\n素材是最新的。')
    return 0
  }
  if (cmd === 'stamp') {
    const { stamp } = await import('../lib/status.mjs')
    const r = stamp(need(args._[0]), { repos: args.repos })
    console.log(r.text)
    for (const v of r.moved) console.error(`\n注意：${v.code} 的版本會從 ${v.from} 換成 ${v.to}。stamp 只記下現在的版本，不替你查證：先跑 status，把這段期間變動到的條目查證完，再貼上這張表。`)
    if (r.missing.length) { console.error(`\n找不到這些來源的資料夾：${r.missing.join('、')}`); return 1 }
    return 0
  }
  console.log(USAGE)
  return cmd ? 1 : 0
}

main().then((code) => { process.exitCode = code }, (e) => { console.error(e.message); process.exitCode = 1 })
