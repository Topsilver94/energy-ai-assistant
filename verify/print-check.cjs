// 打印版式核验：本地降级路径生成方案 → @media print 断言正式报告样式 + 产出 A4 PDF
// 用法：BASE_URL=<url> node verify/print-check.cjs（playwright 自动解析自 npx 缓存）
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

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = path.join(__dirname, 'out', 'print-report.pdf')

/**
 * 解析 PDF 内容流，取出每页内容盒裁剪盒，换算成实际页边距（pt→cm）。
 * Chromium 每页结构：`.24 缩放 + y 翻转 cm` → `qx qy w h re W* n` 裁剪盒。
 * 裁剪盒在内容坐标系，左/下边距 = qx×0.24，上边距 = 841.92 − (qy+h)×0.24（A4 高 841.92pt）。
 *
 * 注意：打印样式若重置 html{color-scheme:light}（打印黑边修复，见 index.css @media print），
 * Chromium 会在每页最前多画一条「整页画布」clip（左 0 上 0、占满全页）——它无边距，
 * 不是内容盒。此处取裁剪盒列表里「非占满整页」的第一条，跳过画布层，避免误判版心。
 */
function pdfMargins(pdfPath) {
  const zlib = require('zlib')
  const b = fs.readFileSync(pdfPath)
  const s = b.toString('latin1')
  const re = /stream\r?\n([\s\S]*?)endstream/g
  let m
  const margins = []
  while ((m = re.exec(s)) !== null) {
    const raw = m[1]
    const start = m.index + m[0].indexOf(raw)
    let t
    try { t = zlib.inflateSync(b.subarray(start, start + raw.length)).toString('latin1') } catch { continue }
    if (!/^\.\d+\s+0\s+0\s+-\.\d+/.test(t)) continue // 页面级 cm
    // 内容盒裁剪：Chromium 画「白画布」用 `… re\nf`（填充），真正版心裁剪盒是紧跟 `re` 直接
    // W* n 的一条（外层坐标系 `x y w h re\nW* n`）。color-scheme:light（打印黑边修复）会先画
    // 一层整页画布 `0 0 612 956 re\nf`——它 re 后是 f 非 W，故不受影响。若页面无 W 裁剪盒
    // （理论不出现）则回退取任一 re 片段兜底。
    const cre = /([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+re\s*W\*?\s*n/g
    const box = cre.exec(t)?.slice(1, 5).map(parseFloat) ?? t.match(/([\d.-]+)\s+([\d.-]+)\s+[\d.-]+\s+[\d.-]+\s+re/)?.slice(1, 3).concat([0, 0]).map(parseFloat)
    if (!box) continue
    const [qx, qy, , h] = box
    margins.push({
      left: qx * 0.24 / 72 * 2.54,
      top: (841.92 - (qy + h) * 0.24) / 72 * 2.54,
    })
  }
  return margins
}

;(async () => {
  const browser = await chromium.launch()
  // A4 宽度（21cm @96dpi ≈ 794px），让 emulated print 重排接近纸面
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))

  await page.goto(BASE, { waitUntil: 'networkidle' })

  // ① 既有办公 20000㎡ / 电费 200 万 → 诊断
  await page.locator('nav[aria-label="模块导航"] button:has-text("挖掘痛点")').click()
  await page.locator('input[placeholder="如 10000"]').fill('20000')
  await page.locator('input[placeholder^="留空按典型强度"]').fill('200')
  await page.locator('button:has-text("开始诊断")').click()
  await page.locator('text=节能潜力').waitFor({ timeout: 8000 })
  // ② 组合测算
  await page.locator('nav[aria-label="模块导航"] button:has-text("锁定收益")').click()
  await page.locator('label:has-text("分布式光伏 规模") input').fill('2000')
  await page.locator('button[aria-pressed]:has-text("储能")').click()
  await page.locator('label:has-text("储能 规模") input').fill('1000')
  await page.locator('button:has-text("开始测算")').click()
  await page.locator('text=组合投资').first().waitFor({ timeout: 8000 })
  // ③ 未填 Key → 本地模板降级（版式外壳 + 五段正文同样渲染）
  await page.locator('nav[aria-label="模块导航"] button:has-text("订制方案")').click()
  await page.locator('button:has-text("生成方案报告")').click()
  await page.locator('.report-doc').waitFor({ timeout: 8000 })

  // 切打印媒体并断言正式样式生效
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)

  const styles = await page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel))
    const any = (sel) => getComputedStyle(document.querySelectorAll(sel)[0])
    return {
      bodyBg: cs('body').backgroundColor,
      htmlScheme: cs('html').colorScheme,
      htmlBg: cs('html').backgroundColor,
      printAdjust: cs('body').printColorAdjust || cs('body').webkitPrintColorAdjust,
      reportFont: any('.report-doc').fontFamily,
      h1Font: any('.report-doc h1').fontFamily,
      h1Size: parseFloat(any('.report-doc h1').fontSize),
      mdFont: any('.md').fontFamily,
      mdSize: parseFloat(any('.md').fontSize),
      lineHeight: parseFloat(any('.md').lineHeight) / parseFloat(any('.md').fontSize),
      labelWeight: any('.report-doc .tracking-widest').fontWeight,
      cardBg: any('.report-doc .grid > div').backgroundColor,
      theadBg: any('.report-doc thead').backgroundColor,
      tableBreak: any('.report-doc table').breakInside,
      headerBreak: cs('.report-doc > div').breakInside,
      orphans: parseFloat(any('.md p').orphans),
      voltColor: any('.report-doc .text-volt').color,
      reportPadLeft: parseFloat(any('.report-doc').paddingLeft),
      reportPadTop: parseFloat(any('.report-doc').paddingTop),
      badgeDisplay: cs('.report-doc .rounded-full').display,
      thBorderStyle: any('.report-doc table th').borderBottomStyle,
      thBorderW: parseFloat(any('.report-doc table th').borderBottomWidth),
      numericAlign: any('.report-doc table td:nth-child(2)').textAlign,
      cardBorder: any('.report-doc .grid > div').borderTopStyle,
      cardPad: parseFloat(any('.report-doc .grid > div').paddingTop),
      cardColRule: any('.report-doc .grid > div + div').borderLeftStyle,
      sectionLine: parseFloat(any('.report-doc > p.tracking-widest').borderBottomWidth),
      sectionGap: parseFloat(any('.report-doc > p.tracking-widest').marginTop),
      h2Border: parseFloat(any('.md h2').borderBottomWidth),
    }
  })

  // @page 边距是每页生效的边距来源（源文件断言：CSSOM 中 @page 嵌套在 @media print 内、且跨源表不可读）
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8').replace(/\s+/g, ' ')

  let fails = 0
  const check = (label, cond) => {
    if (!cond) fails++
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  }
  check(`正文底色白（${styles.bodyBg}）`, styles.bodyBg === 'rgb(255, 255, 255)')
  check(`打印画布重置浅色（colorScheme=${styles.htmlScheme}）`, styles.htmlScheme === 'light')
  check(`html 底白（${styles.htmlBg}）`, styles.htmlBg === 'rgb(255, 255, 255)')
  check(`白底不依赖背景图形开关（printAdjust=${styles.printAdjust}）`, /^exact$/.test(styles.printAdjust || ''))
  check(`报告字体含宋体（${styles.reportFont.slice(0, 30)}）`, /SimSun|serif/i.test(styles.reportFont))
  check(`标题字体含黑体（${styles.h1Font.slice(0, 30)}）`, /SimHei|sans-serif/i.test(styles.h1Font))
  check(`报告标题字号 18pt（${styles.h1Size}px）`, styles.h1Size >= 23)
  check(`正文字号 11pt（${styles.mdSize}px）`, styles.mdSize >= 14.5)
  check(`正文行距 1.5（${styles.lineHeight.toFixed(2)}）`, Math.abs(styles.lineHeight - 1.5) < 0.05)
  check(`区块小标签加粗（${styles.labelWeight}）`, styles.labelWeight === '700' || styles.labelWeight === '600')
  check(`@page 边距 2.2cm 2.4cm（源文件）`, /@page\s*{[^}]*margin:\s*2\.2cm\s+2\.4cm/.test(cssSrc))
  check(`容器内边距为 0（不叠加，${styles.reportPadLeft}px）`, styles.reportPadLeft === 0)
  check(`徽章打印隐藏（${styles.badgeDisplay}）`, styles.badgeDisplay === 'none')
  check(`表头下方重线（${styles.thBorderStyle} ${styles.thBorderW}px）`, styles.thBorderStyle === 'solid' && styles.thBorderW > 1)
  check(`数值列右对齐（${styles.numericAlign}）`, styles.numericAlign === 'right')
  check(`数据卡底色透明（${styles.cardBg}）`, styles.cardBg === 'rgba(0, 0, 0, 0)' || styles.cardBg === 'transparent')
  check(`表头底色透明（${styles.theadBg}）`, styles.theadBg === 'rgba(0, 0, 0, 0)' || styles.theadBg === 'transparent')
  check(`数据卡去卡片化（边框 ${styles.cardBorder} / 内边距 ${styles.cardPad}px）`, styles.cardBorder === 'none' && styles.cardPad === 0)
  check(`数据卡列间分隔线（${styles.cardColRule}）`, styles.cardColRule === 'solid')
  check(`眉题无分隔线（宽 ${styles.sectionLine}px）`, styles.sectionLine === 0)
  check(`眉题段前间距（${styles.sectionGap}px）`, styles.sectionGap > 0)
  check(`章节标题无分隔线（宽 ${styles.h2Border}px）`, styles.h2Border === 0)
  check(`长表允许跨页（${styles.tableBreak}）`, styles.tableBreak === 'auto' || styles.tableBreak === 'auto auto')
  check(`报告头整块不拆（${styles.headerBreak}）`, styles.headerBreak === 'avoid')
  check(`段落孤儿控制 3（${styles.orphans}）`, styles.orphans === 3)
  check(`强调绿落回黑（${styles.voltColor}）`, styles.voltColor === 'rgb(0, 0, 0)')
  check(`无 React 渲染错误`, errs.length === 0)
  if (errs.length) console.log('ERR:\n' + errs.join('\n'))

  // 产出 A4 PDF（正式版心校验的最终证据）
  // Chromium page.pdf 忽略 CSS @page margin，必须显式传 margin 才能与浏览器打印同版心
  // （浏览器 window.print 尊重 @page，两边均为上2.2cm/左右2.4cm）
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true })
  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: false,
    preferCSSPageSize: true,
    margin: { top: '2.2cm', bottom: '2.2cm', left: '2.4cm', right: '2.4cm' },
  })
  const pdfSize = fs.statSync(OUT).size
  const head = fs.readFileSync(OUT).slice(0, 5).toString()
  check(`A4 PDF 生成（${(pdfSize / 1024).toFixed(0)}KB，${head}）`, head === '%PDF-')

  // 坐标级边距核验：解析 PDF 内容流裁剪盒，确认每页正文框在 2.4cm/2.2cm 版心内。
  // Chromium 把 @page margin 映射为内容流开头的 cm 变换 + 裁剪盒；直接读坐标是最硬的证据
  // （CSSOM 断言只能证明样式存在，不能证明渲染生效）。
  checkPdfMargins(OUT, check)

  function checkPdfMargins(pdfPath, check) {
    const margins = pdfMargins(pdfPath)
    if (!margins.length) {
      check(`PDF 边距坐标解析（无页面）`, false)
      return
    }
    const ok = margins.every((mg) => Math.abs(mg.left - 2.4) < 0.1 && Math.abs(mg.top - 2.2) < 0.1)
    check(
      `PDF 边距坐标核验（${margins.length} 页，左 ${margins[0].left.toFixed(2)}cm / 上 ${margins[0].top.toFixed(2)}cm${margins.length > 1 ? '…' : ''}）`,
      ok,
    )
  }

  console.log(fails === 0 ? '=== 打印版式核验通过 ===' : `=== ${fails} 项失败 ===`)
  await browser.close()
  process.exit(fails === 0 ? 0 : 1)
})()
