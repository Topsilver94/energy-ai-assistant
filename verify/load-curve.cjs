// 负荷曲线上传守护：合成全年 15 分钟曲线 CSV → 上传 → 断言
//   ① 摘要卡统计量（年电量/最大需量/负荷率/粒度/点数——期望值由同一生成公式反解，
//     不重复实现解析器）
//   ② 曲线优先级：电费栏 500 万与曲线同填，诊断年电量 = 曲线口径（562.8 万kWh），
//     不出现电费反推值（666.7 万kWh）；结果区挂「曲线实测」口径卡
//   ③ 实测需量传递：储能推荐触发依据含「需量基数实测」与 785 kW（曲线最大）
//   ④ 实测口径贯通：填入模块② 测算 → 生成方案（本地模板）→ 需量句须写「实测（负荷曲线口径）」，
//     不得回落「推定需量基数」（口径溯源守护）
//   ⑤ 移除回退：删曲线重诊 → 年电量回到电费反推 666.7 万kWh，口径卡消失
//   ⑥ 新建隐藏：切换新建建筑后上传位不渲染
//   ⑦ 无效文件：仅 5 个数值点 → amber 报错且不落摘要
//   ⑧ 上传说明文案契约：须写明「时间 + 功率」两列 / 单位 kW / 功率放末列——解析器
//     取行末可解析数值且不读单位，这两条边界不写在客户第一眼处就会静默算错
// 依赖 dev server（默认 5173，LOAD_CURVE_URL 可覆盖）已启动
const path = require('path')
const fs = require('fs')
try {
  require.resolve('playwright')
} catch {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'),
    path.join(process.env.APPDATA || '', 'npm-cache', '_npx'),
  ]
  for (const npx of candidates) {
    let dirs
    try {
      dirs = fs.readdirSync(npx)
    } catch {
      continue
    }
    for (const d of dirs) module.paths.push(path.join(npx, d, 'node_modules'))
  }
}
const { chromium } = require('playwright')

const URL = process.env.LOAD_CURVE_URL || 'http://localhost:5173'

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

// ── 合成全年 15 分钟曲线：365 天 × 96 点，日内锯齿 500→785 kW（q=0..95，步长 3）──
// 期望统计量（与生成式同源反解）：avg = 642.5 kW → 年电量 642.5×8760 = 5,628,300 kWh
// ≈ 563 万kWh；max = 785 kW；负荷率 642.5/785 = 81.8% → 82%
const makeCurveCsv = () => {
  const base = Date.UTC(2025, 0, 1)
  const pad = (n) => String(n).padStart(2, '0')
  const rows = []
  for (let i = 0; i < 365 * 96; i++) {
    const t = new Date(base + i * 15 * 60000)
    const ts = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
    rows.push(`${ts},${500 + (i % 96) * 3}`)
  }
  return rows.join('\n') + '\n'
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(URL, { waitUntil: 'networkidle' })

  const fileInput = page.locator('input[accept=".csv,.tsv,.txt"]')
  const bodyText = () => page.evaluate(() => document.body.textContent)

  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('label:has-text("建筑面积") input').fill('10000')
  await page.locator('label:has-text("年度电费") input').fill('500')

  // ── 上传合成曲线 ──
  await fileInput.setInputFiles({
    name: 'curve-2025.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(makeCurveCsv(), 'utf8'),
  })
  await page.locator('text=曲线实测口径已启用').waitFor({ timeout: 5000 })
  const cardText = await page.evaluate(() => document.body.textContent)

  check(
    '① 摘要卡统计量（年电量/需量/负荷率/粒度/点数）',
    cardText.includes('年电量 563 万kWh') &&
      cardText.includes('最大需量 785 kW') &&
      cardText.includes('负荷率 82%') &&
      cardText.includes('15 分钟 × 35,040 点'),
    '期望 563 万kWh · 785 kW · 82% · 15 分钟 × 35,040 点',
  )

  // ── 诊断：曲线优先于电费 ──
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=562.8').first().waitFor({ timeout: 8000 })
  const afterDiag = await bodyText()
  check(
    '② 曲线口径优先于电费反推',
    afterDiag.includes('562.8') && !afterDiag.includes('666.7') && afterDiag.includes('曲线实测'),
    '年用电量 562.8 万kWh（电费反推应得 666.7 万kWh，不得出现）',
  )
  check(
    '③ 储能推荐挂实测需量',
    afterDiag.includes('需量基数实测') && afterDiag.includes('785 kW（15 分钟口径）'),
    '触发依据应含「需量基数实测」与「785 kW（15 分钟口径）」',
  )

  // ── 实测口径贯通模块③：填入模块② → 生成方案（无 Key 走本地模板）→ 需量文案须标「实测」 ──
  //    守护口径溯源：需量基数已由曲线实测值决定，报告不得仍写成「推定需量基数」
  await page.locator('button:has-text("填入模块②")').first().click()
  await page.waitForTimeout(400)
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 8000 })
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 8000 })
  await page.waitForTimeout(500)
  const reportBody = await bodyText()
  check(
    '④ 实测需量口径贯通模块③ 报告',
    reportBody.includes('实测（负荷曲线口径）需量基数') && !reportBody.includes('推定需量基数'),
    '本地模板需量句须标「实测（负荷曲线口径）」，不得回落「推定需量基数」',
  )

  // ── 移除曲线 → 回退电费口径 ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.waitForTimeout(300)
  await page.locator('button[aria-label="移除负荷曲线"]').click()
  await page.locator('text=上传负荷曲线（选填）').waitFor({ timeout: 3000 })
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=666.7').first().waitFor({ timeout: 8000 })
  const afterRemove = await bodyText()
  check(
    '⑤ 移除后回退电费反推（666.7 万kWh）',
    afterRemove.includes('666.7') && !afterRemove.includes('曲线实测'),
    '500 万 ÷ 0.75 元 = 666.7 万kWh，口径卡应消失',
  )

  // ── 新建建筑隐藏上传位 ──
  await page.locator('button:has-text("新建建筑")').click()
  await page.waitForTimeout(200)
  const hiddenInNew = await fileInput.count()
  check('⑥ 新建建筑不渲染上传位', hiddenInNew === 0, `file input count=${hiddenInNew}`)

  // ── 无效文件：5 个数值点 → 报错不落摘要 ──
  await page.locator('button:has-text("既有建筑")').click()
  await page.waitForTimeout(200)
  await fileInput.setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      ['2025-01-01 00:00,1', '2025-01-01 00:15,2', '2025-01-01 00:30,3', '2025-01-01 00:45,4', '2025-01-01 01:00,5'].join('\n'),
      'utf8',
    ),
  })
  await page.locator('text=有效功率点仅 5 个').waitFor({ timeout: 5000 })
  const afterBad = await bodyText()
  check(
    '⑦ 无效文件 amber 报错且不落摘要',
    afterBad.includes('有效功率点仅 5 个') && !afterBad.includes('曲线实测口径已启用'),
    '不足一天阈值拦截',
  )

  // ── ⑧ 上传位文案的两条格式硬约束（解析器取行末数值 / 不读单位）──
  //    这两条只在代码里、界面上不说客户就会踩：功率后又挂电压/电流列会取错列，
  //    单位写 W 或 MW 差 1000 倍且照样算下去，故文案必须写明。
  const hintBox = page.locator('p:has-text("逐 15 分钟功率表")').first()
  const hint = (await hintBox.count()) > 0 ? (await hintBox.innerText()).replace(/\s+/g, ' ') : ''
  check(
    '⑧ 上传说明写明「两列 + 单位 kW + 功率放末列」',
    hint.includes('两列') && hint.includes('kW') && hint.includes('末列'),
    hint.slice(0, 56) || '未找到上传说明',
  )

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n负荷曲线守护全部通过')
})()
