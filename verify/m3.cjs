// 全链路验证脚本 · 模块③ 订制方案
// 链路：锁定态 → 完成①② → 未填Key生成（本地模板降级+amber提示）→ localStorage 无Key泄漏
//       → 填无效Key重生成（401 分型提示）→ 复制按钮 → 方案数字与模块②同源
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

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))

  // ── 0. 初始锁定态 ──
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('text=数据依赖').waitFor({ timeout: 5000 })
  report.extracted.lockedVisible = await page.locator('text=请先完成前两步').isVisible()
  report.extracted.genBtnVisibleWhenLocked = await page.locator('button:has-text("生成方案报告")').isVisible()
  log('初始态：模块③ 锁定（依赖①②）')

  // ── 1. 完成①：光伏2 + 储能1 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 5000 })
  log('模块② 完成')

  // ── 2. 完成②：既有办公 20000㎡ / 电费200万 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').first().waitFor({ timeout: 5000 })
  log('模块① 完成')

  // ── 3. 模块③：未填 Key 生成 → 本地模板降级 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('[role="alert"]').waitFor({ timeout: 5000 })
  report.extracted.fallbackNotice = await page.locator('[role="alert"]').textContent()
  await page.waitForTimeout(300)
  report.extracted.reportText = await page.locator('.md').textContent()
  await page.screenshot({ path: path.join(shotDir, 'm3-01-local-fallback.png'), fullPage: true })
  log('未填 Key → 本地模板降级 + amber 提示')

  // 方案数字与模块② 同源抽查
  const rt = report.extracted.reportText || ''
  report.extracted.numberCheck = {
    invest820: rt.includes('820.00'),
    irr205: rt.includes('20.5'),
    payback47: rt.includes('4.7'),
    carbon1405: rt.includes('1405.9'),
    fiveSections: ['#'.length] && ['一、项目概述', '二、财务分析', '三、技术路径', '四、建设节奏', '五、预期收益'].every((s) => rt.includes(s) || rt.includes(s.replace(/一、|二、|三、|四、|五、/, ''))),
    phasingInjected: rt.includes('一期') || rt.includes('一次性建成'),
    sensitivityInjected: rt.includes('最敏感变量'),
  }

  // ── 4. Key 不落 localStorage ──
  report.extracted.localStorageSnapshot = await page.evaluate(() => JSON.stringify(localStorage))
  log(`localStorage 快照长度：${report.extracted.localStorageSnapshot.length}`)

  // ── 5. 填无效 Key → 401 分型提示 ──
  const modal = page.locator('[aria-label="API 设置"]')
  await page.locator('button:has-text("API 设置")').click()
  await modal.locator('input[placeholder="sk-..."]').waitFor({ timeout: 5000 })
  await modal.locator('input[placeholder="sk-..."]').fill('sk-invalid-key-for-test')
  report.extracted.localStorageAfterKey = await page.evaluate(() => JSON.stringify(localStorage))
  // 弹窗内「测试连接」：无效 Key 应得 401 分型提示（真实请求 bigmodel.cn）
  await modal.locator('button:has-text("测试连接")').click()
  await modal.locator('[role="status"]').waitFor({ timeout: 15000 })
  report.extracted.testConnResult = await modal.locator('[role="status"]').textContent()
  await page.screenshot({ path: path.join(shotDir, 'm3-02-api-modal.png') })
  await modal.locator('button:has-text("保存")').click()
  await page.waitForTimeout(300)
  log('API 弹窗：无效 Key 测试连接 + 保存')

  await page.locator('button:has-text("重新生成")').click()
  // 401 或网络错误都应有明确 amber 提示并回退本地模板
  await page.locator('[role="alert"]').waitFor({ timeout: 20000 })
  report.extracted.invalidKeyNotice = await page.locator('[role="alert"]').textContent()
  await page.screenshot({ path: path.join(shotDir, 'm3-03-invalid-key.png'), fullPage: true })
  log(`无效 Key 反馈：${report.extracted.invalidKeyNotice}`)

  // ── 6. 复制功能 ──
  await page.locator('button:has-text("复制内容")').click()
  await page.waitForTimeout(500)
  report.extracted.clipboard = await page.evaluate(() => navigator.clipboard.readText().then((t) => t.slice(0, 80)))
  report.extracted.copiedBadge = await page.locator('button:has-text("已复制")').isVisible().catch(() => false)
  log('复制按钮验证')

  await browser.close()
  fs.writeFileSync(path.join(outDir, 'm3.json'), JSON.stringify(report, null, 2))
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
