import { LayoutList, Presentation } from 'lucide-react'

/**
 * 右下角界面模式切换（固定悬浮 pill，CLAUDE.md §6 控件圆角纪律）：
 *   工作模式（默认）左侧便签导航 + 内容分页，内部专注使用
 *   演示模式       三列同屏，对外展示全貌
 * 选中态 = 亮绿填充 + 黑字（主按钮约定）；纯 UI 状态由 App 持有
 */
const MODES = [
  { key: 'work', label: '工作模式', icon: LayoutList },
  { key: 'demo', label: '演示模式', icon: Presentation },
]

export default function ModeSwitch({ mode, onChange }) {
  return (
    <div
      role="group"
      aria-label="界面模式切换"
      className="no-print fixed bottom-5 right-5 z-40 flex rounded-full border border-line bg-ink/90 p-1 shadow-lg backdrop-blur"
    >
      {MODES.map(({ key, label, icon: Icon }) => {
        const isActive = mode === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            title={
              key === 'work'
                ? '左侧便签导航 + 内容分页，适合内部使用'
                : '三列同屏展示全部模块，适合对外演示'
            }
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
              isActive
                ? 'bg-volt font-semibold text-ink'
                : 'text-paper-mute hover:text-paper'
            }`}
          >
            <Icon size={14} strokeWidth={2.5} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
