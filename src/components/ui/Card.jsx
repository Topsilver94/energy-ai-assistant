/**
 * 通用卡片容器 —— 克制的 rounded-lg（8px）+ 面板层背景 + 极弱描边
 */
export default function Card({ className = '', children }) {
  return <div className={`rounded-lg border border-line bg-ink-panel ${className}`}>{children}</div>
}
