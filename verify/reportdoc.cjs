// 版式外壳回归核验：ReportDocument 确定性渲染的关键区块断言（本地降级路径）
// 用法：BASE_URL=<url> node verify/reportdoc.cjs（playwright 自动解析自 npx 缓存）
// 链路：完成①② → 模块③ 未填 Key 生成（本地模板降级）→ 断言报告外壳结构
const path = require('path')
const fs = require('fs')

// playwright 自动解析：先补齐 module.paths（本地 node_modules → npx 缓存），再 require
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
const BASE = process.env.BASE_URL || 'http://localhost:5173'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  const step = async (fn) => { await fn(); await page.waitForTimeout(300) }

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click())
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1000')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 5000 })
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click())
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').waitFor({ timeout: 5000 })
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click())
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 8000 })

  const text = await page.locator('.report-doc').innerText()
  const h2s = await page.locator('.report-doc h2').allInnerTexts()
  const h1count = await page.locator('.report-doc h1').count()
  const tableCount = await page.locator('.report-doc table').count()

  let fails = 0
  const check = (label, cond) => {
    if (!cond) fails++
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  }
  check('报告标题「综合能源节能改造方案」', text.includes('综合能源节能改造方案'))
  check('执行摘要数据卡（投资估算）', text.includes('投资估算'))
  check('分项明细表', text.includes('分项明细'))
  check('敏感性结论区', text.includes('敏感性分析'))
  check('参数附表「附：当次测算关键参数」', text.includes('当次测算关键参数'))
  check('报告尾（版权+免责）', text.includes('保密文件') && text.includes('免责声明'))
  check('生成方式徽章=本地模板（降级）', text.includes('本地模板（降级）'))
  const expectH2 = ['一、项目概述', '二、财务分析', '三、技术路径建议', '四、建设节奏建议', '五、预期收益与碳减排']
  check('五段正文 h2 逐字正确且仅一段', h2s.length === 5 && expectH2.every((t, i) => h2s[i].startsWith(t)))
  check('版式契约：h1 仅报告标题 1 个（正文无一级标题）', h1count === 1)
  check('版式契约：table 仅 2 个（分项明细+参数附表，正文无表格）', tableCount === 2)
  check('无 NaN 泄漏', !text.includes('NaN'))
  check('无 undefined 泄漏', !text.includes('undefined'))
  check('无 React 渲染错误', errs.length === 0)

  if (errs.length) console.log('ERR:\n' + errs.join('\n'))
  console.log(fails === 0 ? '=== 版式外壳核验通过 ===' : `=== ${fails} 项失败 ===`)
  await browser.close()
  process.exit(fails === 0 ? 0 : 1)
})()
