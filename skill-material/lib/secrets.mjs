// Sensitive-content scanner, shared by both skills: the material must not hold credentials, internal addresses or
// personal contact details, and the video skill runs every storyboard through it before anything is shown or voiced.
// It recognises common shapes only: it is a safety net under the author's own care, not a replacement for it.
// Node built-ins only, so the material skill stays free of npm dependencies.

// A value that is a stand-in as a whole: a mask, a template slot, or a conventional dummy word. Prefixes do not count,
// so "myProdSecret123" is still a finding.
const PLACEHOLDER = new RegExp(
  [
    '^[*•.x_-]+$', // ••••, ****, xxxx
    '^<[^>]*>$', // <your-token>
    '^\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?$', // $TOKEN, ${TOKEN}
    '^\\{\\{[^}]*\\}\\}$', // {{ token }}
    '^(?:your|my|the)[-_ ]?(?:api[-_ ]?key|access[-_ ]?key|token|password|secret|key|webhook)(?:[-_ ]?here)?$',
    '^(?:example|placeholder|changeme|change[-_]me|redacted|dummy|none|null|true|false|undefined)$',
  ].join('|'),
  'i',
)
const KEYWORD = '(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|webhook)'
// An unquoted value counts when it does not look like code (a call, an index, a type name) and carries a digit or is long.
const looksLikeValue = (v) => !/[()[\]{}<>]|^(?:os|process|env|self|this|config|settings)\./.test(v) && (/\d/.test(v) || v.length >= 16)
// A long run that mixes digits, lower case and upper case is far more likely to be a key than prose or a hash.
const mixed = (v) => /\d/.test(v) && /[a-z]/.test(v) && /[A-Z]/.test(v)

// Ordered from specific to general: once a stretch of text is reported, later rules skip it.
const RULES = [
  { label: '私鑰', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { label: 'GitHub 權杖', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { label: 'GitLab 權杖', re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { label: 'npm 權杖', re: /\bnpm_[A-Za-z0-9]{30,}/g },
  { label: 'API 金鑰', re: /\b(?:sk|rk|pk)[-_](?:live_|test_|ant-|proj-)?[A-Za-z0-9_-]{20,}/g },
  { label: 'API 金鑰', re: /\b(?:hf_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{40,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|ya29\.[A-Za-z0-9_-]{20,})/g },
  { label: 'AWS 金鑰', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: 'Google API 金鑰', re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { label: 'Slack 權杖', re: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'webhook 網址', re: /(?:hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks)\/[A-Za-z0-9/_-]{8,}/g },
  { label: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: '網址裡的帳號密碼', re: /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi },
  { label: '授權標頭', re: /\b(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{16,})/g, value: 1 },
  { label: '授權標頭', re: /\b(?:Proxy-)?Authorization["']?\s*[:=]\s*["']?[A-Za-z][A-Za-z0-9-]*\s+([A-Za-z0-9._~+/=-]{12,})/gi, value: 1 },
  // name = "literal" or name: 'literal'; a quoted passphrase may contain spaces
  { label: '寫死的密碼或金鑰', re: new RegExp(`[A-Za-z0-9_-]*${KEYWORD}[A-Za-z0-9_-]*["']?\\s*[:=]\\s*(["'])([^"'\\n]{6,})\\1`, 'gi'), value: 2 },
  // NAME=value, name: value (env files, YAML, ini)
  { label: '寫死的密碼或金鑰', re: new RegExp(`[A-Za-z0-9_-]*${KEYWORD}[A-Za-z0-9_-]*\\s*[:=]\\s*([^\\s"',;#]{6,})`, 'gi'), value: 1, test: looksLikeValue },
  { label: '內部網路位址', re: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g },
  { label: '內部網路位址', re: /(?<![0-9A-Za-z:])(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):[0-9a-f:]{2,}/gi },
  { label: '內部主機名稱', re: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|corp|intranet|lan|local)\b/gi },
  // scheme://host:port where the host has no dot: a machine name that only resolves inside a network
  { label: '內部主機名稱', re: /[a-z][a-z0-9+.-]*:\/\/(?!localhost\b)([a-z0-9][a-z0-9-]*):\d{2,5}\b/gi },
  // bare host:port, e.g. db-prod:5432. Not preceded by a dot, slash or word character, so file.md:12 and a.b:80 are left alone.
  { label: '內部主機名稱', re: /(?<![\w./@:-])(?!localhost\b)[a-z][a-z0-9-]{2,}:\d{2,5}(?![\w:])/gi },
  { label: '電子郵件', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g },
  { label: '疑似金鑰的長字串', re: /(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{32,}(?![A-Za-z0-9_+=-])/g, value: 0, test: mixed },
]

// Never echo a finding in full: the report itself ends up in a terminal or a chat.
export const mask = (s) => (s.length <= 8 ? `${s.slice(0, 2)}…` : `${s.slice(0, 4)}…${s.slice(-2)}`)

// An allow entry clears a finding only when it equals the matched text (or the value inside an assignment) exactly.
// Short entries are refused: "@" or "." would otherwise switch off a whole class of findings.
const MIN_ALLOW = 6
export function checkAllow(allow) {
  if (allow == null) return []
  if (!Array.isArray(allow)) throw new Error('meta.allow 要寫成陣列')
  for (const a of allow) {
    if (typeof a !== 'string' || a.trim().length < MIN_ALLOW) throw new Error(`meta.allow 的每一項要是至少 ${MIN_ALLOW} 個字的完整字串，不可以是「${typeof a === 'string' ? a : typeof a}」`)
  }
  return allow.map((a) => a.trim())
}

// Findings in one piece of text: [{ label, excerpt }]. `allow` lists exact strings the owner has cleared.
export function scanText(text, allow = []) {
  const found = []
  const spans = []
  for (const rule of RULES) {
    for (const m of String(text).matchAll(rule.re)) {
      const whole = m[0].trim()
      const value = rule.value != null ? m[rule.value] : whole
      if (PLACEHOLDER.test(value)) continue
      if (rule.test && !rule.test(value)) continue
      if (allow.includes(whole) || allow.includes(value)) continue
      const from = m.index
      const to = m.index + m[0].length
      if (spans.some(([a, b]) => from < b && to > a)) continue
      spans.push([from, to])
      found.push({ label: rule.label, excerpt: mask(whole) })
    }
  }
  return found
}
