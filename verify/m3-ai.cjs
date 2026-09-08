// AI 流式路径全链路核验（走设计主流程：①诊断 → 一键填入推荐 → ②测算 → ③生成）
// 用法：DEEPSEEK_API_KEY=<你的Key> BASE_URL=<url> node verify/m3-ai.cjs
//       （不设环境变量时改为交互输入 Key——读行不经过 shell，规避 Git Bash 粘贴损坏）
// 红线：Key 只经环境变量或交互输入进入进程内存；本脚本任何输出都不含 Key；不落任何持久化
// 断言：AI 徽章（非本地降级）、五段 h2、h1=1、table=2、无 NaN/undefined、无渲染错误
const path = require('path')
const fs = require('fs')

// playwright 自动解析：先补齐 module.paths（本地 node_modules → npx 缓存），再 require
try {
  require.resolve('playwright')
} catch {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'),
    path.join(process.env.APPDATA || '', 'npm-cache', '_npx'),
  ]
  for (const npx of candidates) {
    let dirs
    try {
      dirs = fs.readdirSync(npx)
    } catch {
      continue
    }
    for (const d of dirs) module.paths.push(path.join(npx, d, 'node_modules'))
  }
}
const { chromium } = require('playwright')

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const BASEURL = process.env.AI_BASE_URL || 'https://api.deepseek.com/chat/completions'
const MODEL = process.env.AI_MODEL || 'deepseek-v4-flash'

;(async () => {
  // Key 来源：环境变量 → verify/aikey.txt（记事本中转，规避 Git Bash 粘贴转码错乱）→ 交互输入
  let KEY = process.env.DEEPSEEK_API_KEY || ''
  const keyFile = path.join(__dirname, 'aikey.txt')
  if (!KEY && fs.existsSync(keyFile)) {
    KEY = fs.readFileSync(keyFile, 'utf8').trim()
    console.log(`· 已从 verify/aikey.txt 读取 Key（${KEY.slice(0, 5)}…${KEY.slice(-3)}）`)
  }
  if (!KEY) {
    const { createInterface } = require('readline/promises')
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    KEY = (await rl.question('请粘贴 DeepSeek API Key（回车确认，仅本次进程内存）：')).trim()
    rl.close()
  }
  if (!KEY) {
    console.error('未提供 API Key，退出')
    process.exit(2)
  }
  // 硬校验：Key 每个字符码位必须 <=255（Latin-1），否则 fetch 在发请求前就抛 TypeError →
  // 应用误报「网络中断」。这正是终端粘贴混入 CJK 字符的根因，第一时间拦截。
  if (![...KEY].every((c) => c.charCodeAt(0) <= 255)) {
    console.error('❌ Key 含非 ASCII 字符（粘贴被转码污染）。请用记事本重贴 Key 存到 verify/aikey.txt 后再跑。')
    process.exit(2)
  }
  if (!KEY.startsWith('sk-')) console.warn(`· 提示: Key 非 sk- 开头（${KEY.slice(0, 6)}…），请核对是否正确`)
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('requestfailed', (r) => errs.push(`reqfail: ${r.url().slice(0, 60)} → ${r.failure()?.errorText}`))

  console.log(`· 目标: ${BASE}  ·  模型: ${MODEL}  ·  Base URL: ${BASEURL}`)

  await page.goto(BASE, { waitUntil: 'networkidle' })

  // ── ① 挖掘痛点：既有办公 20000㎡ / 电费 200 万 → 诊断 → 等推荐 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('button:has-text("填入模块② 测算")').waitFor({ timeout: 8000 })
  // ① 仍在模块①页面：先读推荐（日志）与光伏建议规模（补填用）——一键填入会跳转，必须在跳转前读
  const recs = await page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .filter((el) => el.textContent.includes('建议规模'))
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
  )
  console.log(`· ①推荐组合: ${recs.join('  |  ') || '（无建议规模）'}`)
  const pvScale = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div.rounded-lg.border.border-line.bg-ink-raised')]
      .find((c) => c.innerText.includes('分布式光伏') && c.innerText.includes('建议规模'))
    const span = card
      ? [...card.querySelectorAll('span')].find((s) => s.textContent.includes('建议规模'))
      : null
    return span ? span.textContent.replace('建议规模', '').trim().replace(/[^\d.]/g, '') : ''
  })

  // 一键填入 → ②（推荐/可考虑 级系统自动带入）
  await page.locator('button:has-text("填入模块② 测算")').click()
  await page.locator('button:has-text("开始测算")').waitFor({ timeout: 5000 })

  // 补填分布式光伏（动态读推荐值）：推荐引擎对 20000㎡ 办公把光伏评「谨慎」，
  // 一键填入只带走 推荐/可考虑 级；这里模拟「顾问接受核心光伏建议」——用跳转前
  // 捕获的推荐规模填入，保证组合值与推荐值自洽，不硬编码。
  if (pvScale) {
    const pvToggle = page.locator('button[aria-pressed]:has-text("分布式光伏")')
    if (await pvToggle.count()) {
      if ((await pvToggle.getAttribute('aria-pressed')) !== 'true') await pvToggle.click()
    }
    const pvInput = page.locator('label:has-text("分布式光伏 规模") input')
    if ((await pvInput.count()) && !(await pvInput.inputValue())) await pvInput.fill(pvScale)
    console.log(`· 补填分布式光伏 ${pvScale} kW（推荐值，模拟顾问采纳谨慎级建议）`)
  } else {
    console.log('· 未读到光伏建议规模，跳过补填')
  }

  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 8000 })

  // ── API 设置：填 Key / Base URL / 模型名 → 保存 ──
  await page.locator('button:has-text("API 设置")').click()
  const modal = page.locator('[aria-label="API 设置"]')
  await modal.locator('input[placeholder="sk-..."]').fill(KEY)
  await modal.locator('input[type="text"]').first().fill(BASEURL)
  await modal.locator('input[type="text"]').nth(1).fill(MODEL)
  // 推理强度选「低延迟」：DeepSeek v4 推理模型，压短首段正文等待（默认「不指定」适合 GLM 直出）
  await modal.locator('button:has-text("低延迟")').click()
  await modal.locator('button:has-text("保存")').click()

  // ── ③ 生成：等 AI 流式完成（徽章从「生成中」变固定） ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 10000 })
  const badge = page.locator('.report-doc span.rounded-full')
  await badge.waitFor({ state: 'visible', timeout: 5000 })
  const t0 = Date.now()
  await page.waitForFunction(
    () => {
      const b = document.querySelector('.report-doc .rounded-full')
      return b && !b.textContent.includes('生成中')
    },
    { timeout: 180000 },
  )
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  const text = await page.locator('.report-doc').innerText()
  const badgeText = await badge.textContent()
  const h2s = await page.locator('.report-doc h2').allInnerTexts()
  const h1count = await page.locator('.report-doc h1').count()
  const tableCount = await page.locator('.report-doc table').count()
  const bodyTextLen = (await page.locator('.report-doc .md').innerText()).length

  let fails = 0
  const check = (label, cond) => {
    if (!cond) fails++
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  }
  const isAI = badgeText.trim().length > 0 && !badgeText.includes('本地模板')
  check(`AI 徽章=${badgeText.trim()}（应为 ${MODEL}，非本地降级）`, isAI)
  // 流式耗时仅对 AI 路径有意义（真实流式至少需数百毫秒）；降级路径即时返回，不判失败
  check(`流式耗时 ${elapsed}s（${isAI ? 'AI 流式' : '降级路径' }）`, isAI ? elapsed > 0.5 : true)
  check(`正文非空（${bodyTextLen} 字）`, bodyTextLen > 100)
  const expectH2 = ['一、项目概述', '二、财务分析', '三、技术路径建议', '四、建设节奏建议', '五、预期收益与碳减排']
  check('五段正文 h2 逐字正确', h2s.length === 5 && expectH2.every((t, i) => h2s[i].startsWith(t)))
  check('版式契约：h1 仅报告标题 1 个', h1count === 1)
  check('版式契约：table 仅 2 个', tableCount === 2)
  check('无 NaN 泄漏', !text.includes('NaN'))
  check('无 undefined 泄漏', !text.includes('undefined'))
  check('无 React 渲染错误', errs.length === 0)
  if (errs.length) console.log('ERR:\n' + errs.join('\n'))

  // 降级诊断：抓应用错误提示 + Node 直连复现，区分 401(Key) / 400(模型·载荷) / 429(额度·限流) / 网络
  if (!isAI) {
    const notice = await page
      .locator('[role="alert"]')
      .textContent()
      .catch(() => '（未捕获到应用错误提示）')
    console.log(`· 应用错误提示: ${notice.trim()}`)
    try {
      const res = await fetch(BASEURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      })
      const body = await res.text()
      console.log(`· Node 直连诊断: HTTP ${res.status}${body ? ' — ' + body.slice(0, 200) : ''}`)
    } catch (e) {
      console.log(`· Node 直连诊断: 网络异常 — ${e.message}`)
    }
  }

  await page.screenshot({ path: path.join(__dirname, 'shots', 'm3-ai-stream.png'), fullPage: true }).catch(() => {})
  console.log(fails === 0 ? '=== AI 流式路径核验通过 ===' : `=== ${fails} 项失败 ===`)
  await browser.close()
  process.exit(fails === 0 ? 0 : 1)
})()
