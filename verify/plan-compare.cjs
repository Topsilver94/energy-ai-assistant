// 方案比选守护：模块② 结果区「档位由模块① 推荐自动生成」的表格口径
//   ① ①未完成时显示引导语、不出表（② 独立可用路径不被破坏）
//   ② 仅②测算过（无①诊断）→ 只出「当前配置」一档
//   ③ ①完成后档位数 = 推荐项数 + 当前配置 + 合计；档序 单项… → 当前配置 → 合计居末
//   ④ 各单项档的档位名与 ①等级 与 STEP1 推荐列表逐字一致，且保持①列表原序（不重排）
//   ⑤ 当前配置/合计两档不标①等级（—）
//   ⑥ 合计档投资 = 各单项投资之和（脚本从展示值反解，不重复实现财务公式）
//   ⑦ 当前配置档 = 上方组合总账数据卡（同一份测算结果，两处不得出现两个数）
//   ⑧ 口径说明行如实写出①诊断省份；首列 sticky（同其他数据表纪律）
//   ⑨ 省份随「填入模块②」携带：携带后② 按新省份重算（不报跨省）；未重测时改表单省份
//      不改口径行归属（数字是哪次测的就标哪个省）；重测后如实报两处口径跨省
//   ⑩ 当前配置构成逐行渲染（行数 = 已启用系统数），不拼成一行撑宽「档位」列
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
      return {
        name: lines[0],
        sub: lines[1] ?? null,
        subs: lines.slice(1), // 构成逐行渲染（一系统一行）——行数即系统数
        level: cells[1].textContent.trim(),
        cells: cells.slice(2).map((td) => td.textContent.trim()),
      }
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

// 比选口径说明行
const readNote = (page) =>
  page
    .locator('p')
    .filter({ hasText: '各档规模取① 建议值' })
    .first()
    .innerText()

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
    '②b 该档构成＝模块② 表单现值（单系统时一行）',
    only?.rows[0].subs.length === 1 && only?.rows[0].subs[0] === '光伏 2000kW',
    (only?.rows[0].subs ?? []).join(' / ') || '(无)',
  )
  const guide = (await page.locator('body').innerText()).includes('先完成模块①')
  check('②c 同屏如实提示其余档位待① 生成（不假装档位齐备）', guide)

  // ── ③ 完成① 诊断 → 比选档位自动补齐 ──
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click())
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  // 诊断有 MIN_LOADING_MS 最短加载期，期间提交钮 disabled、旧结果仍留在 DOM——等钮重新
  // 可用才是新快照落地（只等元素出现不够：第二次诊断时结果区本来就已在，会抢跑）
  await page.locator('form button[type="submit"]:not([disabled])').waitFor({ timeout: 10000 })
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
  const tail2 = (t?.rows ?? []).slice(-2).map((r) => r.name)
  check(
    '③c 档序：单项… → 当前配置 → 合计（全上）居末',
    tail2[0] === '当前配置' && (tail2[1] ?? '').startsWith('合计 · '),
    tail2.join(' → '),
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

  // ── ⑤ 汇总两档（当前配置 / 合计）不标①等级 ──
  const totals = t?.rows.slice(recs.length) ?? [] // [当前配置, 合计]
  check(
    '⑤ 当前配置/合计两档不标①等级（—）',
    totals.length === 2 && totals.every((r) => r.level === '—'),
    totals.map((r) => `${r.name}「${r.level}」`).join('、'),
  )

  // ── ⑥ 合计档投资 = 各单项投资之和（展示值反解，容差按项数×0.05 计四舍五入误差）──
  const INV = 0
  const sumInv = singles.reduce((a, r) => a + (num(r.cells[INV]) ?? 0), 0)
  const totalInv = num(totals[1]?.cells[INV])
  check(
    '⑥ 合计档投资 = 各单项投资之和',
    totalInv !== null && Math.abs(totalInv - sumInv) < Math.max(0.5, singles.length * 0.05),
    `合计 ${totalInv} vs 各项和 ${sumInv.toFixed(2)}`,
  )

  // ── ⑦ 当前配置档 = 上方组合总账数据卡（同一份测算结果）──
  const cards = await readCards(page)
  const active = totals[0]
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

  // ── ⑨ 省份随「填入模块②」携带（①② 是同一项目的两段，不得各持一个省份）──
  // 把① 省份切到安徽（默认广东）→ 重新诊断 → 一键填入 → ② 的省份选择器应为安徽
  await step(() => page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click())
  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.locator('[role="tablist"] [role="tab"]:has-text("A")').click()
  await page.locator('[role="option"]:has-text("安徽")').click()
  await page.locator('button:has-text("开始诊断")').click()
  // 必须等新省份的快照落地（旧结果此时仍在 DOM），否则点「填入」带走的是上一次的省份
  await page.locator('form button[type="submit"]:not([disabled])').waitFor({ timeout: 10000 })
  await page.waitForTimeout(300)
  await page.locator('button:has-text("填入模块②")').click()
  await page.waitForTimeout(400)
  const projProv = (await page.locator('button[aria-haspopup="listbox"]').first().textContent()).trim()
  check('⑨a 省份随「填入模块②」携带到②', projProv === '安徽', `② 省份 = ${projProv}`)

  // ⑨b 携带后② 结果区随挂载按新省份重算（工作模式切页重挂 FeasibilityResults，其重算 effect
  //     读的是表单现值）：口径行省份 = 安徽 且不再报跨省——①② 同源，没有旧省份的数字残留
  const noteFresh = await readNote(page)
  check(
    '⑨b 携带后② 按新省份重算（口径行 = 安徽，不报跨省）',
    noteFresh.includes('安徽') && !noteFresh.includes('跨省'),
    noteFresh.replace(/\s+/g, ' ').slice(-46),
  )

  // ── ⑩ 构成逐行渲染：一系统一行（拼成一行会把「档位」列撑到最宽）──
  // 再启用光伏凑成两个系统重测，行数与系统数两两对应才算数
  await page.locator('form button[aria-pressed]').first().click()
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('form button[type="submit"]:not([disabled])').waitFor({ timeout: 10000 })
  await page.waitForTimeout(300)
  const actRow = (await readTable(page))?.rows.find((r) => r.name === '当前配置')
  const enabled = await page.locator('form button[aria-pressed="true"]').count()
  check(
    '⑩ 当前配置构成行数 = 已启用系统数（两系统 → 两行，无「 + 」拼接）',
    enabled === 2 &&
      actRow?.subs.length === 2 &&
      !actRow.subs.some((l) => l.includes('+')),
    `${actRow?.subs.length ?? 0} 行 vs 启用 ${enabled} 项：${(actRow?.subs ?? []).join(' / ')}`,
  )

  // ⑨c 未重测时改表单省份，口径行不得跟着表单走：数字是安徽那次测的，就不能说成广东的
  await page.locator('button[aria-haspopup="listbox"]').first().click()
  await page.locator('[role="tablist"] [role="tab"]:has-text("G")').click()
  await page.locator('[role="option"]:has-text("广东")').click()
  await page.waitForTimeout(300)
  const noteStale = await readNote(page)
  check(
    '⑨c 改表单省份未重测：口径行仍标上次测算的省份（安徽）',
    noteStale.includes('安徽') && !noteStale.includes('广东'),
    noteStale.replace(/\s+/g, ' ').slice(-46),
  )

  // ⑨d 重测后口径行转报广东，并如实提示与① 诊断省份（安徽）跨省——两种口径并存
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('form button[type="submit"]:not([disabled])').waitFor({ timeout: 10000 })
  await page.waitForTimeout(300)
  const note2 = await readNote(page)
  check(
    '⑨d 重测后转报广东并如实报跨省（① 诊断仍是安徽）',
    note2.includes('广东') && note2.includes('跨省'),
    note2.replace(/\s+/g, ' ').slice(-46),
  )

  check('无渲染错误', errs.length === 0, errs[0] || '')
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} 项未通过: ${failures.join('、')}`)
    process.exit(1)
  }
  console.log('\n方案比选守护全部通过')
})()
