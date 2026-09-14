// 方案比选守护：光伏单系统测算 → 存 A → 追加储能再测 → 存 B → 断言
//   ① 对比表 5 行指标齐全（投资/年毛收益/IRR/回收期/碳减排）
//   ② Δ(A−B) 与表内 A、B 数值自洽（脚本从展示值反解，不重复实现财务公式）
//   ③ Δ 着色方向：A 占优行含 volt、B 占优行含 amber（投资 B 更高 → Δ 为负 → volt）
//   ④ 首列 sticky（同其他表格纪律）；槽位覆盖/清除语义可用
// 依赖 dev server（默认 5173，PLAN_COMPARE_URL 可覆盖）已启动
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

const URL = process.env.PLAN_COMPARE_URL || 'http://localhost:5173'

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(URL, { waitUntil: 'networkidle' })

  // ── 方案 A：光伏 2000 kW ──
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button:has-text("开始测算")').click()
  // 测算是异步的（MIN_LOADING_MS 的 setTimeout 内才 setFeasibility）：必须等本轮
  // 结果落表再存快照。A 轮若只等「组合投资」文案，占位骨架也含该词——曾靠按钮
  // disabled 意外等到；B 轮按钮已 enabled，抢跑会存进 A 的旧结果。等分项明细
  // 出现本轮系统行才是完成信号（占位区无 td，不受骨架文案干扰）
  await page.locator('td:has-text("分布式光伏")').first().waitFor({ timeout: 8000 })
  await page.locator('button:has-text("存为方案 A")').click()
  await page.locator('button:has-text("方案 A · 覆盖")').waitFor({ timeout: 3000 })

  // ── 方案 B：光伏 2000 + 储能 1000 ──
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1000')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('td:has-text("储能")').first().waitFor({ timeout: 8000 })
  await page.locator('button:has-text("存为方案 B")').click()
  await page.locator('button:has-text("方案 B · 覆盖")').waitFor({ timeout: 3000 })
  await page.waitForTimeout(300)

  // 对比表在 DOM 稳定后取数：行标签 / A / B / Δ / Δ 颜色
  const table = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table.min-w-\\[420px\\] tbody tr')]
    const pick = (tr) => {
      const tds = [...tr.children]
      const color = (el) => getComputedStyle(el).color
      return {
        label: tds[0]?.textContent.trim(),
        a: tds[1]?.textContent.trim(),
        b: tds[2]?.textContent.trim(),
        d: tds[3]?.textContent.trim(),
        dColor: tds[3] ? color(tds[3]) : null,
      }
    }
    const header = [...document.querySelectorAll('table.min-w-\\[420px\\] thead th')].map(
      (th) => th.textContent.trim(),
    )
    const firstTh = document.querySelector('table.min-w-\\[420px\\] thead th')
    return {
      header,
      rows: rows.map(pick),
      stickyPos: firstTh ? getComputedStyle(firstTh).position : null,
    }
  })
  console.log('表头:', table.header.join(' | ').replace(/\s+/g, ' '))
  table.rows.forEach((r) => console.log(`  ${r.label}: A=${r.a} B=${r.b} Δ=${r.d} (${r.dColor})`))

  // ① 5 行指标齐全
  const labels = table.rows.map((r) => r.label)
  check('① 对比表 5 行指标齐全', table.rows.length === 5
    && labels.some((l) => l?.includes('投资'))
    && labels.some((l) => l?.includes('毛收益'))
    && labels.some((l) => l === 'IRR')
    && labels.some((l) => l?.includes('回收期'))
    && labels.some((l) => l?.includes('碳减排')),
    labels.join('、'))

  // ② Δ 与 A/B 数值自洽（投资：B 加了储能应更贵 → Δ=A−B 为负）
  const num = (s) => parseFloat(s.replace(/[+%,\s]/g, ''))
  const inv = table.rows.find((r) => r.label?.includes('投资'))
  const irr = table.rows.find((r) => r.label === 'IRR')
  const invOK =
    inv && num(inv.a) - num(inv.b) - num(inv.d) < 0.15 && num(inv.d) < 0
  check('② 投资行 Δ=A−B 自洽且 B 更贵', Boolean(invOK),
    `A=${inv?.a} B=${inv?.b} Δ=${inv?.d}`)
  check('②b IRR 行 Δ 按百分点口径', Boolean(
    irr && Math.abs(num(irr.a) - num(irr.b) - num(irr.d)) < 0.15 && irr.d.endsWith('pp')),
    `A=${irr?.a} B=${irr?.b} Δ=${irr?.d}`)

  // ③ 着色方向：投资 B 更贵（Δ<0，A 省钱占优）→ volt；碳减排 B 更高（Δ<0，A 劣）→ amber
  const VOLT = 'rgb(30, 215, 96)'
  const AMBER = 'rgb(245, 158, 11)'
  const carbon = table.rows.find((r) => r.label?.includes('碳减排'))
  check('③a 投资行 Δ 着 volt（A 占优）', inv?.dColor === VOLT, `${inv?.dColor}`)
  check('③b 碳减排行 Δ 着 amber（B 占优）', carbon?.dColor === AMBER, `${carbon?.dColor} Δ=${carbon?.d}`)

  // ④ 首列 sticky（与其他数据表同纪律）
  check('④ 首列 sticky', table.stickyPos === 'sticky', `position=${table.stickyPos}`)

  // ⑤ 槽位语义：清除 A → 对比表退回提示文案；B 槽仍在
  await page.locator('button[aria-label="清除方案 A"]').click()
  await page.waitForTimeout(300)
  const afterClear = await page.evaluate(() => ({
    hasTable: Boolean(document.querySelector('table.min-w-\\[420px\\]')),
    hint: document.body.textContent.includes('再测一组配置存入另一槽位'),
  }))
  check('⑤ 清除 A 后对比表退回提示', !afterClear.hasTable && afterClear.hint,
    JSON.stringify(afterClear))

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n方案比选守护全部通过')
})()
