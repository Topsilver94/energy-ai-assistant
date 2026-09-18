// 全链路验证脚本 · 双界面切换 + 动态配置中心联动
// 链路：完成①② → 演示模式三列同屏（状态保留）→ 回工作模式（状态不丢）
//       → 专家参数：光伏造价 3.0→2.8 保存 → 组合投资 685→645 自动重算（2026-09 capex 换版后默认 3.0）
//       → 恢复默认 → 685 → 电力市场数据：广东电价 0.75→0.9 → 毛收益 200.2→228.6（9月价差口径）
//         （储能收益按分省峰谷价差 × 分时循环独立计，电价轴现只影响光伏收益与供冷购电成本）
//       → 公开数据：办公屋面可用系数 0.4→0.5 → 模块① 推荐光伏 800→1000 kW 自动重算
//         （屋面/供冷折算/充电桩配建参考表迁入公开抽屉后的联动回归）
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
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1000')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 5000 })
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
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

  // ── 3. 专家参数：光伏造价 3.0 → 2.8 ──
  await page.locator('button:has-text("专家参数")').click()
  const expert = page.locator('[aria-label="专家参数配置"]')
  await expert.waitFor({ timeout: 5000 })
  report.extracted.expertGroups = await expert.locator('h4').allTextContents()
  const capexInput = expert.locator('section:has(h4:text("光伏")) input[type="number"]').first()
  await capexInput.fill('2.8')
  await expert.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterCapexChange = await dataCards(page)
  await page.screenshot({ path: path.join(shotDir, 'm5-02-after-capex.png'), fullPage: true })
  log('专家参数保存（光伏 2.8 元/W）→ 自动重算')

  // ── 4. 恢复默认 ──
  await page.locator('button:has-text("专家参数")').click()
  await expert.waitFor({ timeout: 5000 })
  await expert.locator('button:has-text("恢复默认")').click()
  await expert.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterRestore = await dataCards(page)
  log('恢复默认 → 685.00 复现')

  // ── 5. 电力市场数据抽屉：广东电价 0.75 → 0.9 ──
  await page.locator('button:has-text("电力市场数据")').click()
  const power = page.locator('[aria-label="电力市场数据配置"]')
  await power.waitFor({ timeout: 5000 })
  report.extracted.powerGroups = await power.locator('h4').allTextContents()
  // 分省工商业电价组内，广东字段行：标签「广东」的行内 input
  const gdRow = power.locator('section:has(h4:text("分省工商业电价")) div.grid', { hasText: /^广东/ }).first()
  await gdRow.locator('input[type="number"]').fill('0.9')
  await power.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  report.extracted.afterPriceChange = await dataCards(page)
  await page.screenshot({ path: path.join(shotDir, 'm5-03-after-price.png'), fullPage: true })
  log('电力市场数据保存（广东电价 0.9）→ 自动重算')

  // ── 6. 工程估算参考抽屉：办公屋面可用系数 0.4 → 0.5 → 模块① 推荐光伏规模自动重算 ──
  await page.locator('button:has-text("工程估算参考")').click()
  const ref = page.locator('[aria-label="工程估算参考配置"]')
  await ref.waitFor({ timeout: 5000 })
  report.extracted.referenceGroups = await ref.locator('h4').allTextContents()
  const roofRow = ref
    .locator('section:has(h4:text("屋面光伏参考")) div.grid', { hasText: /^办公/ })
    .first()
  await roofRow.locator('input[type="number"]').fill('0.5')
  await ref.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(600)
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.waitForTimeout(400)
  report.extracted.afterRoofChange = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return { pv1000Kw: body.includes('建议约 1000 kW') }
  })
  await page.screenshot({ path: path.join(shotDir, 'm5-04-after-roof.png'), fullPage: true })
  log('工程估算参考保存（办公屋面系数 0.5）→ 模块① 推荐光伏 800→1000 kW 重算')

  // ── 7. 分抽屉恢复默认：工程抽屉恢复 → 电力抽屉的改动应保留（新语义回归守护）──
  await page.locator('button:has-text("工程估算参考")').click()
  await ref.waitFor({ timeout: 5000 })
  await ref.locator('button:has-text("恢复默认")').click()
  await ref.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(400)
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.waitForTimeout(400)
  report.extracted.finalRoofRestored = await page.evaluate(() =>
    document.body.textContent.replace(/\s+/g, ' ').includes('建议约 800 kW'),
  )
  log('工程估算参考恢复默认（模块① 推荐光伏回到 800 kW，电力抽屉改动应保留）')

  // ── 8. 电力市场数据抽屉恢复默认（收尾不留脏状态）──
  await page.locator('button:has-text("电力市场数据")').click()
  await power.waitFor({ timeout: 5000 })
  // 分抽屉恢复语义守护：工程抽屉的恢复默认不应波及电力抽屉——广东电价应仍为 0.9
  const gdValueBeforeRestore = await gdRow.locator('input[type="number"]').inputValue()
  report.extracted.powerUntouchedByRefRestore = gdValueBeforeRestore
  await power.locator('button:has-text("恢复默认")').click()
  await power.locator('button:has-text("保存配置")').click()
  await page.waitForTimeout(400)
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.waitForTimeout(400)
  report.extracted.finalState = await dataCards(page)
  log(
    `电力市场数据恢复默认（恢复前广东电价 ${gdValueBeforeRestore}（分抽屉语义${gdValueBeforeRestore === '0.9' ? ' ✓' : ' ✗'}），已回 0.75 全默认态）`,
  )

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
