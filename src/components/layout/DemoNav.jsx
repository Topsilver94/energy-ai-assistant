import { Check } from 'lucide-react'
import { STEPS, useStepDone, stepAnchorId, REPORT_SCROLL_ID } from './steps'

/**
 * 演示模式「定位书签」：与工作模式书签同一套视觉语言（左缘贴边、71px 书签、
 * 悬浮滑出标题+说明+对勾、选中亮绿描边），但职责不同——不切页，而是
 * **平滑定位到该列顶部 + 高亮聚焦该列**（演示是三列同屏的读法：信息自上而下，
 * 故定位点统一取模块顶部，不按列各自居中，保证三列共享一条顶端线）。
 *
 * 布局纪律（用户红线）：fixed 贴边、不占位——不加左列留白（工作模式那根
 * w-11 spacer 演示模式没有）、不挤压内容、不产生横向滚动。
 * 不遮信息靠**收起态宽度 ≤ 内容左缘的可让空间**保证（内容左缘 = 视口到
 * main 内容的距离：视口 < 1224 时恒为 px-6 的 24px，≥1224 起 main 反而
 * 比视口窄、左右留白渐宽）：
 *   · 收起态一律 24px（= <1224 时的全部可让空间，与内容零重叠）；
 *   · 仅 xl（≥1280，实测可让空间 ≥80px）恢复工作模式的 44/48px 书签宽度；
 *   · 悬浮展开（240px 浮层）限定 md 起——它是用户主动召回的瞬时浮层，
 *     与工作模式展开态同一性质；手机上不存在 hover，不会把书签撑开挡内容。
 * 缩放窗口时书签只改宽度不改行为：定位与高亮聚焦全宽度一致，不分叉。
 */
export default function DemoNav({ active, onChange }) {
  const doneMap = useStepDone()

  /**
   * 定位 + 聚焦。滚动落点由目标元素上的 scroll-mt-20 预留顶栏高度决定
   * （见 App.jsx），故 block:'start' 不会把列标题塞进常驻顶栏下面。
   */
  const jump = (key) => {
    onChange(key)
    document
      .getElementById(stepAnchorId(key))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // STEP③ 额外把报告卡内部滚动归零：报告区是「被行高约束的滚动容器」，
    // 只滚页面的话，跳过去看到的是上次读到的那一半，而不是报告开头。
    if (key === 'report') {
      document.getElementById(REPORT_SCROLL_ID)?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <nav
      aria-label="模块定位导航"
      className="no-print fixed left-0 top-28 z-30 flex flex-col gap-2"
    >
      {STEPS.map((s) => {
        const isActive = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => jump(s.key)}
            aria-label={`${s.index} ${s.label}`}
            aria-current={isActive ? 'true' : undefined}
            className={`group flex h-[71px] items-center overflow-hidden rounded-r-lg border border-l-0 pl-1.5 pr-4 text-left shadow-md backdrop-blur transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt md:hover:w-60 md:focus-visible:w-60 xl:pl-3 ${
              isActive
                ? 'w-6 border-volt bg-ink-raised/95 xl:w-12'
                : 'w-6 border-line bg-ink-panel/95 hover:border-paper-mute hover:bg-ink-raised xl:w-11'
            }`}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <span
                className={`font-mono text-[12px] leading-none ${
                  isActive ? 'text-volt' : 'text-paper-mute'
                }`}
              >
                {s.index}
              </span>
              {/* 展开内容仅 md 起参与布局（对应悬浮展开的起点）：手机无 hover，
                  留在流内只会被 24px 书签裁掉，不如不渲染 */}
              <span className="hidden -translate-x-1 flex-col gap-1 opacity-0 delay-100 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 md:flex">
                <span className={`text-sm leading-none ${isActive ? 'font-semibold' : 'font-medium'} text-paper`}>
                  {s.label}
                </span>
                <span className="text-[11px] leading-none text-paper-mute">{s.hint}</span>
              </span>
              {doneMap[s.key] && (
                <Check
                  size={14}
                  strokeWidth={3}
                  className="ml-1 hidden shrink-0 text-volt opacity-0 delay-100 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
                />
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
