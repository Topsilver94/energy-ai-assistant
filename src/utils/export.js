/**
 * 复制 / 导出（CLAUDE.md §4）。
 * 导出 PDF 暂用 window.print() + 打印样式实现，Sprint 4 再评估 html2canvas + jspdf。
 */
import { keyParams } from './report'
import { SPREAD_AS_OF, ELECP_AS_OF, CYCLES_AS_OF, CHARGER_RATIO_AS_OF } from '../data/coefficients'

/**
 * 测算台账快照（影子测算 / 回测台账的对账入口）：把模块② 当次组合测算结果组装为
 * Tab 分隔文本，贴进 Excel 自动分列。结构对应台账四 Sheet：
 *   首行   = 项目身份（测算日期 / 省份 / 数据版本 AS_OF / 项目编号列留空手填）
 *   分项表 = 预测快照（分项 + 合计：投资 / IRR / 回收期 / 碳减排）
 *   参数段 = 当次关键系数（keyParams，与报告附表同源——台账与报告数字可互证）
 * 纯函数：不触 DOM、不读 store；types（PROJECT_TYPES）由组件层喂入，保持 utils
 * 不依赖 stores 的方向纪律
 * @param {object|null} feasibility calculateFeasibility 的结果（projectStore.feasibility）
 * @param {object} config configStore 的系数快照
 * @param {Array} types PROJECT_TYPES（label / scaleUnit 来源）
 * @returns {string} TSV 文本；feasibility 为空时返回空串
 */
export const buildLedgerSnapshot = (feasibility, config, types) => {
  if (!feasibility) return ''
  const { total, items, province } = feasibility
  const meta = (t) => types.find((x) => x.key === t)
  const irr = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—')
  const payback = (v) => (v === 'N/A' ? 'N/A' : v.toFixed(1))
  const carbon = (v) => (v > 0 ? v.toFixed(1) : '—')

  const lines = []
  lines.push(
    [
      '测算快照',
      new Date().toLocaleDateString('zh-CN'),
      province,
      `数据版本 电价${ELECP_AS_OF}/价差${SPREAD_AS_OF}/分时${CYCLES_AS_OF}/配建${CHARGER_RATIO_AS_OF}`,
      '项目编号（手填）',
    ].join('\t'),
  )
  lines.push('')
  lines.push(['系统', '规模', '投资·万元', 'IRR', '回收期·年', '碳减排·tCO₂/a'].join('\t'))
  items.forEach((it) =>
    lines.push(
      [
        meta(it.type)?.label ?? it.type,
        `${it.capacity} ${meta(it.type)?.scaleUnit ?? ''}`,
        it.totalInvestment.toFixed(1),
        irr(it.irr),
        payback(it.paybackPeriod),
        carbon(it.carbonReduction),
      ].join('\t'),
    ),
  )
  lines.push(
    [
      '合计',
      '—',
      total.totalInvestment.toFixed(2),
      irr(total.irr),
      payback(total.paybackPeriod),
      carbon(total.carbonReduction),
    ].join('\t'),
  )
  lines.push('')
  lines.push('关键参数')
  const systems = Object.fromEntries(
    items.map((it) => [it.type, { enabled: true, capacity: it.capacity }]),
  )
  keyParams(systems, config, province).forEach(([k, v]) => lines.push([k, v].join('\t')))
  // 组合年毛收益随参数段入账：收益回测（预测收益 vs 结算收益）的对账基准
  lines.push(['组合年毛收益·万元', total.annualRevenue.toFixed(1)].join('\t'))
  return lines.join('\n')
}

/** 复制文本到剪贴板，返回是否成功（含非安全上下文的 execCommand 兜底） */
export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * 环境能否走 window.print()：手机/触屏浏览器（含 Android Chrome、微信内嵌 WebView）与
 * 沙箱/嵌入 iframe 中 print() 可能是静默 no-op（不弹打印界面也不报错）——必须检测后引导
 * 用户改走系统「分享/打印」，避免按钮无反馈。桌面真实浏览器照常走原生打印框。
 */
export const canBrowserPrint = () => {
  try {
    if (typeof window === 'undefined' || typeof window.print !== 'function') return false
    // 手机/移动浏览器（iOS Safari 无打印界面；Android 系统浏览器可用但部分 WebView/微信内核静默 no-op，
    // 一律引导改走系统菜单，保证「点按钮必有反馈」）
    if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent)) return false
    // 沙箱/跨域 iframe：window.print 被忽略（缺 allow-modals），跨域顶层访问本身会抛错
    if (window.self !== window.top) return false
    return true
  } catch {
    return false // 顶层窗口不可达 → 视为受限环境
  }
}

/** 调起浏览器打印；不支持的打印环境（手机/内嵌预览）回调 onUnsupported 给引导反馈 */
export const exportPdf = ({ onUnsupported } = {}) => {
  if (canBrowserPrint()) {
    window.print()
    return true
  }
  onUnsupported?.()
  return false
}

/**
 * 手机端「导出为 PDF」操作指引：分系统给准确路径——
 * Android 打印走「浏览器菜单→打印」（系统「分享」面板没有打印，小米/国产浏览器常见误区）；
 * iOS 才走 Safari「分享→打印」；无打印菜单的国产浏览器给换浏览器 + 复制到 WPS 兜底。
 */
export const exportGuideHint = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Android/i.test(ua)) {
    return (
      '当前设备不支持直接调起打印。请在浏览器右上角「菜单（⋮）→ 打印」中，打印目标选' +
      '「另存为 PDF / 保存为 PDF」。若菜单里没有「打印」（部分国产浏览器），请用 Chrome 或 Edge ' +
      '打开本页再打印，或点「复制内容」粘贴到 WPS / Word 导出。'
    )
  }
  if (/iP(hone|ad|od)/i.test(ua)) {
    return (
      '当前设备不支持直接调起打印。请在 Safari 点「分享 → 打印」，右上角选「存储为 PDF」导出；' +
      '或点「复制内容」粘贴到 WPS / Word 导出。'
    )
  }
  return (
    '当前环境（内嵌 / 受限）不支持直接调起打印：请在系统浏览器（Chrome / Edge / Safari）中打开本页，' +
    '用浏览器菜单「打印 → 另存为 PDF」导出，或点「复制内容」粘贴到 WPS / Word 导出。'
  )
}
