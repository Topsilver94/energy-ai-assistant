// 全链路验证脚本 · 模块① 锁定收益（工作模式默认页）
// 运行：NODE_PATH=<npx缓存playwright> node verify/m1.cjs
// 产出：verify/out/m1.json（控制台报错 + 抓取数值）+ verify/shots/*.png
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const outDir = path.join(__dirname, 'out')
const shotDir = path.join(__dirname, 'shots')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(shotDir, { recursive: true })

const report = { consoleErrors: [], consoleWarnings: [], pageErrors: [], steps: [], extracted: {} }
const log = (msg) => {
  report.steps.push(msg)
  console.log('·', msg)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text())
    if (m.type() === 'warning') report.consoleWarnings.push(m.text())
  })
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))

  // 1. 首屏加载
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.screenshot({ path: path.join(shotDir, 'm1-01-initial.png'), fullPage: true })
  log('首屏加载完成（工作模式 · 模块①）')

  // 2. 填入规模：光伏 2 MW（默认已选），再开储能并填 1 MWh，省份保持默认广东
  const pvInput = page.locator('label:has-text("分布式光伏 规模") input[type="number"]')
  await pvInput.fill('2')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  const storageInput = page.locator('label:has-text("储能 规模") input[type="number"]')
  await storageInput.fill('1')
  log('输入：广东 · 光伏 2MW + 储能 1MWh')

  // 3. 提交测算
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 5000 })
  await page.waitForTimeout(400) // 等 MIN_LOADING_MS 后的结果渲染稳定
  await page.screenshot({ path: path.join(shotDir, 'm1-02-results.png'), fullPage: true })
  log('测算完成，结果已渲染')

  // 4. 提取数据卡（label div → 兄弟 p 数值）
  report.extracted.dataCards = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('p.font-mono.text-2xl')]
    return cards.map((p) => ({
      label: p.parentElement.querySelector('div')?.textContent?.trim(),
      value: p.textContent.trim(),
    }))
  })

  // 5. 提取分项明细表
  report.extracted.items = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')]
    return rows.map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim().replace(/\s+/g, ' ')),
    )
  })

  // 6. 提取敏感性分析：行标签 + 每行 5 档单元格文本
  report.extracted.sensitivity = await page.evaluate(() => {
    const out = []
    // 敏感性表区域：含「单变量扰动」标题之后的网格；按行结构抓
    const blocks = [...document.querySelectorAll('.grid.grid-cols-\\[88px_repeat')]
    for (const row of blocks.slice(1)) {
      // slice(1) 跳过表头行
      const cells = [...row.children].map((c) => c.textContent.trim().replace(/\s+/g, ' '))
      out.push(cells)
    }
    return out
  })

  // 7. 敏感性结论行
  report.extracted.sensitivitySummary = await page.evaluate(() => {
    const uls = [...document.querySelectorAll('ul')]
    const target = uls.find((ul) => ul.textContent.includes('%'))
    return target ? [...target.querySelectorAll('li')].map((li) => li.textContent.trim()) : []
  })

  // 8. 边界：清空规模提交（应弹 toast 而非崩溃）
  await pvInput.fill('0')
  await page.locator('button:has-text("开始测算")').click()
  await page.waitForTimeout(600)
  const toast = await page.locator('[class*="toast"], [role="status"]').first().textContent().catch(() => null)
  report.extracted.validationToast = toast
  log('边界校验：规模 0 提交 → toast 提示')

  await browser.close()

  fs.writeFileSync(path.join(outDir, 'm1.json'), JSON.stringify(report, null, 2))
  const errCount = report.consoleErrors.length + report.pageErrors.length
  console.log(`\n=== 完成：console错误 ${report.consoleErrors.length} · page错误 ${report.pageErrors.length} ===`)
  if (errCount > 0) {
    console.log('CONSOLE ERRORS:', report.consoleErrors)
    console.log('PAGE ERRORS:', report.pageErrors)
    process.exitCode = 1
  }
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
