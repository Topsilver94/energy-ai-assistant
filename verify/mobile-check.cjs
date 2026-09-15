// 手机端视口守护（390×844 iPhone 口径）——用户真机发现的四类移动问题的硬断言回归：
//   ① 页头（标题 + 四入口按钮）窄屏不横向溢出
//   ② 工作模式三页无全局横向溢出；窄屏渲染 WorkTabs（WorkNav 悬浮书签须隐藏）
//   ③ 省份索引栏（模块①② 同构）可点开、字母索引条/选项可用
//   ④ 本地模板生成后「导出 PDF」在手机环境给出引导反馈（不再「点了没反应」）
//   外加：演示模式（≥1024 三列 / 窄屏单列）内容不超出右缘、三列等宽、
// 左缘定位书签收起态落在左留白内不遮信息、点击后落到该列顶部（顶栏不压住）、
// 触摸端点书签后该列常驻亮绿描边（无 hover 设备时的聚焦反馈）。
// 依赖：dev server 运行中（默认 :5175，可 BASE_URL 覆盖）；本地模板降级，无需 API Key。
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:5175'
const outDir = path.join(__dirname, 'out')
const shotDir = path.join(__dirname, 'shots')

const report = { consoleErrors: [], steps: [] }
const note = (m) => {
  report.steps.push(m)
  console.log('·', m)
}
const fail = (m) => {
  report.steps.push('❌ ' + m)
  console.log('  ❌ ' + m)
}

// 断言：页面 documentElement 无横向溢出（宽出视口 >1px 即失败）
const assertNoHOverflow = async (page, label) => {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }))
  const overflow = m.scrollW - m.innerW
  if (overflow > 1) fail(`${label}：全局横向溢出 ${overflow}px（内容 ${m.scrollW} / 视口 ${m.innerW}）`)
  else note(`${label}：无横向溢出（${m.scrollW}/${m.innerW}）`)
  return m
}

// 断言：演示模式左缘书签不遮信息——收起态宽度 ≤ 内容左缘的可让空间即零重叠
// （fixed 贴边不占位，故判据是「书签右缘 ≤ 网格左缘」，与具体像素无关）
const assertNavClear = async (page, label) => {
  const m = await page.evaluate(() => {
    const btns = document.querySelectorAll('nav[aria-label="模块定位导航"] button')
    const grid = document.querySelector('main > div.grid')
    if (!btns.length || !grid) return null
    const b = btns[0].getBoundingClientRect()
    return {
      n: btns.length,
      w: Math.round(b.width),
      right: Math.round(b.right),
      contentLeft: Math.round(grid.getBoundingClientRect().left),
      innerW: window.innerWidth,
    }
  })
  if (!m) fail(`${label}：未渲染定位书签`)
  else if (m.n !== 3) fail(`${label}：定位书签应为 3 枚（实际 ${m.n}）`)
  else if (m.w > m.contentLeft + 1 || m.right > m.contentLeft + 1)
    fail(`${label}：书签压住内容（收起 ${m.w}px / 右缘 ${m.right}px > 内容左缘 ${m.contentLeft}px）`)
  else if (m.right > m.innerW + 1) fail(`${label}：书签越出视口右缘`)
  else note(`${label}：书签 ${m.n} 枚收起 ${m.w}px，落在 ${m.contentLeft}px 左留白内（不遮信息）`)
  return m
}

// 断言：目标横向滚动容器自身可滑（scrollWidth > clientWidth = 卡片内横滑看全列、不外溢文档）
const measureHScroll = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    return { scroll: el.scrollWidth, client: el.clientWidth }
  }, sel)

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 逻辑像素
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push('console: ' + m.text())
  })
  page.on('pageerror', (e) => report.consoleErrors.push('page: ' + String(e)))
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const workTabs = page.locator('nav[aria-label="模块导航（移动）"]')
  const demoBtn = page.locator('button:has-text("演示模式")')

  // ── 1. 页头不溢出 + 入口按钮折叠后仍可点 ──
  const hdr = await page.evaluate(() => {
    const h = document.querySelector('header')
    return h ? { scrollW: h.scrollWidth, clientW: h.clientWidth } : null
  })
  if (!hdr) fail('页头 <header> 未找到')
  else if (hdr.scrollW - hdr.clientW > 1)
    fail(`页头横向溢出 ${hdr.scrollW - hdr.clientW}px（scrollWidth ${hdr.scrollW} / 可视 ${hdr.clientW}）`)
  else note(`页头不溢出（scrollWidth ${hdr.scrollW} / clientWidth ${hdr.clientW}）`)
  const entryBtns = await page.locator('header button[aria-label]').count()
  if (entryBtns < 4) fail(`页头入口按钮应 ≥4（实际 ${entryBtns}）`)
  else note(`页头入口按钮 ${entryBtns} 个（窄屏图标化）均可见`)

  // 窄屏导航：WorkNav 隐藏、WorkTabs 顶部分页可见
  if (await page.locator('nav[aria-label="模块导航"]').isVisible())
    fail('窄屏仍显示悬浮书签 WorkNav（应被 WorkTabs 取代）')
  else note('窄屏 WorkNav 已隐藏')
  if (!(await workTabs.isVisible())) fail('窄屏未渲染 WorkTabs 顶部分页')
  else note('窄屏 WorkTabs 顶部分页可见')
  const tabsInHeader = await page.evaluate(
    () => !!document.querySelector('header nav[aria-label="模块导航（移动）"]'),
  )
  if (!tabsInHeader) fail('移动分页未并入 header（应随顶栏 sticky 常驻）')
  else note('移动分页已并入 header，随顶栏常驻')

  await assertNoHOverflow(page, '①诊断页')

  // ── ③a. 省份索引栏（模块①）：点开 → 字母索引条 → 切字母显示省 → 外部点击关闭且不改值 ──
  const pickerBtn = (page) => page.locator('button[aria-haspopup="listbox"]').first()
  const beforeProv = (await pickerBtn(page).textContent()).trim()
  await pickerBtn(page).click()
  if (!(await page.locator('[role="tablist"]').isVisible())) fail('省份选择浮层未展开字母索引条')
  else note('模块① 省索引浮层已展开（字母索引条可见）')
  await page.locator('[role="tablist"] [role="tab"]:has-text("A")').click()
  const aProvision = await page.locator('[role="option"]:has-text("安徽")').isVisible()
  if (!aProvision) fail('点字母 A 后未显示「安徽」选项')
  else note('索引条切 A 组显示安徽')
  await page.mouse.click(2, 600) // 浮层外点击关闭
  await page.waitForTimeout(150)
  const afterProv = (await pickerBtn(page).textContent()).trim()
  if (beforeProv !== afterProv) fail(`外部点击后省份被意外改动（${beforeProv} → ${afterProv}）`)
  else note(`外部点击关闭且值未变（${afterProv}）`)

  // 模块① 完成：既有办公 20000㎡ / 年电费 200 万（默认既有多 高）→ 本地算完
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').first().waitFor({ timeout: 5000 })
  await assertNoHOverflow(page, '①诊断结果页')
  note('模块① 诊断完成（节能潜力出结果）')
  await page.screenshot({ path: path.join(shotDir, 'mobile-1-diag.png'), fullPage: true })

  // ── ② 模块②：WorkTabs 切页 → 无横溢 → 省索引栏展开（同构组件抽验）→ 组合测算 ──
  await workTabs.locator('button:has-text("锁定收益")').click()
  await page.waitForTimeout(200)
  await assertNoHOverflow(page, '②测算页')
  await pickerBtn(page).click()
  if (!(await page.locator('[role="tablist"]').isVisible())) fail('模块② 省索引浮层未展开')
  else note('模块② 省索引浮层可展开（同构组件复用）')
  await page.mouse.click(2, 600)
  await page.waitForTimeout(150)

  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1000')
  await page.locator('button:has-text("开始测算")').click()
  // 等待测算真出结果（「组合年毛收益」仅结果态存在，空态占位不含），避免在 300ms 计算窗口内测到空态
  await page.locator('text=组合年毛收益').first().waitFor({ timeout: 5000 })
  await assertNoHOverflow(page, '②测算结果页')
  const t2 = await measureHScroll(page, 'div.overflow-x-auto')
  if (t2 && t2.scroll > t2.client)
    note(`STEP2 分项表卡片内横滑看全列（${t2.client}px → ${t2.scroll}px）`)
  else fail('STEP2 分项表未形成「卡片内横滑」容器（右列可能仍被裁）')
  note('模块② 组合测算完成')
  await page.screenshot({ path: path.join(shotDir, 'mobile-2-calc.png'), fullPage: true })

  // ── ④ 模块③：未填 Key 本地模板 → 「导出 PDF」点击须给引导反馈 ──
  await workTabs.locator('button:has-text("订制方案")').click()
  await page.waitForTimeout(200)
  await page.locator('button:has-text("生成方案报告")').click()
  const alert = page.locator('[role="alert"]')
  await alert.waitFor({ timeout: 5000 })
  const fallbackText = await alert.textContent()
  if (!/未配置 API Key|本地模板/.test(fallbackText)) fail(`本地模板降级提示异常：${fallbackText}`)
  else note('未填 Key → 本地模板降级 + amber 提示')

  await page.locator('button:has-text("导出 PDF")').click()
  await page.locator('text=不支持直接调起打印').first().waitFor({ timeout: 3000 })
  note('导出 PDF 点击有引导反馈（手机环境改走系统「分享→打印→存储为 PDF」）')
  await assertNoHOverflow(page, '③方案页')
  const t3 = await measureHScroll(page, '.report-doc .overflow-x-auto')
  if (t3 && t3.scroll > t3.client)
    note(`STEP3 分项明细卡片内横滑看全列（${t3.client}px → ${t3.scroll}px）`)
  else fail('STEP3 分项明细未形成「卡片内横滑」容器（右列可能仍被裁）')
  await page.screenshot({ path: path.join(shotDir, 'mobile-3-report.png'), fullPage: true })

  // ── 演示模式：窄屏单列无横溢 + 左缘书签不遮信息 ──
  await demoBtn.click()
  await page.waitForTimeout(300)
  await assertNoHOverflow(page, '演示模式（390 单列）')
  await assertNavClear(page, '演示模式（390 单列）')

  // 点 STEP③ → 平滑定位到该列顶部（scroll-margin 预留顶栏，列顶不被压住）
  await page.locator('nav[aria-label="模块定位导航"] button[aria-label^="03"]').click()
  await page
    .waitForFunction(
      () => {
        const w = document.getElementById('demo-step-report')
        return (
          Math.abs(w.getBoundingClientRect().top - parseFloat(getComputedStyle(w).scrollMarginTop)) < 3
        )
      },
      { timeout: 10000 },
    )
    .catch(() => {})
  const land = await page.evaluate(() => {
    const w = document.getElementById('demo-step-report')
    return {
      gap: Math.round(w.getBoundingClientRect().top),
      smt: parseFloat(getComputedStyle(w).scrollMarginTop),
      headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
      scrollTop: document.getElementById('report-scroll').scrollTop,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  if (Math.abs(land.gap - land.smt) > 4 || land.smt < land.headerH)
    fail(`演示书签未落到列顶（列顶 ${land.gap}px / scroll-margin ${land.smt} / 顶栏 ${land.headerH}px）`)
  else
    note(
      `跳转 STEP③ 落到列顶 ${land.gap}px = scroll-margin ${land.smt}px（顶栏 ${land.headerH}px 未压住）` +
        `，报告内部滚动 ${land.scrollTop}px`,
    )
  if (land.overflow > 1) fail(`书签跳转后横向溢出 ${land.overflow}px`)
  // 触摸端没有真悬浮（Chrome 把 tap 当 sticky hover），故描边规则退化为
  // 「点过的书签常驻高亮」——这是触摸端唯一的聚焦反馈，须亮在该列上
  const touchRing = await page.evaluate(() => {
    const ringOf = (k) => getComputedStyle(document.getElementById(`demo-step-${k}`)).boxShadow
    return { diag: ringOf('diag'), calc: ringOf('calc'), report: ringOf('report') }
  })
  const isVolt = (s) => s.includes('30, 215, 96')
  if (!isVolt(touchRing.report) || isVolt(touchRing.diag) || isVolt(touchRing.calc))
    fail(
      `触摸端描边应只在点过的列上（诊断 ${touchRing.diag} / 测算 ${touchRing.calc} / 方案 ${touchRing.report}）`,
    )
  else note('触摸端点书签后该列常驻亮绿描边（无 hover 时的聚焦反馈）')
  await page.screenshot({ path: path.join(shotDir, 'mobile-4-demo.png'), fullPage: true })
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.waitForTimeout(200)

  // ── 演示模式：拉宽到 ≥1024 三列等宽、第三列不越右缘（store 数据随模式切换保留） ──
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(400)
  const cols = await page.evaluate(() => {
    const h3 = [...document.querySelectorAll('h3')].find((el) => el.textContent.trim() === '订制方案')
    if (!h3) return null
    const grid = h3.closest('.grid')
    const items = grid
      ? [...grid.children].map((c) => {
          const r = c.getBoundingClientRect()
          return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }
        })
      : []
    return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, items }
  })
  if (!cols || !cols.items || cols.items.length < 3) fail('演示模式（1280）未找到三列网格')
  else {
    const [c1, c2, c3] = cols.items
    const widths = [c1.w, c2.w, c3.w]
    const maxW = Math.max(...widths)
    const uneven = widths.some((w) => Math.abs(w - maxW) / maxW > 0.05)
    const rightOut = cols.items.some((c) => c.r > cols.innerW + 1)
    const gridOverflow = cols.scrollW - cols.innerW
    if (uneven) fail(`演示三列不等宽（${widths.join('/')}px）`)
    else note(`演示三列等宽（${widths.join('/')}px）`)
    if (rightOut) fail('演示第三列越出右缘（内容右溢）')
    else note('演示第三列在视口内（右缘不越界）')
    if (gridOverflow > 1) fail(`演示网格横向溢出 ${gridOverflow}px`)
    else note(`演示网格无横向溢出（${cols.scrollW}/${cols.innerW}）`)
  }
  await assertNavClear(page, '演示模式（1280 三列）')
  await page.screenshot({ path: path.join(shotDir, 'mobile-5-demo-3col.png'), fullPage: true })

  await browser.close()

  const fails = report.steps.filter((s) => s.startsWith('❌')).length
  fs.writeFileSync(path.join(outDir, 'mobile.json'), JSON.stringify(report, null, 2))
  console.log(`\n=== 完成：失败 ${fails} 项 · console/page 错误 ${report.consoleErrors.length} 项 ===`)
  if (report.consoleErrors.length) console.log(report.consoleErrors.slice(0, 5))
  if (fails > 0 || report.consoleErrors.length > 0) process.exitCode = 1
})().catch((e) => {
  console.error('SCRIPT FAILED:', e)
  process.exit(1)
})
