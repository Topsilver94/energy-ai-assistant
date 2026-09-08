// 临时：README 正式截图（1440×900 @2x retina，演示数据就绪态）
const path = require('path')
const fs = require('fs')
try { require.resolve('playwright') } catch {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'),
    path.join(process.env.APPDATA || '', 'npm-cache', '_npx'),
  ]
  for (const npx of candidates) {
    let dirs; try { dirs = fs.readdirSync(npx) } catch { continue }
    for (const d of dirs) module.paths.push(path.join(npx, d, 'node_modules'))
  }
}
const { chromium } = require('playwright')
const OUT = 'docs/screenshots'
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina 双倍输出
  })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  // ① 诊断：广东·既有办公 20000㎡·电费 200 万 → 结果态（推荐列表 + 热力图就绪）
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/01-diagnosis.png`, fullPage: true })
  console.log('✓ 01-diagnosis（诊断结果态：对标+推荐+热力图）')

  // ② 测算：采纳推荐（储能+demand）→ 组合总账 + 敏感性就绪
  await page.locator('button:has-text("填入模块② 测算")').first().click()
  await page.waitForTimeout(400)
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/02-calculator.png`, fullPage: true })
  console.log('✓ 02-calculator（测算结果态：数据卡+分项+敏感性）')

  // ③ 方案：本地模板报告（版式外壳全要素）
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/03-report.png`, fullPage: true })
  console.log('✓ 03-report（方案报告态：执行摘要+正文+附表）')

  // ④ 演示模式三列同屏全景
  await page.locator('button[aria-pressed]:has-text("演示模式")').click()
  await page.locator('text=三步闭环').waitFor({ timeout: 5000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/04-overview.png`, fullPage: false }) // 首屏即可，全貌
  console.log('✓ 04-overview（演示模式三列同屏）')

  console.log('渲染错误:', errs.length === 0 ? '无 ✓' : errs.slice(0, 2))
  await browser.close()
})()
