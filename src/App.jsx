import { useState } from 'react'
import Header from './components/layout/Header'
import StepNav from './components/layout/StepNav'
import ExpertPanel from './components/layout/ExpertPanel'
import ApiSettingsModal from './components/layout/ApiSettingsModal'
import ModeSwitch from './components/layout/ModeSwitch'
import WorkNav from './components/layout/WorkNav'
import CalculatorModule from './components/calculator'
import DiagnosisModule from './components/diagnosis'
import AIReportPanel from './components/aiReport/AIReportPanel'

/**
 * 全局布局（双模式，右下角 ModeSwitch 切换）：
 *   工作模式（默认）左缘书签导航（悬浮展开）+ 内容分页居中，内部专注使用
 *   演示模式       三列模块同屏，对外展示全貌
 * 模块数据全部在 store，模式/分页切换不丢状态。
 * 面板开合（配置抽屉 / API 弹窗）与模式均为纯 UI 状态，放 App 本地 state
 * （不进 store，props 仅 1 层）
 */
export default function App() {
  // 当前打开的配置抽屉：'expert'（专家参数）/ 'power'（电力市场数据）/ 'reference'（工程估算参考）/ null
  const [drawer, setDrawer] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mode, setMode] = useState('work')
  const [activeKey, setActiveKey] = useState('diag')

  // 工作模式分页清单（key 与 WorkNav STEPS 对齐；wide = 横向双栏布局）。
  // 顺序即售前主线「先诊断后开方」：①诊断（默认入口）→ ②测算 → ③方案；
  // 诊断页采纳推荐后经 onApplied 直接跳转测算页
  const modules = [
    { key: 'diag', node: <DiagnosisModule wide onApplied={() => setActiveKey('calc')} /> },
    { key: 'calc', node: <CalculatorModule wide /> },
    { key: 'report', node: <AIReportPanel wide /> },
  ]
  const activeModule = modules.find((m) => m.key === activeKey) ?? modules[0]

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenExpert={() => setDrawer('expert')}
        onOpenPower={() => setDrawer('power')}
        onOpenReference={() => setDrawer('reference')}
      />

      {mode === 'work' ? (
        /* 工作模式：横向满宽（max-w-6xl），模块内部表单/结果双栏并排，
           尽量一屏收纳不下滑；导航固定在屏幕左缘（WorkNav） */
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6 print:px-0 print:py-0">
          <section className="min-w-0">{activeModule.node}</section>
        </main>
      ) : (
        /* 演示模式：三列同屏全貌 */
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 print:px-0 print:py-0">
          <section className="no-print mb-6">
            <h2 className="text-2xl font-bold">挖掘痛点 · 锁定收益 · 订制方案，三步闭环</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-paper-mute">
              模块①② 的结构化结果将自动汇总给模块③，生成一页式节能改造方案；
              右上角「专家参数」可实时调整全部计算系数，保存后全局生效。
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-3 print:block">
            <DiagnosisModule wide={false} />
            <CalculatorModule wide={false} />
            <AIReportPanel wide={false} />
          </div>
        </main>
      )}

      {mode === 'work' && <WorkNav active={activeKey} onChange={setActiveKey} />}
      <StepNav />
      <ModeSwitch mode={mode} onChange={setMode} />
      {/* 应用页脚：开源声明（仓库 LICENSE 同口径）+ 口径提示；报告自身的版权/免责在 ReportDocument 报告尾 */}
      <footer className="no-print border-t border-line px-6 py-3 text-center text-[11px] text-paper-mute">
        <a
          href="https://github.com/Topsilver94/energy-ai-assistant"
          target="_blank"
          rel="noreferrer"
          className="hover:text-paper"
        >
          MIT License · 源码仓库
        </a>
        <span className="mx-2 text-paper-faint">|</span>
        <span>测算基于公开数据与演示系数，供决策参考</span>
      </footer>
      {/* 三个配置抽屉一次只开一个；同一组件按 scope 渲染各自分组 */}
      <ExpertPanel scope="expert" open={drawer === 'expert'} onClose={() => setDrawer(null)} />
      <ExpertPanel scope="power" open={drawer === 'power'} onClose={() => setDrawer(null)} />
      <ExpertPanel scope="reference" open={drawer === 'reference'} onClose={() => setDrawer(null)} />
      <ApiSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
