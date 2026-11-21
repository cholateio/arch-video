// Sensitive-content scanner tests. Fake credentials are assembled at run time so no real-looking literal sits in the repo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { scanText, checkAllow } from '../lib/secrets.mjs'

const fake = {
  github: `gh${'p_'}${'A1b2C3d4E5'.repeat(4)}`,
  aws: `AK${'IA'}${'ABCDEFGH12345678'}`,
  slack: `https://hooks.slack${'.com'}/services/T0000000/B0000000/${'abcdEFGH1234'}`,
  jwt: `ey${'J'}hbGciOiJIUzI1NiJ9.ey${'J'}zdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlMTIzNA`,
}
// Dummy values, split so the source never holds an assignment a secret scanner would flag.
const val = {
  dashed: ['s3cr3t', 'value', '1'].join('-'),
  plain: ['abc123', 'def456'].join(''),
  short: ['hunter', '22'].join(''),
  word: ['Wint3r', 'Is', 'Coming'].join(''),
  my: ['my', 'Prod', 'Secret123'].join(''),
  testing: ['testing', '9f8e7d'].join('-'),
  phrase: ['correct', 'horse', 'battery', 'staple'].join(' '),
}
const labels = (text, allow) => scanText(text, allow).map((f) => f.label)

test('常見的金鑰與權杖格式抓得到', () => {
  assert.deepEqual(labels(`TOKEN 是 ${fake.github}`), ['GitHub 權杖'])
  assert.deepEqual(labels(fake.aws), ['AWS 金鑰'])
  assert.deepEqual(labels(fake.slack), ['webhook 網址'])
  assert.deepEqual(labels(fake.jwt), ['JWT'])
  assert.deepEqual(labels('-----BEGIN RSA PRIVATE KEY-----'), ['私鑰'])
  assert.deepEqual(labels(`postgres://admin:${val.short}@db.example.com/app`), ['網址裡的帳號密碼'])
})

test('寫死的密碼抓得到，佔位符與程式呼叫不算', () => {
  assert.deepEqual(labels(`DB_PASSWORD = "${val.dashed}"`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels(`API_KEY=${val.plain}`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels('password: "••••••••"'), [])
  assert.deepEqual(labels('API_KEY=<your-key>'), [])
  assert.deepEqual(labels('API_KEY=${API_KEY}'), [])
  assert.deepEqual(labels('token = get_token()'), [])
  assert.deepEqual(labels('token: string'), [])
  assert.deepEqual(labels('api_key = os.environ["API_KEY"]'), [])
  assert.deepEqual(labels('讀取 token 之後才呼叫'), [])
})

test('沒加引號的設定值、授權標頭與其他常見權杖也抓得到', () => {
  assert.deepEqual(labels(`password: ${val.short}`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels(`db-password = ${val.word}`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels(`Authorization: Bearer ${'abcDEF123456'.repeat(2)}`), ['授權標頭'])
  assert.deepEqual(labels(`np${'m_'}${'a1B2c3D4e5'.repeat(4)}`), ['npm 權杖'])
  assert.deepEqual(labels(`gl${'pat-'}${'a1B2c3D4e5'.repeat(3)}`), ['GitLab 權杖'])
  assert.deepEqual(labels(`s${'k_live_'}${'a1B2c3D4e5'.repeat(3)}`), ['API 金鑰'])
})

test('帶空白的密碼、其他授權方式、沒有網域的主機、私有 IPv6 也抓得到', () => {
  assert.deepEqual(labels(`password = "${val.phrase}"`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels(`Authorization: ApiKey ${'abcDEF1234567890'}`), ['授權標頭'])
  assert.deepEqual(labels('連到 http://db-prod:5432/app'), ['內部主機名稱'])
  assert.deepEqual(labels('位址 fd12:3456:789a::1'), ['內部網路位址'])
  assert.deepEqual(labels('位址 fe80::1ff:fe23:4567:890a'), ['內部網路位址'])
  assert.deepEqual(labels('開 http://localhost:3000 看結果，時間 12:30:45'), [])
  assert.deepEqual(labels('連到 db-prod:5432'), ['內部主機名稱'])
  assert.deepEqual(labels('redis:6379 和 localhost:8080'), ['內部主機名稱'])
  assert.deepEqual(labels('docs/install.md:12  https://example.com/setup  ->  404，見 cli.py:22'), [])
})

test('佔位符要整個是佔位符才算，只是開頭像不算', () => {
  assert.deepEqual(labels(`password = "${val.my}"`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels(`password = "${val.testing}"`), ['寫死的密碼或金鑰'])
  assert.deepEqual(labels('password = "your-password"'), [])
  assert.deepEqual(labels('token: {{ token }}'), [])
})

test('混合大小寫與數字的長字串當成疑似金鑰，雜湊值與一般文字不算', () => {
  assert.deepEqual(labels(`key 是 ${'Zx9Qw3Er7Ty1'.repeat(3)}`), ['疑似金鑰的長字串'])
  assert.deepEqual(labels('commit 3f2a9c1b7d8e4f6a0b1c2d3e4f5a6b7c8d9e0f1a'), [])
  assert.deepEqual(labels('python3 scripts/check.py docs/architecture/overview.svg'), [])
})

test('內部位址、內部主機名稱與電子郵件抓得到，公開網址不算', () => {
  assert.deepEqual(labels('連到 10.12.0.5'), ['內部網路位址'])
  assert.deepEqual(labels('proxy.corp.internal:8080'), ['內部主機名稱'])
  assert.deepEqual(labels('聯絡 someone@example.com'), ['電子郵件'])
  assert.deepEqual(labels('github.com/owner/repo 與 https://example.com/docs，版本 1.2.3.4'), [])
})

test('回報時不會把機密內容完整印出來', () => {
  const [f] = scanText(fake.github)
  assert.ok(!f.excerpt.includes(fake.github.slice(6, 30)))
  assert.ok(f.excerpt.length < 12)
})

test('列在 allow 的字串放行', () => {
  assert.deepEqual(labels('聯絡 someone@example.com', ['someone@example.com']), [])
  assert.deepEqual(labels('聯絡 other@example.com', ['someone@example.com']), ['電子郵件'])
})
