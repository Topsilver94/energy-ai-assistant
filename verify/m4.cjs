// 全链路验证脚本 · 模块③ 真实 GLM-5 流式生成
// Key 经 GLM_KEY 环境变量注入（红线：不写入脚本/文件/localStorage，仅页面内存）
// 验证：测试连接成功 → 生成中打字机（内容分段增长）→ 五段结构 → 数字保真（AI 不改数）→ 分期/敏感性结论保留
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const GLM_KEY = process.env.GLM_KEY
if (!GLM_KEY) {
  console.error('缺少 GLM_KEY 环境变量')
  process.exit(1)
}

const outDir = path.join(__dirname, 'out')
const shotDir = path.join(__dirname, 'shots')

const report = { consoleErrors: [], pageErrors: [], steps: [], extracted: {} }
const log = (m) => {
  report.steps.push(m)
  console.log('·', m)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()))
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  // 默认页为模块①诊断，先切模块②完成测算
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()

  // ── 准备：完成①②（同 m3 场景：广东 光伏2MW+储能1MWh / 既有办公20000㎡电费200万） ──
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 5000 })
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').first().waitFor({ timeout: 5000 })
  log('准备完成：①② 已测算')

  // ── 1. 填入真实 Key：先测试连接 ──
  const modal = page.locator('[aria-label="API 设置"]')
  await page.locator('button:has-text("API 设置")').click()
  await modal.locator('input[placeholder="sk-..."]').waitFor({ timeout: 5000 })
  await modal.locator('input[placeholder="sk-..."]').fill(GLM_KEY)
  await modal.locator('button:has-text("测试连接")').click()
  await modal.locator('[role="status"]').waitFor({ timeout: 20000 })
  report.extracted.testConn = await modal.locator('[role="status"]').textContent()
  report.extracted.localStorageWithKey = await page.evaluate(() => JSON.stringify(localStorage))
  await modal.locator('button:has-text("保存")').click()
  await page.waitForTimeout(300)
  log(`测试连接：${report.extracted.testConn}`)

  // ── 2. 流式生成 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()

  // 打字机验证：连续采样内容长度，应呈多次增长（而非一次性出现）
  const lens = []
  const t0 = Date.now()
  const genStart = await page.locator('text=生成中').first().isVisible().catch(() => false)
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(1000)
    const len = await page.evaluate(() => {
      const el = document.querySelector('.md')
      return el ? el.textContent.length : 0
    })
    lens.push(len)
    const stillGenerating = await page.locator('text=生成中').first().isVisible().catch(() => false)
    if (len > 0 && !stillGenerating) break
    if (Date.now() - t0 > 90000) break
  }
  report.extracted.genStartIndicator = genStart
  report.extracted.contentLengths = lens
  report.extracted.elapsedSec = Math.round((Date.now() - t0) / 1000)
  log(`流式生成耗时约 ${report.extracted.elapsedSec}s，内容长度轨迹 ${lens.length} 次采样`)

  // ── 3. 结果断言 ──
  await page.waitForTimeout(500)
  report.extracted.finalText = await page.locator('.md').textContent()
  report.extracted.errorAlert = await page.locator('[role="alert"]').textContent().catch(() => null)
  await page.screenshot({ path: path.join(shotDir, 'm4-01-glm-stream.png'), fullPage: true })

  const rt = report.extracted.finalText || ''
  report.extracted.checks = {
    typewriter: lens.length >= 3 && new Set(lens).size >= 3, // 长度多次变化 = 真流式
    fiveSections: ['项目概述', '财务分析', '技术路径', '建设节奏', '预期收益'].every((s) => rt.includes(s)),
    numbersKept: {
      invest820: rt.includes('820'),
      irr205: rt.includes('20.5'),
      payback47: rt.includes('4.7'),
      carbon1405: rt.includes('1405.9') || rt.includes('1405'),
    },
    phasingKept: rt.includes('一期') || rt.includes('一次性建成'),
    sensitivityKept: rt.includes('最敏感变量') || rt.includes('敏感'),
  }

  await browser.close()
  fs.writeFileSync(path.join(outDir, 'm4.json'), JSON.stringify(report, null, 2))
  console.log('\n=== 检查结果 ===')
  console.log(JSON.stringify(report.extracted.checks, null, 1))
  const errs = report.consoleErrors.length + report.pageErrors.length
  console.log(`console错误 ${report.consoleErrors.length} · page错误 ${report.pageErrors.length}`)
  if (errs > 0) console.log(report.consoleErrors, report.pageErrors)
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
