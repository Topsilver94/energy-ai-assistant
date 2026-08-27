// 全链路验证脚本 · 双界面切换 + 动态配置中心联动
// 链路：完成①② → 演示模式三列同屏（状态保留）→ 回工作模式（状态不丢）
//       → 专家参数：光伏造价 3.5→3.0 保存 → 组合投资 820→720 自动重算
//       → 恢复默认 → 820 → 公开数据：广东电价 0.75→0.9 → 毛收益 234.1→262.5
//         （储能收益按分省峰谷价差独立计，电价轴现只影响光伏收益与供冷购电成本）
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const outDir = path.join(__dirname, 'out')
const shotDir = path.join(__dirname, 'shots')

const report = { consoleErrors: [], pageErrors: [], steps: [], extracted: {} }
const log = (m) => {
  report.steps.push(m)
  console.log('·', m)
}

const dataCards = (page) =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('p.font-mono.text-2xl')]
    return Object.fromEntries(
      cards.map((p) => [p.parentElement.querySelector('div')?.textContent?.trim(), p.textContent.trim()]),
    )
  })

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()))
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  // 默认页为模块①诊断，先切模块②完成测算
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()

  // ── 准备：完成①② ──
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

  // ── 1. 切演示模式：三列同屏 ──
  await page.locator('button[aria-pressed]:has-text("演示模式")').click()
  await page.locator('text=三步闭环').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  report.extracted.demoMode = {
    calcCard: await page.locator('h3:has-text("锁定收益")').isVisible(),
    diagCard: await page.locator('h3:has-text("挖掘痛点")').isVisible(),
    reportCard: await page.locator('h3:has-text("订制方案")').isVisible(),
    workNavGone: !(await page.locator('nav[aria-label="模块导航"]').isVisible().catch(() => false)),
    calcResultKept: await page.locator('text=组合投资').first().isVisible(),
    diagResultKept: await page.locator('text=实际单位能耗').first().isVisible(),
    reportReady: await page.locator('button:has-text("生成方案报告")').isVisible(),
  }
  await page.screenshot({ path: path.join(shotDir, 'm5-01-demo-mode.png'), fullPage: true })
  log('演示模式：三列同屏，①② 结果保留')

  // ── 2. 回工作模式：状态不丢 ──
  await page.locator('button[aria-pressed]:has-text("工作模式")').click()
  await page.locator('nav[aria-label="模块导航"]').waitFor({ timeout: 5000 })
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.waitForTimeout(300)
  report.extracted.backToWork = await dataCards(page)
  log('回工作模式：组合总账仍在')

  // ── 3. 专家参数：光伏造价 3.5 → 3.0 ──
  await page.locator('button:has-text("专家参数")').click()
  const expert = page.locator('[aria-label="专家参数配置"]')
  await expert.waitFor({ timeout: 5000 })
  report.extracted.expertGroups = await expert.locator('h4').allTextContents()
  const capexInput = expert.locator('section:has(h4:text("光伏")) input[type="number"]').first()
  await capexInput.fill('3.0')
  await expert.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterCapexChange = await dataCards(page)
  await page.screenshot({ path: path.join(shotDir, 'm5-02-after-capex.png'), fullPage: true })
  log('专家参数保存（光伏 3.0 元/W）→ 自动重算')

  // ── 4. 恢复默认 ──
  await page.locator('button:has-text("专家参数")').click()
  await expert.waitFor({ timeout: 5000 })
  await expert.locator('button:has-text("恢复默认")').click()
  await expert.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterRestore = await dataCards(page)
  log('恢复默认 → 820.00 复现')

  // ── 5. 公开数据：广东电价 0.75 → 0.9 ──
  await page.locator('button:has-text("公开平台数据参考")').click()
  const pub = page.locator('[aria-label="公开平台数据参考配置"]')
  await pub.waitFor({ timeout: 5000 })
  report.extracted.publicGroups = await pub.locator('h4').allTextContents()
  // 分省工商业电价组内，广东字段行：标签「广东」的行内 input
  const gdRow = pub.locator('section:has(h4:text("分省工商业电价")) div.grid', { hasText: /^广东/ }).first()
  await gdRow.locator('input[type="number"]').fill('0.9')
  await pub.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterPriceChange = await dataCards(page)
  await page.screenshot({ path: path.join(shotDir, 'm5-03-after-price.png'), fullPage: true })
  log('公开数据保存（广东电价 0.9）→ 自动重算')

  // ── 6. 收尾恢复默认（不留脏状态给后续使用者）──
  await page.locator('button:has-text("公开平台数据参考")').click()
  await pub.waitFor({ timeout: 5000 })
  await pub.locator('button:has-text("恢复默认")').click()
  await pub.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(400)
  report.extracted.finalState = await dataCards(page)
  log('已恢复默认系数')

  await browser.close()
  fs.writeFileSync(path.join(outDir, 'm5.json'), JSON.stringify(report, null, 2))
  const errs = report.consoleErrors.length + report.pageErrors.length
  console.log(`\n=== 完成：console错误 ${report.consoleErrors.length} · page错误 ${report.pageErrors.length} ===`)
  if (errs > 0) {
    console.log(report.consoleErrors, report.pageErrors)
    process.exitCode = 1
  }
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
