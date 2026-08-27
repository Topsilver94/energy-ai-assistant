// 白屏诊断：加载页面，收集 console / pageerror / 请求失败 / 根节点渲染情况
// 用法：BASE_URL=<url> NODE_PATH=<playwright路径> node verify/blank-check.cjs
const { chromium } = require('playwright')

const url = process.env.BASE_URL
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const logs = []
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} → ${r.failure()?.errorText}`))
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    logs.push(`HTTP ${resp?.status()}`)
    logs.push(`title: ${await page.title()}`)
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300))
    logs.push(`bodyText(${bodyText.length}): ${bodyText.replace(/\n/g, ' | ')}`)
    const rootLen = await page.evaluate(
      () => document.getElementById('root')?.innerHTML.length ?? -1,
    )
    logs.push(`#root innerHTML 长度: ${rootLen}`)
  } catch (e) {
    logs.push(`GOTO FAILED: ${e.message}`)
  }
  console.log(logs.join('\n') || '(无任何输出)')
  await page.screenshot({ path: 'verify/shots/blank-check.png' }).catch(() => {})
  await browser.close()
})()
