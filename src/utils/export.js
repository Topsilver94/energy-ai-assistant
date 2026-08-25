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

/** 调起浏览器打印（配合 @media print 样式输出 PDF） */
export const exportPdf = () => {
  window.print()
}
