// 演示模式三列布局守护：测算完成后切演示模式，断言
//   ① 三张 Card 底边对齐（三列等高，±1px）
//   ② 敏感性表窄列横滑（容器可滚）、三行制单元格不折行暴涨（数据行高 ≤ 96px）、
//     变量列 sticky 生效（横滑后首列仍贴容器左缘）
//   ③ STEP3 报告渲染区吃满等高列且内部滚动（scrollHeight > clientHeight，
//     证明报告被行高约束而非撑高整行），<lg 堆叠态不塌陷（≥ 400px）
//   ④ 执行摘要数据卡 2×2（演示窄列；sm: 视口断点在窄列会挤成 4 列显示不全）
//   ⑤ 两处分项明细表（模块② min-w-480 / 报告内 min-w-560）首列 sticky 固定
//   ⑥ 台账快照：复制按钮 → 剪贴板 TSV（身份行 + 分项表 + 关键参数段）
//   ⑦ 演示模式左缘定位书签：与工作模式书签互斥渲染、内容左右留白对称（书签不占位）、
//     落点 = 该列顶部（顶栏下方）、STEP③ 报告内部滚动归零、描边**悬浮跟随**（点击不留
//     常驻态，鼠标设备）、不引入横向溢出
//   ⑧ 演示窄列下推荐卡标题单行不折行（行数按实测行高换算，非固定像素）
//   ⑨ 空态跳转 STEP③ 后「生成方案报告」CTA 落在首屏内（演示卡片被拉伸到整行高，
//     居中会把 CTA 推到卡片中部）
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
  // 判据是结构性的：报告内容超出可视区（scrollHeight > clientHeight）即证明它是被行高约束的
  // 消费方，而非把整行撑高的驱动方——若报告参与决定行高，比值必为 1.0。
  // 比值本身随 ①/② 列高浮动（列越高 → 报告可视区越大 → 比值越接近 1），故不预设固定档，
  // 只留 1.05 的余量避免浮点抖动误判；「报告确实吃满等高列」由 ③a 与 ① 底边对齐另作兜底。
  check('③b 报告被行高约束（内部滚动不撑高整行）', demo.reportConfined != null
    && demo.reportConfined > 1.05, `内容/可视 = ${demo.reportConfined?.toFixed(2)}（>1 即证明被约束）`)
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

  // ── ⑦ 演示模式左缘定位书签（定位 + 聚焦 + 报告归零）──
  const navSel = 'nav[aria-label="模块定位导航"]'
  const stepCount = await page.locator(`${navSel} button`).count()
  const workNavCount = await page.locator('nav[aria-label="模块导航"]').count()
  check('⑦a 演示模式书签与工作模式书签互斥', stepCount === 3 && workNavCount === 0,
    `定位书签 ${stepCount} 枚 / WorkNav ${workNavCount} 个`)

  // 内容左右留白对称 ⇒ 没有为 fixed 书签加左列占位（红线：不改变现有布局形式）
  const pad = await page.evaluate(() => {
    const r = document.querySelector('main > div.grid').getBoundingClientRect()
    return {
      left: Math.round(r.left),
      right: Math.round(document.documentElement.clientWidth - r.right),
    }
  })
  check('⑦b 三列左右留白对称（书签不占位）', Math.abs(pad.left - pad.right) <= 2,
    `左 ${pad.left}px / 右 ${pad.right}px`)

  // 先把报告内部滚到底：不归零的话，跳过去看到的是上次读到的一半而非报告开头
  const before3 = await page.evaluate(() => {
    const el = document.getElementById('report-scroll')
    el.scrollTop = el.scrollHeight
    return el.scrollTop
  })
  await page.locator(`${navSel} button[aria-label^="03"]`).click()
  // 等两段平滑滚动（页面定位 + 报告内部归零）都停稳；未到位由下面的断言给出可读结果
  await page
    .waitForFunction(
      () => {
        const w = document.getElementById('demo-step-report')
        const landed =
          Math.abs(w.getBoundingClientRect().top - parseFloat(getComputedStyle(w).scrollMarginTop)) < 3
        return landed && document.getElementById('report-scroll').scrollTop === 0
      },
      { timeout: 6000 },
    )
    .catch(() => {})
  const step3 = await page.evaluate(() => {
    const w = document.getElementById('demo-step-report')
    return {
      gap: Math.round(w.getBoundingClientRect().top),
      smt: parseFloat(getComputedStyle(w).scrollMarginTop),
      headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
      // 三列 wrapper 的描边（亮绿 ring 走 box-shadow 的 rgb(30, 215, 96)）
      rings: ['diag', 'calc', 'report'].map(
        (k) => getComputedStyle(document.getElementById(`demo-step-${k}`)).boxShadow,
      ),
      reportScroll: document.getElementById('report-scroll').scrollTop,
      hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  const VOLT = '30, 215, 96'
  check('⑦c 落点为该列顶部（scroll-margin 预留顶栏，未被压住）',
    Math.abs(step3.gap - step3.smt) <= 3 && step3.smt >= step3.headerH,
    `列顶距视口 ${step3.gap}px（scroll-margin ${step3.smt} / 顶栏 ${step3.headerH}px）`)
  check('⑦d 跳转 STEP③ 报告内部滚动归零', before3 > 0 && step3.reportScroll === 0,
    `内部 scrollTop ${before3} → ${step3.reportScroll}`)
  const rings = () =>
    page.evaluate(() =>
      ['diag', 'calc', 'report'].map(
        (k) => getComputedStyle(document.getElementById(`demo-step-${k}`)).boxShadow,
      ),
    )
  const fmt = (rs) => rs.map((s) => (s === 'none' ? '无' : s.includes(VOLT) ? 'volt' : s)).join(' / ')
  // 描边规则：鼠标设备=悬浮跟随（点击不留常驻态）；触摸端=点过的书签常驻（见 mobile-check）
  check('⑦e 点击书签不留常驻描边（高亮改为悬浮跟随）', step3.rings.every((s) => s === 'none'),
    fmt(step3.rings) + '（鼠标仍停在书签上，未悬停任何列）')
  // 悬停到 ② 列可见区域（用 DOM 算点，不写死坐标）：只有该列亮
  const hoverPt = await page.evaluate(() => {
    const r = document.getElementById('demo-step-calc').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(Math.max(r.top, 0) + 40) }
  })
  await page.mouse.move(hoverPt.x, hoverPt.y)
  await page.waitForTimeout(120)
  const hovered = await rings()
  check('⑦f 悬浮列亮描边且唯一',
    hovered[1].includes(VOLT) && hovered[0] === 'none' && hovered[2] === 'none', fmt(hovered))
  const overlap = await page.evaluate(() => {
    const r = document.getElementById('demo-step-report').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(Math.max(r.top, 0) + 40) }
  })
  await page.mouse.move(overlap.x, overlap.y)
  await page.waitForTimeout(120)
  const hovered2 = await rings()
  check('⑦g 描边随鼠标换列（前一次悬停自动熄灭）',
    hovered2[2].includes(VOLT) && hovered2[1] === 'none' && hovered2[0] === 'none', fmt(hovered2))
  await page.mouse.move(4, 4) // 移到左缘空白（不在任何列内）
  await page.waitForTimeout(120)
  check('⑦h 移开鼠标描边消失', (await rings()).every((s) => s === 'none'), fmt(await rings()))
  check('⑦i 书签不引入横向溢出', step3.hOverflow <= 1, `溢出 ${step3.hOverflow}px`)

  // ── ⑧ 演示窄列：推荐卡标题单行不折行（行数 = 高 ÷ 行高，非固定像素）──
  const reco = await page.evaluate(() => {
    const head = [...document.querySelectorAll('p')].find(
      (p) => p.textContent.trim() === '方案配置推荐',
    )
    const root = head?.parentElement?.parentElement // 标题行 → 列表容器
    const el = root && [...root.querySelectorAll('span')].find((s) => s.textContent.trim() === '分布式光伏')
    if (!el) return null
    return {
      lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
      h: Math.round(el.getBoundingClientRect().height),
    }
  })
  check('⑧ 推荐卡标题单行（演示窄列不折行）', reco != null && reco.lines === 1,
    reco ? `${reco.lines} 行（高 ${reco.h}px）` : '未找到推荐标题')

  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.waitForTimeout(200)

  // ── <lg 堆叠态：报告区 min-h 兜底不塌陷 ──
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForTimeout(500)
  const stackedH = await page.evaluate(() => {
    const report = document.querySelector('.report-doc')?.parentElement
    return report ? Math.round(report.getBoundingClientRect().height) : null
  })
  check('<lg 堆叠态报告区不塌陷', stackedH != null && stackedH >= 400, `${stackedH}px`)
  await page.screenshot({ path: `${OUT}/demo-stacked.png` })

  // ── ⑨ 空态跳转 STEP③：「生成方案报告」CTA 须落在首屏内 ──
  // 本页报告已生成（CTA 分支不存在），故另起一页只走空态：①② 就绪但不生成报告
  const p2 = await context.newPage()
  const errs2 = []
  p2.on('pageerror', (e) => errs2.push(String(e)))
  await p2.goto(URL, { waitUntil: 'networkidle' })
  await p2.locator('input[placeholder="如 10000"]').fill('20000')
  await p2.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await p2.locator('button:has-text("开始诊断")').click()
  await p2.locator('text=节能潜力').first().waitFor({ timeout: 8000 })
  await p2.locator('button:has-text("填入模块② 测算")').first().click()
  await p2.waitForTimeout(400)
  await p2.locator('button:has-text("开始测算")').click()
  await p2.locator('text=组合投资').first().waitFor({ timeout: 8000 })
  await p2.locator('button[aria-pressed]:has-text("演示模式")').click()
  await p2.locator('text=三步闭环').waitFor({ timeout: 5000 })
  await p2.waitForTimeout(400)
  await p2.locator('nav[aria-label="模块定位导航"] button[aria-label^="03"]').click()
  await p2
    .waitForFunction(
      () => {
        const w = document.getElementById('demo-step-report')
        return (
          Math.abs(w.getBoundingClientRect().top - parseFloat(getComputedStyle(w).scrollMarginTop)) < 3
        )
      },
      { timeout: 6000 },
    )
    .catch(() => {})
  const cta = await p2.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('生成方案报告'),
    )
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight }
  })
  check('⑨ 跳转 STEP③ 后生成按钮在首屏内（无需滚动）',
    cta != null && cta.top >= 0 && cta.bottom <= cta.vh,
    cta ? `按钮 ${cta.top}–${cta.bottom}px / 视口高 ${cta.vh}px` : '未找到生成按钮')
  check('⑨b 空态页无渲染错误', errs2.length === 0, errs2[0] || '')
  await p2.close()

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n演示模式布局守护全部通过')
})()
