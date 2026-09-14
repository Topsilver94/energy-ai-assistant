import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Leaf, Timer, TrendingUp, Wallet } from 'lucide-react'
import DataCard from '../ui/DataCard'
import SensitivityTable from './SensitivityTable'
import PlanCompare from './PlanCompare'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'
import { useConfigStore } from '../../stores/configStore'
import { calculateFeasibility } from '../../utils/finance'
import { buildSensitivity } from '../../utils/sensitivity'
import { buildLedgerSnapshot, copyText } from '../../utils/export'

/**
 * 模块② 结果区（组合测算）：4 张组合总账数据卡 + 分项明细表
 *
 * 关键联动：监听 configStore，已有测算结果时，专家参数保存后自动按最新系数
 * 重算组合，无需再点「开始测算」。重算异常时保留旧结果（避免整树崩溃黑屏）。
 */
export default function FeasibilityResults() {
  const config = useConfigStore((s) => s.config)
  const feasibility = useProjectStore((s) => s.feasibility)
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)

  // 台账快照复制反馈：成功切「已复制 ✓」1.5s（同模块③ 复制按钮的微交互）
  const [snapCopied, setSnapCopied] = useState(false)
  const snapTimer = useRef(null)

  // config 引用仅在「保存配置 / 恢复默认」时变化；
  // 通过 getState() 取最新 inputs，避免把表单输入卷进依赖导致逐键重算
  useEffect(() => {
    if (!isFeasibleDone) return
    try {
      const { inputs, setFeasibility } = useProjectStore.getState()
      const result = calculateFeasibility(inputs, config)
      if (result) setFeasibility(result)
    } catch {
      // 形状异常属代码缺陷：保留旧结果，开发期由控制台定位
    }
  }, [config, isFeasibleDone])

  // 敏感性分析：从已展示的 feasibility 快照重建测算入参（与分项表严格同源——
  // 测算后继续编辑表单不影响已出结果，config 变化随 feasibility 重算联动；
  // demand 回显随快照携带，储能需量收益在各扰动档位中同口径参与重算）
  const sensitivity = useMemo(() => {
    if (!feasibility) return null
    const systems = Object.fromEntries(
      feasibility.items.map((it) => [it.type, { enabled: true, capacity: it.capacity }]),
    )
    return buildSensitivity(
      { systems, province: feasibility.province, demand: feasibility.demand ?? null },
      config,
    )
  }, [feasibility, config])

  if (!feasibility) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-line p-4">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">输出指标（组合）</p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px] text-paper-faint">
          <span>组合投资 · 万元</span>
          <span>组合 IRR · %</span>
          <span>组合回收期 · 年</span>
          <span>组合碳减排 · tCO₂/a</span>
        </div>
      </div>
    )
  }

  const { total, items } = feasibility
  // 格式化约定：投资 2 位、IRR 1 位百分数、回收期 1 位、碳减排 1 位
  const payback = total.paybackPeriod === 'N/A' ? 'N/A' : total.paybackPeriod.toFixed(1)

  // 台账快照：影子测算 / 回测台账对账用（内部工具，不进对客报告）
  const handleSnapshot = async () => {
    const ok = await copyText(buildLedgerSnapshot(feasibility, config, PROJECT_TYPES))
    if (ok) {
      setSnapCopied(true)
      window.clearTimeout(snapTimer.current)
      snapTimer.current = window.setTimeout(() => setSnapCopied(false), 1500)
    }
  }

  return (
    <div className="mt-5 min-w-0">
      {/* 组合总账 */}
      <div className="grid grid-cols-2 gap-3">
        <DataCard icon={Wallet} label="组合投资 · 万元" value={total.totalInvestment.toFixed(2)} />
        <DataCard icon={TrendingUp} label="组合 IRR" value={`${(total.irr * 100).toFixed(1)}%`} accent />
        <DataCard icon={Timer} label="组合回收期 · 年" value={payback} />
        <DataCard icon={Leaf} label="组合碳减排 · tCO₂/a" value={total.carbonReduction.toFixed(1)} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-paper-mute">
        组合年毛收益 {total.annualRevenue.toFixed(1)} 万元 · 已扣年运维 ·
        修改「专家参数」保存后自动重算
      </p>

      {/* 方案比选 A/B：存两轮测算快照并排对比（内部决策工具，不进报告） */}
      <PlanCompare />

      {/* 分项明细节头：右侧「复制台账快照」= 影子测算 / 回测台账的对账入口
          （TSV 贴 Excel 自动分列；身份行含当次 AS_OF 数据版本，关键参数与报告
          附表同源）。内部工具入口，不出现在打印报告 */}
      <div className="mt-4 mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">分项明细</p>
        <button
          type="button"
          onClick={handleSnapshot}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-volt ${
            snapCopied
              ? 'border-volt/40 text-volt'
              : 'border-line text-paper-mute hover:border-paper-mute hover:text-paper'
          }`}
        >
          {snapCopied ? (
            <Check size={12} strokeWidth={2.5} />
          ) : (
            <Copy size={12} strokeWidth={2.25} />
          )}
          {snapCopied ? '已复制' : '复制台账快照'}
        </button>
      </div>

      {/* 分项明细表：窄屏容器内横滑看全列（列宽不压扁、不出卡片），宽屏照常铺满。
          首列「系统」sticky 固定（同敏感性表）：横滑时行名不跟滑；底色取行底
          （表头 ink-raised / 数据行卡面 ink-panel，hover 随行变 ink-hover——tr 加
          group、sticky td 用 group-hover 同步），右缘细分隔线区分固定区与滑动区 */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-ink-raised text-[11px] uppercase tracking-widest text-paper-mute">
              <th className="sticky left-0 z-10 border-r border-line bg-ink-raised px-3 py-2 text-left font-semibold">
                系统
              </th>
              <th className="px-3 py-2 text-right font-semibold">规模</th>
              <th className="px-3 py-2 text-right font-semibold">投资 · 万</th>
              <th className="px-3 py-2 text-right font-semibold">IRR</th>
              <th className="px-3 py-2 text-right font-semibold">回收 · 年</th>
              <th className="px-3 py-2 text-right font-semibold">碳减排 · t/a</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const t = PROJECT_TYPES.find((x) => x.key === item.type)
              const itemPayback =
                item.paybackPeriod === 'N/A' ? 'N/A' : item.paybackPeriod.toFixed(1)
              return (
                <tr
                  key={item.type}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-ink-hover"
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-ink-panel px-3 py-2 text-paper group-hover:bg-ink-hover">
                    {t?.label ?? item.type}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-right font-mono text-paper-mute">
                    {item.capacity} {t?.scaleUnit}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-paper-mute">
                    {item.totalInvestment.toFixed(1)}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-paper-mute">
                    {(item.irr * 100).toFixed(1)}%
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-paper-mute">
                    {itemPayback}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-paper-mute">
                    {item.carbonReduction > 0 ? item.carbonReduction.toFixed(1) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-paper-mute md:hidden">
        表格超出屏幕时可左右滑动查看全部列
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-paper-mute">
        组合 IRR / 回收期按合并现金流测算（共同计算期取各系统寿命最大值，到期归零）；
        充电桩不计碳减排（交通过程减排不核算），表中以「—」示意。
      </p>

      {/* 敏感性分析：单变量扰动重算（电价/利用小时/整体造价 × ±10%/±20%） */}
      <SensitivityTable sensitivity={sensitivity} />
    </div>
  )
}
