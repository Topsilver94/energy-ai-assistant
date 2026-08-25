import { useEffect, useMemo } from 'react'
import { Leaf, Timer, TrendingUp, Wallet } from 'lucide-react'
import DataCard from '../ui/DataCard'
import SensitivityTable from './SensitivityTable'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'
import { useConfigStore } from '../../stores/configStore'
import { calculateFeasibility } from '../../utils/finance'
import { buildSensitivity } from '../../utils/sensitivity'

/**
 * 模块① 结果区（组合测算）：4 张组合总账数据卡 + 分项明细表
 *
 * 关键联动：监听 configStore，已有测算结果时，专家参数保存后自动按最新系数
 * 重算组合，无需再点「开始测算」。重算异常时保留旧结果（避免整树崩溃黑屏）。
 */
export default function FeasibilityResults() {
  const config = useConfigStore((s) => s.config)
  const feasibility = useProjectStore((s) => s.feasibility)
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)

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
  // 测算后继续编辑表单不影响已出结果，config 变化随 feasibility 重算联动）
  const sensitivity = useMemo(() => {
    if (!feasibility) return null
    const systems = Object.fromEntries(
      feasibility.items.map((it) => [it.type, { enabled: true, capacity: it.capacity }]),
    )
    return buildSensitivity({ systems, province: feasibility.province }, config)
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

  return (
    <div className="mt-5">
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

      {/* 分项明细表 */}
      <div className="mt-4 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-ink-raised text-[11px] uppercase tracking-widest text-paper-mute">
              <th className="px-3 py-2 text-left font-semibold">系统</th>
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
                  className="border-b border-line/40 transition-colors last:border-0 hover:bg-ink-hover"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-paper">{t?.label ?? item.type}</td>
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
      <p className="mt-2 text-[12px] leading-relaxed text-paper-mute">
        组合 IRR / 回收期按合并现金流测算（共同计算期取各系统寿命最大值，到期归零）；
        充电桩不计碳减排（交通过程减排不核算），表中以「—」示意。
      </p>

      {/* 敏感性分析：单变量扰动重算（电价/利用小时/整体造价 × ±10%/±20%） */}
      <SensitivityTable sensitivity={sensitivity} />
    </div>
  )
}
