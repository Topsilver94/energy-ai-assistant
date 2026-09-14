// 演示模式三列布局守护：测算完成后切演示模式，断言
//   ① 三张 Card 底边对齐（三列等高，±1px）
//   ② 敏感性表窄列横滑（容器可滚）、三行制单元格不折行暴涨（数据行高 ≤ 96px）、
//     变量列 sticky 生效（横滑后首列仍贴容器左缘）
//   ③ STEP3 报告渲染区吃满等高列且内部滚动（scrollHeight > clientHeight，
//     证明报告被行高约束而非撑高整行），<lg 堆叠态不塌陷（≥ 400px）
//   ④ 执行摘要数据卡 2×2（演示窄列；sm: 视口断点在窄列会挤成 4 列显示不全）
//   ⑤ 两处分项明细表（模块② min-w-480 / 报告内 min-w-560）首列 sticky 固定
//   ⑥ 台账快照：复制按钮 → 剪贴板 TSV（身份行 + 分项表 + 关键参数段）
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
  // clipboard 权限：⑥ 台账快照断言要读 navigator.clipboard（localhost 属安全上下文）
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
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

  // ── 台账快照（工作态即可测）：复制 → 按钮反馈 → 剪贴板 TSV 内容 ──
  await page.locator('button:has-text("复制台账快照")').click()
  await page.locator('button:has-text("已复制")').waitFor({ timeout: 3000 })
  const ledger = await page.evaluate(() => navigator.clipboard.readText())

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
    const sens = document.querySelector('.grid.min-w-\\[420px\\]')?.parentElement
    const sensRows = sens ? [...sens.querySelectorAll(':scope > .grid')] : []
    const rowH = (el) => Math.round(el.getBoundingClientRect().height)
    // 变量列 sticky：横滑到最右后，表头行与首个数据行的首列仍贴容器左缘（容许 1px 边框）
    let sticky = null
    if (sens) {
      sens.scrollLeft = 9999
      const firstCells = sensRows.slice(0, 2).map((r) => r.firstElementChild)
      const sr = sens.getBoundingClientRect()
      sticky = {
        pos: firstCells.map((c) => getComputedStyle(c).position),
        offsets: firstCells.map((c) =>
          Math.round(c.getBoundingClientRect().left - sr.left),
        ),
      }
      sens.scrollLeft = 0
    }
    // STEP3 报告渲染区（.report-doc 的滚动外层）；内部溢出 = 报告被行高约束
    const report = document.querySelector('.report-doc')?.parentElement
    // 分项明细表首列 sticky（模块② min-w-480 与报告内 min-w-560）：横滑到最右后
    // 表头首列仍贴容器左缘（容差 1px：有边框容器偏移 1、无边框容器偏移 0）
    const tableSticky = (sel) => {
      const table = document.querySelector(sel)
      const wrap = table?.parentElement
      if (!wrap || wrap.scrollWidth <= wrap.clientWidth) return null
      wrap.scrollLeft = 9999
      const th = table.querySelector('thead th')
      const wr = wrap.getBoundingClientRect()
      const out = {
        pos: getComputedStyle(th).position,
        offset: Math.round(th.getBoundingClientRect().left - wr.left),
      }
      wrap.scrollLeft = 0
      return out
    }
    const itemTable = tableSticky('main table.min-w-\\[480px\\]')
    const reportTable = tableSticky('.report-doc table.min-w-\\[560px\\]')
    // 执行摘要数据卡（report-doc 直接子级 grid 内）：演示窄列应为 2×2（前两卡同排）
    const kpi = [...document.querySelectorAll('.report-doc > div.grid > div')].slice(0, 4)
    const kpiTops = kpi.map((c) => Math.round(c.getBoundingClientRect().top))
    return {
      cardBottoms: rects.map((r) => Math.round(r.bottom)),
      cardHeights: rects.map((r) => Math.round(r.height)),
      sensScrollable: sens ? sens.scrollWidth > sens.clientWidth : null,
      sensRowHeights: sensRows.map(rowH),
      sticky,
      reportH: report ? Math.round(report.getBoundingClientRect().height) : null,
      reportConfined: report ? report.scrollHeight / report.clientHeight : null,
      itemTable,
      reportTable,
      kpiTops,
    }
  })
  console.log('三列 Card 底边:', demo.cardBottoms.join(' / '), '高度:', demo.cardHeights.join(' / '))
  console.log(
    '敏感性行高:', demo.sensRowHeights.join(' / '),
    '| sticky:', JSON.stringify(demo.sticky),
  )
  console.log(
    '报告区高:', demo.reportH, '| 内容/可视:', demo.reportConfined?.toFixed(2),
    '| 摘要卡 top:', demo.kpiTops.join(' / '),
  )

  const spread = Math.max(...demo.cardBottoms) - Math.min(...demo.cardBottoms)
  check('① 三列 Card 底边对齐', spread <= 1, `差 ${spread}px`)
  check('②a 敏感性表窄列可横滑', demo.sensScrollable === true,
    `${demo.sensScrollable ? 'scrollWidth>clientWidth' : '未溢出'}`)
  const maxRow = Math.max(...demo.sensRowHeights)
  check('②b 敏感性数据行未折行暴涨', demo.sensRowHeights.length > 0 && maxRow <= 96,
    `最高行 ${maxRow}px（三行制）`)
  const st = demo.sticky
  check('②c 变量列 sticky 固定', st != null && st.pos.every((p) => p === 'sticky')
    && st.offsets.every((o) => Math.abs(o - 1) <= 1),
    `position=${st?.pos.join('/')} 左缘偏移=${st?.offsets.join('/')}px`)
  check('③a 报告区吃满等高列', demo.reportH != null && demo.reportH > 520,
    `${demo.reportH}px（旧上限 520）`)
  check('③b 报告被行高约束（内部滚动不撑高整行）', demo.reportConfined != null
    && demo.reportConfined > 1.2, `内容/可视 = ${demo.reportConfined?.toFixed(2)}`)
  check('④ 执行摘要卡 2×2', demo.kpiTops.length === 4
    && Math.abs(demo.kpiTops[0] - demo.kpiTops[1]) <= 1
    && demo.kpiTops[2] > demo.kpiTops[0] + 10,
    `top = ${demo.kpiTops.join(' / ')}`)
  const ts = (t) =>
    t != null && t.pos === 'sticky' && Math.abs(t.offset - 1) <= 1
      ? `position=${t.pos} 左缘偏移=${t.offset}px`
      : null
  check('⑤a 模块② 分项明细首列 sticky', !!ts(demo.itemTable), ts(demo.itemTable) || JSON.stringify(demo.itemTable))
  check('⑤b 报告分项明细首列 sticky', !!ts(demo.reportTable), ts(demo.reportTable) || JSON.stringify(demo.reportTable))
  check('⑥ 台账快照剪贴板 TSV', ledger.includes('系统\t规模')
    && ledger.includes('合计\t—\t') && ledger.includes('关键参数')
    && ledger.includes('数据版本'),
    `首行「${ledger.split('\n')[0]}」，共 ${ledger.split('\n').length} 行`)

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
