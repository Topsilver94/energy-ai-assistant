import { Database, KeyRound, LineChart, Settings, Zap } from 'lucide-react'
import Button from '../ui/Button'
import WorkTabs from './WorkTabs'

/**
 * 顶栏：品牌（左）+ 四个入口（右）；整体 sticky 常驻。
 * 🔑 API 设置（AI 接口弹窗）；⚙️ 专家参数（可调系数与财务假设抽屉）；
 * 📈 电力市场数据（分省电价/价差/分时/利用小时，随月度换版）；
 * 🗄 工程估算参考（按建筑类型查表，方案阶段估算）
 * 工作模式窄屏（<md）：第二行并入移动分页 WorkTabs（01/02/03 胶囊），
 * 随顶栏一起固定——切步不必滚回顶部。
 */
export default function Header({
  onOpenSettings,
  onOpenExpert,
  onOpenPower,
  onOpenReference,
  mode = 'work',
  active = 'diag',
  onNavigate = () => {},
}) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      {/* min-h + flex-wrap：极端窄视口（<375）右组换行兜底不溢出；常规宽度单行等高于原 h-16 */}
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-volt/20 bg-volt/10 text-volt">
            <Zap size={20} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold leading-tight sm:text-lg">综合能源AI助手</h1>
            <p className="hidden text-[11px] uppercase tracking-widest text-paper-mute sm:block">
              Energy AI Assistant
            </p>
          </div>
        </div>
        {/* 窄屏（<md）仅保留图标 + aria-label/title，回收宽度防溢出；桌面文案照常 */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="API 设置" title="API 设置" className="px-2 md:px-3">
            <KeyRound size={15} />
            <span className="hidden md:inline">API 设置</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenExpert} aria-label="专家参数" title="专家参数" className="px-2 md:px-3">
            <Settings size={15} />
            <span className="hidden md:inline">专家参数</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenPower} aria-label="电力市场数据" title="电力市场数据" className="px-2 md:px-3">
            <LineChart size={15} />
            <span className="hidden md:inline">电力市场数据</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenReference} aria-label="工程估算参考" title="工程估算参考" className="px-2 md:px-3">
            <Database size={15} />
            <span className="hidden md:inline">工程估算参考</span>
          </Button>
        </div>
      </div>

      {/* 工作模式窄屏：移动分页并入顶栏第二行（随顶栏 sticky，切步无需滚回顶部）；
          ≥md 由 WorkNav 悬浮书签接管，此行隐藏 */}
      {mode === 'work' && (
        <div className="border-t border-line/70 px-3 py-1.5 md:hidden sm:px-6">
          <WorkTabs active={active} onChange={onNavigate} />
        </div>
      )}
    </header>
  )
}
