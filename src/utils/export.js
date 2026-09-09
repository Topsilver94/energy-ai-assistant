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
 * 环境能否走 window.print()：iOS Safari 与沙箱/嵌入 iframe 中 print() 是静默 no-op
 * （不弹打印界面也不报错），必须检测后引导用户走系统「分享/打印」，避免按钮无反馈。
 */
export const canBrowserPrint = () => {
  try {
    if (typeof window === 'undefined' || typeof window.print !== 'function') return false
    // iOS Safari（iPhone/iPad/iPod）：print() 存在但无打印界面
    if (/iP(hone|ad|od)/.test(navigator.userAgent)) return false
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
