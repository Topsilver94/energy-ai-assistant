// 全链路验证脚本 · 模块① 挖掘痛点（工作模式，经 WorkNav 切页）
// 场景A 既有办公：20000㎡ · 2010年 · 年电费200万 · 广东
//   预期：强度133.3 / 潜力32.5% / 评级需改进 / 推荐分 Pv60(可考虑,0.8MW) 储48 谨慎(0.5MWh) 桩45(8桩) 冷28
//   一键填入 → 模块② 表单变为 pv=0.8 启用、其余关闭
// 场景B 新建办公：20000㎡ · 设计强度100（> 约束90 → 超标）；再测留空（按约束值预估）
//   预期：不输出节能潜力
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const outDir = path.join(__dirname, 'out')
const shotDir = path.join(__dirname, 'shots')
fs.mkdirSync(outDir, { recursive: true })

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

  // ── 场景A：既有办公 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('text=开始诊断').waitFor({ timeout: 5000 })
  log('切换到模块①')

  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(shotDir, 'm2-01-existing.png'), fullPage: true })
  log('场景A 既有诊断完成')

  // 诊断摘要（label/value 对）
  report.extracted.existingSummary = await page.evaluate(() =>
    [...document.querySelectorAll('.flex.items-baseline.justify-between')].map((el) => {
      const spans = el.querySelectorAll('span')
      return [spans[0]?.textContent.trim(), spans[1]?.textContent.trim()]
    }),
  )

  // 推荐列表：每条卡片整段文本
  report.extracted.recommendations = await page.evaluate(() => {
    const items = [...document.querySelectorAll('text-sm font-semibold')].map((h) => h.textContent.trim())
    return items
  })

  // 热力图：抓取含「匹配度」表头后的网格文本
  report.extracted.heatmap = await page.evaluate(() => {
    const all = [...document.querySelectorAll('table, .grid')]
    const hit = all.filter((el) => el.textContent.includes('匹配度'))
    return hit.map((el) => el.textContent.replace(/\s+/g, ' ').trim())
  })

  // ── 一键填入模块②（工作模式：确认后自动跳转测算页） ──
  const applyBtn = page.locator('button:has-text("填入模块② 测算")')
  report.extracted.applyBtnText = await applyBtn.textContent()
  await applyBtn.click()
  await page.locator('button:has-text("确认覆盖当前选择？")').click()
  await page.waitForTimeout(400)
  log('一键填入完成')

  // 回模块② 验证表单状态（确认后工作模式已自动跳转到该页，此点击为幂等兜底）
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.waitForTimeout(300)
  report.extracted.calcAfterApply = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('button[aria-pressed]')]
    const inputs = [...document.querySelectorAll('input[type="number"]')]
    return {
      systems: cards.map((c) => ({ text: c.textContent.trim(), pressed: c.getAttribute('aria-pressed') })),
      capacities: inputs.map((i) => ({ placeholder: i.placeholder, value: i.value })),
    }
  })
  await page.screenshot({ path: path.join(shotDir, 'm2-02-after-apply.png'), fullPage: true })
  log('已回模块② 抓取表单状态')

  // ── 场景B：新建办公，设计强度 100（约束 90 → 超标） ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('button:has-text("新建建筑")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按约束值"]').fill('100')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(shotDir, 'm2-03-new-over.png'), fullPage: true })
  log('场景B 新建（设计100 > 约束90）诊断完成')

  report.extracted.newOverSummary = await page.evaluate(() =>
    [...document.querySelectorAll('.flex.items-baseline.justify-between')].map((el) => {
      const spans = el.querySelectorAll('span')
      return [spans[0]?.textContent.trim(), spans[1]?.textContent.trim()]
    }),
  )
  report.extracted.newOverHasSavingPotential = await page.evaluate(() =>
    document.body.textContent.includes('节能潜力'),
  )

  // 新建 · 留空设计强度 → 按约束值预估
  await page.locator('input[placeholder^="留空按约束值"]').fill('')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.newBlankSummary = await page.evaluate(() =>
    [...document.querySelectorAll('.flex.items-baseline.justify-between')].map((el) => {
      const spans = el.querySelectorAll('span')
      return [spans[0]?.textContent.trim(), spans[1]?.textContent.trim()]
    }),
  )
  await page.screenshot({ path: path.join(shotDir, 'm2-04-new-blank.png'), fullPage: true })
  log('场景B-2 新建留空（按约束值预估）完成')

  await browser.close()
  fs.writeFileSync(path.join(outDir, 'm2.json'), JSON.stringify(report, null, 2))
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
