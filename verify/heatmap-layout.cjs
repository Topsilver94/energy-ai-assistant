// 布局几何验证 · 工作模式诊断页热力图位置（一次性目检辅助，不进 CI 主链路）
// 断言：①说明句在表格下方；②热力图与上方表单间距 ≥ 24px；
//       ③热力图表格底端 ≈ 右列最后一张推荐卡底端（非「填入模块②」按钮行）
const { chromium } = require('playwright')

const BASE = process.env.BASE_URL || 'http://localhost:5175'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE, { waitUntil: 'networkidle' })

  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const rect = (el) => (el ? { top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight } : null)
    // offsetTop 相对 offsetParent，同在左列/卡内可比较；跨列比较需统一到页面坐标
    const pageBottom = (el) => (el ? el.getBoundingClientRect().bottom : null)
    const pageTop = (el) => (el ? el.getBoundingClientRect().top : null)

    const byText = (sel, text) =>
      [...document.querySelectorAll(sel)].find((el) => el.textContent.trim() === text)

    const title = byText('p', '投资价值热力图')
    const desc = byText('p', '色阶为列内相对比较（回收期越短越绿）；财务列按建议规模单系统预估，非组合总账。')
    // title 的 parentElement 是标题行，热力图根节点再上一层
    const heatmapRoot = title.parentElement.parentElement
    const table = heatmapRoot.querySelector('.overflow-hidden')
    const formDesc = byText('p', '录入建筑信息与年度电费，对标行业基准，定位节能空间。')
    // 推荐卡 = rounded-lg + border + bg-ink-raised 三类齐全（模块大卡片与热力图表格都不含 bg-ink-raised，
    // 避免祖先容器混入——坑：.rounded-lg.border 单用会匹配到包含全模块的 Card 根节点）
    const recCards = [...document.querySelectorAll('.rounded-lg.border.bg-ink-raised')]
    const lastRecCard = recCards[recCards.length - 1]
    const applyBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('填入模块②'),
    )?.parentElement

    return {
      titleTop: pageTop(title),
      descTop: pageTop(desc),
      tableTop: pageTop(table),
      formDescBottom: pageBottom(formDesc),
      tableBottom: pageBottom(table),
      chargerCardBottom: pageBottom(
        recCards.find((el) => el.textContent.includes('充电桩')),
      ),
      lastRecCardBottom: pageBottom(lastRecCard),
      applyRowBottom: pageBottom(applyBtn),
      local: { title: rect(title), desc: rect(desc), table: rect(table) },
    }
  })

  const gaps = {
    formDescToHeatmapTitle: m.titleTop - m.formDescBottom,
    titleToDesc: m.descTop - m.titleTop,
    descToTable: m.tableTop - m.descTop,
    tableVsChargerCard: m.tableBottom - m.chargerCardBottom,
    tableVsLastRecCard: m.tableBottom - m.lastRecCardBottom,
    tableVsApplyRow: m.tableBottom - m.applyRowBottom,
  }
  console.log(JSON.stringify({ gaps, raw: m }, null, 2))

  const checks = [
    ['说明句在表格下方', m.descTop > m.tableTop],
    ['与上方表单间距 ≥ 24px', gaps.formDescToHeatmapTitle >= 24],
    ['表格底端与右列末张推荐卡偏差 ≤ 8px', Math.abs(gaps.tableVsLastRecCard) <= 8],
  ]
  let fail = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) fail++
  }
  await page.screenshot({ path: 'verify/shots/heatmap-layout.png', fullPage: true })
  await browser.close()
  process.exitCode = fail ? 1 : 0
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
