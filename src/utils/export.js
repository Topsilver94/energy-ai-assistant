/**
 * 复制 / 导出（CLAUDE.md §4）。
 * 导出 PDF 暂用 window.print() + 打印样式实现，Sprint 4 再评估 html2canvas + jspdf。
 */

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
