import { Database, KeyRound, Settings, Zap } from 'lucide-react'
import Button from '../ui/Button'

/**
 * 顶栏：品牌（左）+ 三个入口（右）
 * 🔑 API 设置（AI 接口弹窗）；⚙️ 专家参数（可调系数抽屉）；
 * 🗄 公开平台数据参考（公开参考数据抽屉，低频校准 / 对外展示）
 */
export default function Header({ onOpenPanel, onOpenReference, onOpenSettings }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded border border-volt/20 bg-volt/10 text-volt">
            <Zap size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">综合能源AI助手</h1>
            <p className="text-[11px] uppercase tracking-widest text-paper-mute">
              Energy AI Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenSettings}>
            <KeyRound size={15} />
            API 设置
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenPanel}>
            <Settings size={15} />
            专家参数
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenReference}>
            <Database size={15} />
            公开平台数据参考
          </Button>
        </div>
      </div>
    </header>
  )
}
