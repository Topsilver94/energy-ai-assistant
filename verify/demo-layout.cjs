// 演示模式三列布局守护：测算完成后切演示模式，断言
//   ① 三张 Card 底边对齐（三列等高，±1px）
//   ② 敏感性表窄列横滑（容器可滚）且单元格不折行（数据行高 ≤ 80px）
//   ③ STEP3 报告渲染区高度 ≥ min-h 兜底，<lg 堆叠态不塌陷（≥ 400px）
// 依赖 dev server（默认 5173，DEMO_LAYOUT_URL 可覆盖）已启动
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

const URL = process.env.DEMO_LAYOUT_URL || 'http://localhost:5173'
const OUT = 'verify/out'

// 断言收集：任一失败以非零码退出（对齐 verify 套件 fail-exit 约定）
const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(URL, { waitUntil: 'networkidle' })

  // ── 就绪态：诊断 → 采纳 → 测算 → 本地模板报告（同 readme-shots 流程）──
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').first().waitFor({ timeout: 8000 })
  await page.locator('button:has-text("填入模块② 测算")').first().click()
  await page.waitForTimeout(400)
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 8000 })
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)

  // ── 演示模式三列 ──
  await page.locator('button[aria-pressed]:has-text("演示模式")').click()
  await page.locator('text=三步闭环').waitFor({ timeout: 5000 })
  await page.waitForTimeout(600)

  const demo = await page.evaluate(() => {
    // 演示模式 grid 是 main 直接子级：main > div.grid > 三个 wrapper div，
    // 各含一张 Card（wrapper 首子元素）——只量这三张，不进卡片内嵌套 grid
    const cards = [...document.querySelectorAll('main > div.grid > div')].map(
      (w) => w.firstElementChild,
    )
    const rects = cards.map((c) => c.getBoundingClientRect())
    // 敏感性表容器（overflow-x-auto + 内部 min-w 网格）与数据行
    const sens = document.querySelector('.grid.min-w-\\[560px\\]')?.parentElement
    const sensRows = sens ? [...sens.querySelectorAll(':scope > .grid')] : []
    const rowH = (el) => Math.round(el.getBoundingClientRect().height)
    // STEP3 报告渲染区（.report-doc 的滚动外层）
    const report = document.querySelector('.report-doc')?.parentElement
    return {
      cardBottoms: rects.map((r) => Math.round(r.bottom)),
      cardHeights: rects.map((r) => Math.round(r.height)),
      sensScrollable: sens ? sens.scrollWidth > sens.clientWidth : null,
      sensRowHeights: sensRows.map(rowH),
      reportH: report ? Math.round(report.getBoundingClientRect().height) : null,
    }
  })
  console.log('三列 Card 底边:', demo.cardBottoms.join(' / '), '高度:', demo.cardHeights.join(' / '))
  console.log('敏感性行高:', demo.sensRowHeights.join(' / '), '| 报告区高:', demo.reportH)

  const spread = Math.max(...demo.cardBottoms) - Math.min(...demo.cardBottoms)
  check('① 三列 Card 底边对齐', spread <= 1, `差 ${spread}px`)
  check('②a 敏感性表窄列可横滑', demo.sensScrollable === true,
    `${demo.sensScrollable ? 'scrollWidth>clientWidth' : '未溢出'}`)
  const maxRow = Math.max(...demo.sensRowHeights)
  check('②b 敏感性数据行未折行暴涨', demo.sensRowHeights.length > 0 && maxRow <= 80,
    `最高行 ${maxRow}px`)
  check('③ 报告区吃满等高列', demo.reportH != null && demo.reportH > 520,
    `${demo.reportH}px（旧上限 520）`)

  await page.screenshot({ path: `${OUT}/demo-layout.png`, fullPage: true })
  console.log(`✓ 截图 ${OUT}/demo-layout.png（整页三列）`)

  // ── <lg 堆叠态：报告区 min-h 兜底不塌陷 ──
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForTimeout(500)
  const stackedH = await page.evaluate(() => {
    const report = document.querySelector('.report-doc')?.parentElement
    return report ? Math.round(report.getBoundingClientRect().height) : null
  })
  check('<lg 堆叠态报告区不塌陷', stackedH != null && stackedH >= 400, `${stackedH}px`)
  await page.screenshot({ path: `${OUT}/demo-stacked.png` })

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n演示模式布局守护全部通过')
})()
