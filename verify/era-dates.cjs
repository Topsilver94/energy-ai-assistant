// 一次性守护 · 建成年份分流 + 数据日期常量收敛
// 1) 建造年份滑杆上限 = 当前年份（跨年自动前滚，防腐化）
// 2) 既有结果区出现「建成于 <年> · <标准代际>：<改造侧重>」
//    （1980 → 节能标准实施前；2010 → 节能 50%；2024 → 节能 65%）
// 3) 建成 ≥2022 年：GB 55015 光伏余量提示双出口（结果区年代行 + 光伏推荐触发依据）
// 4) 储能触发依据的月份文案随 coefficients.js SPREAD_AS_OF 常量（重构回归）
// 5) 新建建筑不出现年代行（无年份语义）
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const outDir = path.join(__dirname, 'out')
fs.mkdirSync(outDir, { recursive: true })

const report = { consoleErrors: [], pageErrors: [], steps: [], extracted: {}, failures: [] }
const log = (m) => {
  report.steps.push(m)
  console.log('·', m)
}
const check = (name, ok) => {
  report.extracted[name] = ok
  if (!ok) report.failures.push(name)
  console.log(`${ok ? '✓' : '✗'} ${name}`)
}
const bodyText = (page) => page.evaluate(() => document.body.textContent.replace(/\s+/g, ' '))

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()))
  page.on('pageerror', (e) => report.pageErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('text=开始诊断').waitFor({ timeout: 5000 })
  log('切换到模块①')

  // 1) 滑杆上限 = 当前年份
  const sliderMax = await page.locator('input[type="range"]').getAttribute('max')
  check('sliderMaxIsCurrentYear', sliderMax === String(new Date().getFullYear()))

  // 滑杆拨年份（React 受控组件：原生 setter + input 事件才能触发 onChange）
  const setYear = (v) =>
    page.$eval(
      'input[type="range"]',
      (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, String(val))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      },
      v,
    )
  const runDiagnosis = async () => {
    await page.locator('button:has-text("开始诊断")').click()
    await page.waitForTimeout(600)
  }

  // 2) 默认年份 2010 → 节能 50% 代际；价差月份文案经 SPREAD_AS_OF 常量渲染（回归——月份从源文件动态读取，换月不破）
  const spreadAsOf = (
    fs
      .readFileSync(path.join(__dirname, '..', 'src', 'data', 'coefficients.js'), 'utf8')
      .match(/SPREAD_AS_OF = '([^']+)'/) || []
  )[1]
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await runDiagnosis()
  let body = await bodyText(page)
  check(
    'eraLine2010',
    body.includes(
      '建成于 2010 年 · 节能 50%（GB 50189-2005）：围护基础一般，优先外窗与照明改造，机电按寿命窗口统筹替换。',
    ),
  )
  check(
    'spreadMonthViaConstant',
    Boolean(spreadAsOf) && body.includes(`（${spreadAsOf}代理购电口径）`),
  )

  // 3) 1980 → 节能标准实施前
  await setYear(1980)
  await runDiagnosis()
  body = await bodyText(page)
  check(
    'eraLine1980',
    body.includes('建成于 1980 年 · 节能标准实施前：围护保温与外窗改造优先，照明与机电升级同步统筹。'),
  )

  // 4) 2024 → 节能 65% + 光伏余量提示双出口（年代行 + 光伏推荐触发依据）
  await setYear(2024)
  await runDiagnosis()
  body = await bodyText(page)
  check(
    'eraLine2024',
    body.includes('建成于 2024 年 · 节能 65%（GB 50189-2015）：本体能效较好，改造重心转向高效机房、运行调优与光储绿电。'),
  )
  const hintCount = (body.match(/先核已装容量与屋面、并网余量/g) || []).length
  check('pvHintBothSurfaces', hintCount >= 2)
  log('年代行三档 + 2022 光伏余量提示验证完成')

  // 5) 新建建筑不出现年代行
  await page.locator('button:has-text("新建建筑")').click()
  await runDiagnosis()
  body = await bodyText(page)
  check('noEraLineForNew', !body.includes('建成于'))

  await page.screenshot({ path: path.join(__dirname, 'shots', 'era-dates.png'), fullPage: true })
  await browser.close()
  fs.writeFileSync(path.join(outDir, 'era-dates.json'), JSON.stringify(report, null, 2))
  const errs = report.consoleErrors.length + report.pageErrors.length + report.failures.length
  console.log(
    `\n=== 完成：断言失败 ${report.failures.length} · console错误 ${report.consoleErrors.length} · page错误 ${report.pageErrors.length} ===`,
  )
  if (errs > 0) {
    console.log(report.failures, report.consoleErrors, report.pageErrors)
    process.exitCode = 1
  }
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
