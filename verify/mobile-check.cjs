// 临时：手机端视口模拟验证（iPhone 14 口径 390×844）——横向溢出/布局断裂检测
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
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, // iPhone 14 逻辑像素
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })

  const audit = async (label) => {
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      headerH: document.querySelector('header')?.offsetHeight ?? 0,
    }))
    console.log(`${label}: 视口${m.innerW} 内容宽${m.scrollW} ${m.hOverflow ? '❌ 横向溢出 ' + (m.scrollW - m.innerW) + 'px' : '✓ 无横溢'} 页头高${m.headerH}px`)
    return m
  }

  await audit('①诊断页')
  await page.screenshot({ path: 'verify/shots/mobile-1-diag.png', fullPage: true })
  // ②测算页
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.waitForTimeout(400)
  await audit('②测算页')
  await page.screenshot({ path: 'verify/shots/mobile-2-calc.png', fullPage: true })
  // ③方案页
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.waitForTimeout(400)
  await audit('③方案页')
  await page.screenshot({ path: 'verify/shots/mobile-3-report.png', fullPage: true })
  // ④页头四入口换行检查
  const headerBtns = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')]
    const rects = btns.map((b) => Math.round(b.getBoundingClientRect().top))
    return { n: btns.length, rows: [...new Set(rects)].length }
  })
  console.log(`页头按钮: ${headerBtns.n} 个，占 ${headerBtns.rows} 行`)
  console.log('渲染错误:', errs.length === 0 ? '无 ✓' : errs.slice(0, 3))
  await browser.close()
})()
