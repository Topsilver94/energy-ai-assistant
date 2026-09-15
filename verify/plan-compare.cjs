// 方案比选守护：模块② 结果区「档位由模块① 推荐自动生成」的表格口径
//   ① ①未完成时显示引导语、不出表（② 独立可用路径不被破坏）
//   ② 仅②测算过（无①诊断）→ 只出「当前配置」一档
//   ③ ①完成后档位数 = 推荐项数 + 合计 + 当前配置
//   ④ 各单项档的档位名与 ①等级 与 STEP1 推荐列表逐字一致，且保持①列表原序（不重排）
//   ⑤ 合计/当前配置两档不标①等级（—）
//   ⑥ 合计档投资 = 各单项投资之和（脚本从展示值反解，不重复实现财务公式）
//   ⑦ 当前配置档 = 上方组合总账数据卡（同一份测算结果，两处不得出现两个数）
//   ⑧ 口径说明行如实写出①诊断省份；首列 sticky（同其他数据表纪律）
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
const num = (s) => {
  const v = parseFloat(String(s).replace(/[+%,\s]/g, ''))
  return Number.isFinite(v) ? v : null
}

// 比选表取数：档位名/构成 / ①等级 / 五列数值
const readTable = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('table.plan-compare')
    if (!t) return null
    const rows = [...t.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.children]
      const lines = cells[0].innerText.split('\n').map((s) => s.trim())
      return { name: lines[0], sub: lines[1] ?? null, level: cells[1].textContent.trim(), cells: cells.slice(2).map((td) => td.textContent.trim()) }
    })
    return {
      head: [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      rows,
      sticky: getComputedStyle(t.querySelector('thead th')).position,
    }
  })

// ①推荐列表取数：靠 RecommendationList 的 rec-* 语义钩子类，不按下标选元素
const readRecs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.rec-list > .rec-item')].map((el) => ({
      label: el.querySelector('.rec-label').textContent.trim(),
      level: el.querySelector('.rec-level').textContent.trim(),
      scale: el.querySelector('.rec-scale').textContent.replace('建议规模', '').trim(),
    })),
  )

// 组合总账数据卡取数：标签 → 数值
const readCards = (page) =>
  page.evaluate(() => {
    const out = {}
    document
      .querySelectorAll('div.rounded-lg.border.border-line.bg-ink-raised')
      .forEach((div) => {
        const p = div.querySelector(':scope > p.tabular')
        const lbl = div.querySelector(':scope > div')?.textContent.trim()
        if (p && lbl) out[lbl] = p.textContent.trim()
      })
    return out
  })

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  const step = async (fn) => {
    await fn()
    await page.waitForTimeout(300)
  }
  await page.goto(URL, { waitUntil: 'networkidle' })

  // ── ① 未测算：比选不抢在结果之前出现（本组件挂在 FeasibilityResults 内）──
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click())
  check(
    '① ②未测算时不出比选表',
    (await readTable(page)) === null && !(await page.locator('body').innerText()).includes('方案比选'),
  )

  // ── ② 仅②测算（无①诊断）→ 比选只出「当前配置」一档 + 如实提示其余档位待① 生成 ──
  // 文案比对走 body.innerText：`text=` 定位到祖先容器时 strict mode 下 isVisible() 会抛错
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button:has-text("开始测算")').click()
  // 测算在 MIN_LOADING_MS 的 setTimeout 内落结果：等分项明细出现本轮系统行才是完成信号
  await page.locator('table td:has-text("分布式光伏")').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)

  const only = await readTable(page)
  check(
    '② 无①诊断时只出「当前配置」一档',
    only?.rows.length === 1 && only.rows[0].name === '当前配置',
    `${only?.rows.length} 行：${only?.rows.map((r) => r.name).join('、')}`,
  )
  check(
    '②b 该档构成＝模块② 表单现值',
    only?.rows[0].sub === '光伏 2000kW',
    only?.rows[0].sub ?? '(无)',
  )
  const guide = (await page.locator('body').innerText()).includes('先完成模块①')
  check('②c 同屏如实提示其余档位待① 生成（不假装档位齐备）', guide)

  // ── ③ 完成① 诊断 → 比选档位自动补齐 ──
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click())
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  // 诊断有 MIN_LOADING_MS 最短加载期，骨架期也会出现「节能潜力」字样——必须等推荐列表
  // 真的挂上 DOM 才取数，否则 recs 取到空数组、后续断言全部连锁错位（曾误报 6 项失败）
  await page.locator('.rec-list > .rec-item').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
  const recs = await readRecs(page)
  check('③a ①推荐列表取到 4 项（脚本钩子可用）', recs.length === 4, `${recs.length} 项`)

  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click())
  const t = await readTable(page)
  const want = recs.length + 2 // 单项 + 合计 + 当前配置
  check(
    '③b 档位数 = 推荐项数 + 合计 + 当前配置',
    t?.rows.length === want,
    `${t?.rows.length} 行 / 期望 ${want}`,
  )

  // ── ④ 档位名与等级与① 逐字一致，且保持① 列表原序（不重排：score 是四把不同量纲的尺子）──
  const singles = t?.rows.slice(0, recs.length) ?? []
  const nameMismatch = singles.filter((r, i) => r.name !== `${recs[i].label} ${recs[i].scale}`)
  check(
    '④a 各单项档档位名 = ①系统名 + 建议规模（逐字，且保持①原序）',
    nameMismatch.length === 0,
    nameMismatch.map((r, i) => `表「${r.name}」vs ①「${recs[i].label} ${recs[i].scale}」`).join('；'),
  )
  const levelMismatch = singles.filter((r, i) => r.level !== recs[i].level)
  check(
    '④b 各单项档①等级与 STEP1 徽章一致',
    levelMismatch.length === 0,
    levelMismatch.map((r, i) => `${r.name}: 表「${r.level}」vs ①「${recs[i].level}」`).join('；'),
  )

  // ── ⑤ 汇总两档不标①等级 ──
  const totals = t?.rows.slice(recs.length) ?? []
  check(
    '⑤ 合计/当前配置两档不标①等级（—）',
    totals.length === 2 && totals.every((r) => r.level === '—'),
    totals.map((r) => `${r.name}「${r.level}」`).join('、'),
  )

  // ── ⑥ 合计档投资 = 各单项投资之和（展示值反解，容差按项数×0.05 计四舍五入误差）──
  const INV = 0
  const sumInv = singles.reduce((a, r) => a + (num(r.cells[INV]) ?? 0), 0)
  const totalInv = num(totals[0]?.cells[INV])
  check(
    '⑥ 合计档投资 = 各单项投资之和',
    totalInv !== null && Math.abs(totalInv - sumInv) < Math.max(0.5, singles.length * 0.05),
    `合计 ${totalInv} vs 各项和 ${sumInv.toFixed(2)}`,
  )

  // ── ⑦ 当前配置档 = 上方组合总账数据卡（同一份测算结果）──
  const cards = await readCards(page)
  const active = totals[1]
  const pairs = [
    ['组合投资 · 万元', active?.cells[INV], 0.05],
    ['组合 IRR', active?.cells[2], 0.05],
    ['组合回收期 · 年', active?.cells[3], 0.05],
    ['组合碳减排 · tCO₂/a', active?.cells[4], 0.05],
  ]
  const drift = pairs.filter(([lbl, cell, tol]) => {
    const a = num(cards[lbl])
    const b = num(cell)
    return a === null || b === null || Math.abs(a - b) > tol
  })
  check(
    '⑦ 当前配置档与组合总账数据卡同源（逐格一致）',
    drift.length === 0,
    drift.map(([lbl, cell]) => `${lbl}: 卡 ${cards[lbl]} vs 表 ${cell}`).join('；'),
  )

  // ── ⑧ 口径说明行 + 首列 sticky ──
  const note = await page
    .locator('p')
    .filter({ hasText: '各档规模取① 建议值' })
    .first()
    .innerText()
    .catch(() => '')
  check(
    '⑧a 口径说明行写出①诊断省份与合计口径',
    note.includes('诊断省份') && note.includes('合并现金流'),
    note.replace(/\s+/g, ' ').slice(0, 80),
  )
  check('⑧b 首列 sticky', t?.sticky === 'sticky', `position=${t?.sticky}`)

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n方案比选守护全部通过')
})()
