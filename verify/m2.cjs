// 全链路验证脚本 · 模块① 挖掘痛点（工作模式，经 WorkNav 切页）
// 场景A 既有办公：20000㎡ · 2010年 · 年电费200万 · 广东
//   预期：强度133.3 / 潜力25.0%（基准100，商务办公口径）/ 评级需改进 / 推荐分 储72(可考虑,800kWh 双口径定容) Pv60(可考虑,800kW) 桩45(8桩) 冷28
//         （储能按广东 2026年8月 实际峰谷价差 1.2655 元/kWh 判定，升至可考虑档并居首；25%<30% 措施不再标重点）
//   一键填入 → 模块② 表单变为 pv=800 与 storage=800 启用（可考虑档全采纳）、其余关闭
// 场景B 新建办公：20000㎡ · 设计强度120（> 约束100 → 超标）；再测留空（按约束值预估）
//   预期：不输出节能潜力
// 场景D 既有商场 20000㎡：集中供冷双口径回归
//   预期：占比0.9 → 供冷面积1.8万㎡ · 折算设计冷负荷3600kW（负荷指标200 W/㎡，手册区间中值）
// 场景E 屋面类型分支：既有办公·坡屋面 → 728kW；新建办公 → BIPV满铺 1008kW（平屋面典型=场景A 800kW）
// 场景F 电费未知兜底：F1 留空 → 面积口径 115×20000=230万kWh → 潜力 13.0%（预估标注）
//   F2 变压器实填 1100kVA → 变压器口径 216.8万 < 面积口径 230万 → 取短板，强度 108.4
//   F3 月均电费 16万 → 年 192万 ÷ 0.75 = 256万kWh → 强度 128.0，转实测口径（预估卡消失）
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

  // 推荐列表：每条卡片标题（text-sm font-semibold 类名齐全的标题元素）
  report.extracted.recommendations = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.text-sm.font-semibold')].map((h) => h.textContent.trim())
    return items
  })

  // 储能定容双口径（既有·变压器留空 → 推定 20000㎡×80VA/㎡=1600kVA → 1600×25%×2h=800；
  // 负荷口径 日均 7306kWh×0.35=2557，短板 800）+ 广东两充两放运行模式行 + 布置红线双出口之推荐侧
  report.extracted.storageSizing = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      hasLoadCaliber: body.includes('负荷口径：日均用电 7,306 kWh'),
      hasTrafoCaliber: body.includes('变压器口径：按办公 80 VA/㎡ 推定约 1,600 kVA'),
      hasShortfall: body.includes('按短板定容约 800 kWh'),
      hasTwoCycleMode: body.includes('广东分时结构支持两充两放（谷充峰放全额价差 + 平充峰放约半额价差）'),
      hasFireLine: body.includes('布置红线：户外电池舱（柜）间防火间距 ≥3 m'),
    }
  })

  // 热力图：抓取含「匹配度」表头后的网格文本
  report.extracted.heatmap = await page.evaluate(() => {
    const all = [...document.querySelectorAll('table, .grid')]
    const hit = all.filter((el) => el.textContent.includes('匹配度'))
    return hit.map((el) => el.textContent.replace(/\s+/g, ' ').trim())
  })

  // ── 一键填入模块②（单击即填入，工作模式自动跳转测算页） ──
  const applyBtn = page.locator('button:has-text("填入模块② 测算")')
  report.extracted.applyBtnText = await applyBtn.textContent()
  await applyBtn.click()
  await page.waitForTimeout(400)
  log('一键填入完成（单击，无确认弹窗）')

  // 回模块② 验证表单状态（填入后工作模式已自动跳转到该页，此点击为幂等兜底）
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

  // ── 场景B：新建办公，设计强度 120（约束 100 → 超标） ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('button:has-text("新建建筑")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按约束值"]').fill('120')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(shotDir, 'm2-03-new-over.png'), fullPage: true })
  log('场景B 新建（设计120 > 约束100）诊断完成')

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

  // ── 场景C：既有工业厂房（扩类型回归：基准180电费全口径、大屋面光伏、措施文案、热力图位置、供冷置信度降级标注） ──
  await page.locator('button:has-text("既有建筑")').click()
  await page.locator('select').first().selectOption('工业厂房')
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.industrial = await page.evaluate(() => {
    const title = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('建议措施'))
    const chips = title?.parentElement.querySelectorAll('span.inline-flex') ?? []
    return {
      measuresTitle: title?.textContent.trim(),
      chipCount: chips.length,
      hasHeatmap: document.body.textContent.includes('投资价值热力图'),
      hasPvHighScore: document.body.textContent.includes('分布式光伏'),
      coolingVerifyNote: document.body.textContent.includes('需工艺负荷资料复核'),
    }
  })
  await page.screenshot({ path: path.join(shotDir, 'm2-05-industrial.png'), fullPage: true })
  log('场景C 既有工业厂房诊断完成（新增类型回归）')

  // ── 场景D：既有商场（集中供冷双口径：占比折净 + 冷量折算） ──
  await page.locator('select').first().selectOption('商场')
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  const mallBody = await page.evaluate(() => document.body.textContent.replace(/\s+/g, ' '))
  report.extracted.mallDualCaliber = {
    hasKw: mallBody.includes('折算设计冷负荷约 3600 kW'),
    hasIndex: mallBody.includes('负荷指标 200 W/㎡'),
    hasNetArea: mallBody.includes('供冷面积 1.8 万㎡'),
    hasRatioNote: mallBody.includes('建筑面积 × 0.9 折算'),
  }
  await page.screenshot({ path: path.join(shotDir, 'm2-06-mall-cooling.png'), fullPage: true })
  log('场景D 既有商场双口径诊断完成')

  // ── 场景E：屋面类型分支（坡屋面打折 + 新建 BIPV 满铺） ──
  await page.locator('button:has-text("既有建筑")').click()
  await page.locator('select').first().selectOption('办公')
  await page.locator('select').nth(2).selectOption('坡屋面')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.roofSlope = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      has728Kw: body.includes('建议约 728 kW'),
      hasSlopeNote: body.includes('坡屋面顺坡满铺'),
    }
  })
  await page.locator('button:has-text("新建建筑")').click()
  await page.locator('select').first().selectOption('办公')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.roofBipv = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      has1008Kw: body.includes('建议约 1008 kW'),
      hasBipvNote: body.includes('新建按 BIPV 一体化满铺测算'),
      noRoofSelect: document.querySelectorAll('select').length === 2, // 仅 类型 + 省份
    }
  })
  await page.screenshot({ path: path.join(shotDir, 'm2-07-roof-bipv.png'), fullPage: true })
  log('场景E 屋面类型分支（坡屋面 + BIPV）完成')

  // ── 场景F：电费未知兜底（面积口径 → 变压器口径取短板 → 月度电费转实测） ──
  await page.locator('button:has-text("既有建筑")').click()
  await page.locator('select').first().selectOption('办公')
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder="如 80"]').fill('')
  await page.locator('input[placeholder="留空按类型指标推定"]').fill('')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.feeFallbackArea = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      hasAreaCaliber: body.includes(
        '面积口径：按办公典型实际强度 115 kWh/㎡·a × 20,000 ㎡ → 年用电约 230 万 kWh',
      ),
      hasEstimatedTag: body.includes('能耗口径 · 预估（电费未知）'),
      hasPotential13: body.includes('13.0'),
    }
  })
  await page.screenshot({ path: path.join(shotDir, 'm2-08-fee-fallback.png'), fullPage: true })
  log('场景F-1 电费留空（面积口径兜底）完成')

  // F-2：实填变压器 1100 kVA → 变压器口径 1100×0.9×0.25×8760=216.8万 < 面积口径 230万 → 取短板
  await page.locator('input[placeholder="留空按类型指标推定"]').fill('1100')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.feeFallbackTrafo = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      hasTrafoCaliber: body.includes('变压器口径：1,100 kVA × 0.9 × 0.25 负载率 × 8760h'),
      hasShortfallNote: body.includes('双口径取短板：按变压器口径'),
      hasIntensity108: body.includes('108.4'),
    }
  })
  log('场景F-2 变压器口径取短板完成')

  // F-3：切按月口径，月均 16 万 → 年 192 万 ÷ 0.75 = 256万 kWh → 强度 128.0，转实测（预估卡消失）
  await page.locator('button:has-text("按月")').click()
  await page.locator('input[placeholder="如 7"]').fill('16')
  await page.locator('button:has-text("开始诊断")').click()
  await page.waitForTimeout(600)
  report.extracted.feeMonthly = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ')
    return {
      isMeasured: !body.includes('能耗口径 · 预估（电费未知）'),
      hasIntensity128: body.includes('128.0'),
    }
  })
  await page.screenshot({ path: path.join(shotDir, 'm2-09-fee-monthly.png'), fullPage: true })
  log('场景F-3 月均电费转实测口径完成')

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
