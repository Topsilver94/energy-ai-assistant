import { useMemo } from 'react'
import { Image } from 'lucide-react'
import { useProjectStore, PROJECT_TYPES } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'
import { useConfigStore } from '../../stores/configStore'
import { buildSensitivity } from '../../utils/sensitivity'
import { formatIrr } from '../../utils/finance'
import { keyParams } from '../../utils/report'
import { SPREAD_AS_OF } from '../../data/coefficients'

const fmt = (n, digits = 1) => Number(n).toFixed(digits)

/**
 * 报告版式容器（确定性外壳）：报告头（LOGO 槽位 + 标题 + 元信息 + 生成方式徽章）/
 * 执行摘要（数据卡 + 分项明细表 + 敏感性结论）/ 正文槽（children = AI 流式或本地模板
 * 五段 Markdown，样式由 .md 锁定）/ 参数附表 / 报告尾（版权 + 保密 + 免责）。
 *
 * 版式契约：AI 只产正文文字，标题层级、数据表、报告头尾全部前端确定性渲染——
 * 与项目「确定性内核 + LLM 润色」哲学同构，GLM-5 与本地模板降级共用本外壳。
 * 结构参考发改投资规〔2023〕304号《投资项目可行性研究报告编写大纲》的
 * 「概况 → 财务 → 风险提示」顺序与咨询业执行摘要前置惯例。
 *
 * LOGO 与 API Key 同纪律：仅存 aiStore 内存态（dataURL），刷新即清空，不持久化。
 */
export default function ReportDocument({ wide = true, children }) {
  const pInputs = useProjectStore((s) => s.inputs)
  const feasibility = useProjectStore((s) => s.feasibility)
  const di = useDiagnosisStore((s) => s.inputs)
  const d = useDiagnosisStore((s) => s.diagnosis)
  const config = useConfigStore((s) => s.config)
  const logoDataUrl = useAiStore((s) => s.logoDataUrl)
  const isGenerating = useAiStore((s) => s.isGenerating)
  const generationSource = useAiStore((s) => s.generationSource)
  const modelName = useAiStore((s) => s.modelName)

  const f = feasibility?.total ?? {}
  const items = feasibility?.items ?? []
  // 储能需量分项（含口径标记 measured）：报告注记与「深化路径」提示据此区分实测/推定口径
  const storageDemand = items.find((it) => it.type === 'storage')?.demandDetail

  // 报告日期：挂载时定格（避免重渲染跳动）；敏感性与参数快照随 config 联动重算
  const date = useMemo(() => new Date().toLocaleDateString('zh-CN'), [])
  const sens = useMemo(
    () => buildSensitivity(pInputs, config) ?? { summaryLines: [] },
    [pInputs, config],
  )
  const params = useMemo(
    () => keyParams(pInputs.systems, config, pInputs.province),
    [pInputs.systems, config, pInputs.province],
  )

  // 光储协同定性提示（两路径共用）：光储同选 + 两充两放省（存在午间充电窗口）
  const selected = PROJECT_TYPES.filter(
    (t) => pInputs.systems[t.key]?.enabled && Number(pInputs.systems[t.key].capacity) > 0,
  )
  // 渲染路径不抛错（防黑屏红线）：引擎已对未知省份 fail-fast，测算结果存在即省份合法，
  // 此兜底不可达，仅防残缺快照下的渲染崩溃
  const provCfg = config.provinces[pInputs.province] ?? Object.values(config.provinces)[0]
  const pvStorageSynergy =
    selected.some((t) => t.key === 'pv') &&
    selected.some((t) => t.key === 'storage') &&
    (provCfg.cyclesPerDay ?? 1) >= 2

  // 执行摘要数据卡取值（IRR 非有限值 / 回收期 N/A 时如实显示，不硬造数字；
  // IRR 哨兵 0（收不回投资）经 formatIrr 统一转 N/A）
  const irrText = Number.isFinite(f.irr) ? formatIrr(f.irr, f.paybackPeriod) : '—'
  const paybackText = f.paybackPeriod === 'N/A' ? 'N/A' : fmt(f.paybackPeriod)

  // 报告头元信息（诊断快照，避免表单后续编辑造成错位）
  const isNew = (d?.buildingNature ?? di.buildingNature ?? 'existing') === 'new'
  const typeLabel = d?.buildingType ?? di.buildingType ?? '—'
  const areaText = Number.isFinite(Number(di.area)) ? Number(di.area).toLocaleString() : '—'
  const metaLine = `${pInputs.province} · ${isNew ? '新建' : '既有'}${typeLabel}建筑 · ${areaText} ㎡ · ${date}`
  const providerLabel = modelName || 'AI'
  const sourceBadge = isGenerating
    ? `${providerLabel} 生成中`
    : generationSource === 'local'
      ? '本地模板（降级）'
      : providerLabel

  // LOGO 上传：本地图选文件 → FileReader dataURL → 内存态（槽位即入口，点击上传/更换）
  const handleLogoFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => useAiStore.getState().setLogo(String(reader.result))
    reader.readAsDataURL(file)
    e.target.value = '' // 复位选择器，允许再次选择同一文件
  }

  return (
    <div className="report-doc">
      {/* 报告头：标题 + 元信息 + 生成方式徽章；LOGO 槽位固定右上（打印保留，未上传隐藏占位） */}
      <div className="flex items-start justify-between gap-4 border-b border-line pb-4 print:break-inside-avoid">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">综合能源节能改造方案</h1>
          <p className="mt-1.5 text-[12px] text-paper-mute">{metaLine}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <label className="cursor-pointer" title="点击上传/更换公司 LOGO">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="公司 LOGO" className="h-12 max-w-[160px] object-contain" />
            ) : (
              <span className="no-print flex h-12 w-32 items-center justify-center gap-1 rounded border border-dashed border-line text-[11px] text-paper-mute transition-colors hover:border-volt hover:text-paper">
                <Image size={12} />
                上传 LOGO
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
          </label>
          <span className="no-print rounded-full border border-line px-2 py-0.5 text-[10px] text-paper-mute">
            {sourceBadge}
          </span>
        </div>
      </div>

      {/* 执行摘要：数据卡 + 分项明细 + 敏感性结论（全部确定性渲染，AI 不经手）。
          卡片栅格按容器走：wide（工作模式满宽）sm 起 4 列；演示模式三列窄容器固定
          2×2——sm: 断点量的是视口宽，1440px 视口下右列仅 ~350px，4 列会把
          数字/标签挤到显示不全，不能依赖视口断点 */}
      <p className="mt-4 text-[11px] uppercase tracking-widest text-paper-mute">执行摘要</p>
      <div className={`mt-2 grid grid-cols-2 gap-3 ${wide ? 'sm:grid-cols-4' : ''}`}>
        {[
          { label: '投资估算 · 万元', value: fmt(f.totalInvestment, 2) },
          { label: 'IRR · %', value: irrText, accent: true },
          { label: '回收期 · 年', value: paybackText },
          { label: '年碳减排 · tCO₂', value: fmt(f.carbonReduction) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-ink-raised p-3 print:break-inside-avoid">
            <p className="text-[10px] uppercase tracking-widest text-paper-mute">{c.label}</p>
            <p
              className={`tabular mt-1.5 font-mono text-xl font-semibold ${
                c.accent ? 'text-volt' : 'text-paper'
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] uppercase tracking-widest text-paper-mute">分项明细</p>
      {/* 长表允许跨页（打印表头重复），避免整块推挤造成页尾大空白；
          窄屏容器内横滑看全列（列宽不压扁、不出阅读区），打印时恢复铺满 A4 版心。
          首列「系统」sticky 固定（同敏感性表/模块② 分项明细）：横滑时行名不跟滑；
          打印样式将 th/td 底色强制透明、边框归零（index.css @media print），sticky
          加的底色与右缘分隔线不会进打印版 */}
      <div className="mt-2 overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border border-line bg-ink-raised text-left font-semibold">
            <th className="sticky left-0 z-10 border-r border-line bg-ink-raised px-2 py-1.5">系统</th>
            <th className="px-2 py-1.5">规模</th>
            <th className="px-2 py-1.5">投资 · 万元</th>
            <th className="px-2 py-1.5">IRR</th>
            <th className="px-2 py-1.5">回收期 · 年</th>
            <th className="px-2 py-1.5">碳减排 · tCO₂/a</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const t = PROJECT_TYPES.find((x) => x.key === it.type)
            const itPayback = it.paybackPeriod === 'N/A' ? 'N/A' : fmt(it.paybackPeriod)
            const carbon = it.carbonReduction > 0 ? fmt(it.carbonReduction) : '—'
            return (
              <tr key={it.type} className="border border-line">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-ink-panel px-2 py-1.5">
                  {t?.label ?? it.type}
                </td>
                <td className="tabular px-2 py-1.5 font-mono">
                  {it.capacity} {t?.scaleUnit ?? ''}
                </td>
                <td className="tabular px-2 py-1.5 font-mono">{fmt(it.totalInvestment, 2)}</td>
                <td className="tabular px-2 py-1.5 font-mono">{formatIrr(it.irr ?? 0, it.paybackPeriod)}</td>
                <td className="tabular px-2 py-1.5 font-mono">{itPayback}</td>
                <td className="tabular px-2 py-1.5 font-mono">{carbon}</td>
              </tr>
            )
          })}
        </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-paper-mute md:hidden">
        可左右滑动查看完整分项明细
      </p>

      <p className="mt-3 text-[11px] uppercase tracking-widest text-paper-mute">
        敏感性分析（单变量扰动 ±10% / ±20%）
      </p>
      <ul className="mt-1.5 space-y-1 print:break-inside-avoid">
        {sens.summaryLines.map((line) => (
          <li key={line} className="text-[12px] leading-relaxed text-paper-mute">
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-paper-mute">
        组合 IRR / 回收期按合并现金流测算（共同计算期取各系统寿命最大值，到期归零）；充电桩不计碳减排。
        {pvStorageSynergy
          ? ' 光储协同：午间第二循环充电窗口与光伏大发时段重叠，可消纳光伏余电、提升自用率并防逆流（定性提示，收益仍按峰谷价差口径计）。'
          : ''}
      </p>

      {/* 储能口径边界与需量注记（确定性文字，AI 正文与此同源）：套利按代理购电固定分时，
          已计工程修正；需量收益按模块① 快照计入或如实注明未计，口径随 dd.measured 区分实测/推定 */}
      {selected.some((t) => t.key === 'storage') && (
        <p className="mt-2 text-[11px] leading-relaxed text-paper-mute">
          储能套利按电网代理购电固定分时口径测算（{SPREAD_AS_OF}代理购电表），已计系统效率 / 放电深度 /
          年可用天数与充电损耗工程修正；用户转入市场化交易后固定分时价差不再执行，收益需按现货价差重估（行业情景中枢约下移
          30%，可用敏感性电价轴初判抗压性）。
          {(() => {
            const dd = storageDemand
            if (dd && !dd.skipped)
              return ` 需量管理收益已计入：${dd.measured ? `实测最大需量 ${Math.round(dd.baseKw).toLocaleString()} kW（负荷曲线${dd.intervalMin ? ` ${dd.intervalMin} 分钟口径` : ''}）` : `推定最大需量 ${Math.round(dd.baseKw).toLocaleString()} kW`} × 削峰 ${Math.round(dd.shavedKw).toLocaleString()} kW × ${dd.price.toFixed(0)} 元/kW·月（两部制按需量计费推定，计费方式以电费单「基本电费」科目核定——容量计费用户无此项收益${dd.monthlyPerKva >= 260 ? '；月每 kVA 用电 ≥260 kWh 按 90% 档执行' : ''}）。`
            if (dd?.skipped)
              return ' 需量管理收益未计入：推定变压器容量低于两部制门槛（315 kVA），按单一制口径。'
            return ' 需量管理收益未计入（未采纳模块① 诊断或无最大需量数据）。'
          })()}
        </p>
      )}
      {selected.some((t) => t.key === 'storage') && (
        <p className="mt-2 text-[11px] leading-relaxed text-paper-mute">
          收益深化潜力（未计入上述测算数字，属或有收益）：现货市场套利（市场化用户轨道，与固定分时口径互斥）；需求响应
          / 虚拟电厂聚合（上海案例结算价最高约 9 元/kWh）；辅助服务（调峰 / 调频 / 备用）。
          {storageDemand?.measured
            ? '深化路径：负荷曲线已按实测口径接入年电量与最大需量，可进一步做逐时充放策略仿真，核定储能定容与需量削峰策略。'
            : '深化路径：以 15 分钟级实测负荷曲线替代类型推定系数，逐时仿真核定储能定容与需量削峰策略。'}
        </p>
      )}

      {/* 正文槽：AI 流式五段（或本地模板降级正文），标题/间距由 .md 样式锁定 */}
      <div className="md mt-2">{children}</div>

      {/* 附表：当次测算关键参数（专家参数面板可调，可溯源性） */}
      <p className="mt-6 text-[11px] uppercase tracking-widest text-paper-mute">
        附：当次测算关键参数
      </p>
      {/* 附表同窄屏横滑保障：参数名/值在超窄容器也不被裁 */}
      <div className="mt-2 overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-sm">
        <tbody>
          {params.map(([k, v]) => (
            <tr key={k} className="border border-line">
              <td className="w-40 bg-ink-raised px-2 py-1.5 font-semibold">{k}</td>
              <td className="tabular px-2 py-1.5 font-mono text-paper-mute">{v}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {/* 报告尾：版权 + 保密 + 免责（交付文档惯例；开源声明在应用页脚，不进报告） */}
      <div className="mt-6 border-t border-line pt-3 print:break-inside-avoid">
        <p className="text-[11px] text-paper-mute">
          © 2026 综合能源 AI 助手 · 保密文件，仅供项目团队内部使用
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-paper-mute">
          免责声明：本方案由演示工具生成，测算基于公开参考数据与可调演示系数（数据来源见应用内「电力市场数据 / 工程估算参考」），未含现场勘察与负荷实测；结果供决策参考，不构成投资承诺。
        </p>
      </div>
    </div>
  )
}
