// chat: a short exchange in speech bubbles, for opening scenarios and "how to use it" moments.
// data: { messages: [{ who: "me" | "them", name?, text, at? }] }   up to 4 messages
import { esc, isWide } from '../lib/util.mjs'

const units = (s) => [...s].reduce((n, c) => n + (isWide(c) ? 1 : 0.56), 0)

export default function chat(scene, ctx) {
  const msgs = scene.data.messages
  if (!msgs?.length || msgs.length > 4) throw new Error(`場景 ${scene.id}：對話要 1 到 4 則，現在是 ${msgs?.length ?? 0} 則`)
  msgs.forEach((m) => {
    if (!['me', 'them'].includes(m.who)) throw new Error(`場景 ${scene.id}：who 只能是 me 或 them，現在是「${m.who}」`)
    if (units(m.text) > 44) ctx.warn(`對話「${m.text.slice(0, 10)}…」超過兩行，請縮短`)
  })
  const html = `<div class="stage chat"><div class="col">
  ${msgs.map((m, i) => `<div class="msg m${i} ${m.who}">${m.name ? `<span class="who">${esc(m.name)}</span>` : ''}<p>${esc(m.text)}</p></div>`).join('\n  ')}
</div></div>`

  let t = ctx.t() + 0.2
  msgs.forEach((m, i) => {
    t = m.at != null ? ctx.t(m.at) : i === 0 ? t : t + 1.0
    ctx.from(`.m${i}`, { opacity: 0, y: 24, scale: 0.96, transformOrigin: m.who === 'me' ? '100% 100%' : '0% 100%', duration: 0.4, ease: 'back.out(1.4)' }, t)
  })
  return html
}
