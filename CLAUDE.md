# CLAUDE.md

> 项目级配置文件，Claude Code 每次会话自动读取。所有开发决策以本文件为准；本文件未覆盖的细节，按 React 社区最佳实践处理。

## 1. 项目概述

**综合能源项目AI助手（Demo版）** — 面向中小型能源集成商与独立能源顾问的纯前端工具，把传统需要 2-3 天的手动节能诊断（查表、算指标、写方案）压缩到几分钟完成。

三大功能模块，形成全链路闭环：

| 模块 | 输入 | 输出 |
|---|---|---|
| ① 挖掘痛点 | 建筑性质（既有/新建）+ 面积 / 类型 / 省份；既有另填年份与年度电费，新建可选填设计能耗强度 | 既有：单位面积能耗对标、节能潜力%、3 条技术建议；新建：设计校核与预估能耗（不输出节能潜力）；两者均输出方案配置推荐（规则引擎）+ 投资价值热力图，可一键填入模块②并自动跳转 |
| ② 锁定收益 | 系统组合（光伏/储能/集中供冷/充电桩，多选）+ 各系统规模 + 省份 | 组合总账：投资（万元）、IRR、回收期（年）、碳减排（tCO₂/年）+ 分项明细表 + 敏感性分析（电价/利用小时/整体造价 × ±10%/±20%） |
| ③ 订制方案 | 自动汇总 ①② 的结构化数据 | GLM-5 流式生成一页式《综合能源节能改造方案》，支持复制 / 导出 PDF |

**步骤顺序即售前主线「先诊断后开方」**：首次接触客户能拿到的是①的输入（面积/电费/年份），拿不到的是②的输入（系统组合与规模——那正是①推荐引擎的产出），故①为默认入口。②保留独立可用（投标测算/客户自带明确需求场景）。

**项目双重定位**：自用效率工具 + 简历展示项目。代码可读性、数据可溯源性、演示专业度必须经得起他人（含面试官）审视。

**双界面模式**（右下角 ModeSwitch 切换）：工作模式为默认——左缘书签导航（隐蔽常驻，悬浮滑出完整信息）+ 内容分页居中，适合内部使用；演示模式三列同屏，适合对外展示全貌。模块数据全部在 store，切换模式/分页不丢状态。

## 2. 技术栈

| 类别 | 技术 | 约定 |
|---|---|---|
| 框架 | React 18 + Vite | 函数组件 + Hooks，不用 Class 组件 |
| 样式 | Tailwind CSS | 颜色一律引用 tailwind.config 语义 token（见 §6），组件内禁止裸写 hex |
| 状态 | Zustand | 见 §5 store 结构 |
| 图标 | Lucide React | 统一 stroke-width，尺寸用 size prop |
| AI | GLM-5（智谱 AI，OpenAI 兼容接口） | 流式输出，见 §7 |
| Markdown | react-markdown + remark-gfm | 渲染 AI 生成的方案 |
| 图表（如需） | Recharts | 用 §6 深色主题定制，不用默认配色 |
| 导出 | window.print() 为主（配打印样式），html2canvas + jspdf 备选 | |
| 部署 | GitHub Pages | 见 §8 |

## 3. 常用命令

```bash
npm run dev        # 本地开发（Vite）
npm run build      # 生产构建 → dist/
npm run preview    # 本地预览构建产物
npm run lint       # ESLint 检查（提交前必须通过）
npm run deploy     # 部署 dist/ 到 GitHub Pages（gh-pages 包）
```

## 4. 目录结构

```
src/
├── App.jsx                  # 布局 + 三模块路由/切换
├── main.jsx
├── index.css                # Tailwind 入口 + 打印样式(@media print)
├── stores/                  # Zustand
│   ├── configStore.js       # 全局系数配置（专家参数面板的数据源）★核心
│   ├── projectStore.js      # 模块② 输入与结果
│   ├── diagnosisStore.js    # 模块① 输入与结果
│   └── aiStore.js           # API Key（仅内存）+ 生成状态 + 方案文本
├── data/
│   ├── coefficients.js      # 所有系数默认值 + source 来源字段
│   ├── benchmarks.js        # 建筑能耗基准（办公/商场/医院/酒店/高校/数据中心/工业厂房）
│   ├── recommendationRules.js # 方案配置推荐规则阈值（带 source）
│   └── measures.js          # 预设措施库 + 新建建筑一体化建议文案
├── components/
│   ├── layout/              # Header（页头三入口）、ExpertPanel（双抽屉：scope=expert/public）、StepNav、WorkNav（工作模式左缘书签导航）、ModeSwitch（右下角双模式切换）、ApiSettingsModal
│   ├── calculator/          # 模块② 组件（含 SensitivityTable 敏感性表）
│   ├── diagnosis/           # 模块① 组件（含 RecommendationList 推荐列表、ValueHeatmap 热力图）
│   ├── aiReport/            # 模块③ 组件（流式渲染 + 导出按钮）
│   └── ui/                  # 通用组件：按钮/卡片/输入框/数据卡
├── services/
│   └── glm.js               # GLM-5 OpenAI 兼容接口封装（流式）
└── utils/
    ├── finance.js           # IRR / 回收期 / 现金流计算（纯函数）
    ├── phasing.js           # 建设节奏建议：按回收期确定性派生分期（纯函数）
    ├── recommend.js         # 方案配置推荐：规则引擎打分排序（纯函数）
    ├── sensitivity.js       # 敏感性分析：单变量扰动重算组合总账（纯函数）
    └── export.js            # 复制到剪贴板 / 导出 PDF
```

## 5. 核心架构：动态配置中心（本项目最重要的特性）

**所有计算系数一律不写死在组件里**，全部集中在 configStore，由页头三个入口「API 设置 / 专家参数 / 公开平台数据参考」修改，保存后所有依赖该系数的结果即时重算。后两个入口打开**两个独立抽屉**（同一组件按 scope 渲染，一次只开一个）：专家参数抽屉（光伏/储能/集中供冷/充电桩可调系数，scope: expert）与公开平台数据参考抽屉（分省年等效利用小时、分省工商业电价、通用系数、建筑能耗基准，scope: public；低频校准、常作对外参考展示）。分组契约里 `scope` 字段决定归属。

`data/coefficients.js` 结构示意（每个系数必须带 `source` 字段标注数据来源，面试时会被追问）：

```js
{
  pv:       { capexPerWatt: 3.5 },            // 元/W
  storage:  { capexPerKWh: 1200, cyclesPerDay: 2 },
  cooling:  { capexPerSqm: 300, coolingPricePerKwh: 0.75, cop: 5.0 }, // 集中供冷：能源站+管网新建，冷费收益
  charger:  { capexPerPile: 50000, dailyKwhPerPile: 300, serviceFee: 0.45 }, // 元/桩 / kWh·桩⁻¹·日⁻¹ / 元/kWh
  provinces: {                                  // 按省
    广东: { sunHours: 1050, elecPrice: 0.75 },  // 年等效利用小时 / 工商业电价
    // ...
  },
  general: { gridEmissionFactor: 0.5366, discountRate: 0.06 } // tCO₂/MWh / 折现率
}
```

**财务计算约定**（集中在 `utils/finance.js`，纯函数、可单测）：

- 年净现金流 = 年收益 − 年运维；初始投资计 t0
- IRR：NPV=0 二分迭代法，精度 0.01%，不引入第三方财务库
- 回收期：静态回收期 = 投资 / 年净收益，展示保留 1 位小数
- 碳减排 = 年发电量(MWh) × 电网排放因子
- 组合测算（模块② 多系统）：投资/收益/碳减排分项相加；IRR 与回收期基于合并现金流——共同计算期取各系统寿命最大值，各系统到期后现金流归零
- 节能潜力% = (实际单位能耗 − 基准单位能耗) / 实际单位能耗 × 100%

**方案配置推荐（模块①，确定性规则引擎）**：`utils/recommend.js` 依据诊断输入（性质/类型/面积/省份）按 `data/recommendationRules.js` 阈值打分排序，输出推荐等级/触发依据/建议规模/置信度；热力图财务列按建议规模调 `calculateFeasibility` 单系统预估。新建建筑不输出节能潜力%（无实际能耗基线，红线：不编造数据）；规则阈值属逻辑参数（带 source），不进专家参数面板。

**敏感性分析（模块②，确定性派生）**：`utils/sensitivity.js` 对组合总账做单变量扰动——电价 / 利用小时 / 整体造价三轴各 ±10% / ±20%，每档重算合并现金流 IRR 与回收期；电价轴如实呈现交叉效应（光伏/储能收益同向、集中供冷购电成本反向）。对当前组合无影响的轴判定为平坦并跳过注明；结论行（summaryLines）确定性生成，注入模块③（AI 仅润色）。组件侧从已展示的 feasibility 快照重建入参，与分项表严格同源。

## 6. 设计规范：黑绿先锋（校准自 iFRAME 工作室 Riff，Spotify 风格设计系统）

**气质**：近黑底 + 高饱和亮绿唯一强调色，克制而锐利；绿色与"绿色能源"品牌语义天然契合。**纪律：全站只有一个强调色**——绿用于按钮、关键数据、选中态、图表主线，其余一律黑白灰，不引入第二亮色，先锋感来自"黑绿对比 + pill 圆角反差"，不来自多色。

```js
// tailwind.config.js → theme.extend.colors（语义 token）
{
  ink:   { DEFAULT: '#121212', panel: '#181818', raised: '#282828', hover: '#333333' }, // 背景四层
  volt:  { DEFAULT: '#1ED760', dim: '#1DB954' },  // 亮绿：CTA/关键数据/选中态/图表主线
  paper: { DEFAULT: '#FFFFFF', mute: '#B3B3B3', faint: '#6A6A6A' },                     // 文字三级
  amber: { DEFAULT: '#F59E0B' },                   // 唯一例外色：超基准预警/风险提示，仅警示语义
  line:  '#333333'                                 // 边框/分隔线（极弱，融入背景）
}
```

**圆角体系（本设计的签名，必须遵守）**：容器克制、控件饱满的反差即先锋感——

- 卡片/面板：`rounded-lg`（8px），小标签/缩略图：`rounded`（6px）
- **按钮一律 pill（`rounded-full`）**；独立大输入框（API Key、搜索）同 pill
- 表单组输入框（计算器密集表单）：`rounded-xl`（12px），背景 `#282828` 无边框，聚焦态亮绿描边
- 头像/状态点：全圆

**组件态**：

- 主按钮：亮绿填充 `#1ED760` + **黑色文字**（对比度 10:1+，比白字更清晰）；最强 CTA（如「生成方案」）可用反色版：白底黑字 pill
- 次按钮/幽灵按钮：透明底 + `#B3B3B3` 描边，hover 变白
- 列表/表格行 hover：`#333333`；选中/激活：亮绿（图标或左侧指示条，不大面积铺色）
- 输入即时反馈：有效输入右侧亮绿对勾（继承 Riff 的微交互）

**字体**：

- 拉丁/数字标题：`Montserrat`（Circular 的开源替代，Google Fonts 引入 400/500/600/700 四字重）
- 中文：`PingFang SC, Microsoft YaHei` 系统栈，不引入中文 webfont
- 数据数字（IRR/回收期/投资额/碳减排）：等宽栈 `JetBrains Mono, ui-monospace, monospace`，用大字号数据卡（DataCard）呈现——数值亮绿或纯白，标签用 `paper.mute` 小字全大写
- 字号阶梯：H1 24-30px/700、H2 18-20px/700、Body 15px/400、Meta 13px、Caption 11-12px 全大写字距加宽

**密度与布局**（桌面端数据工具，非移动端——继承 token，不照搬 Riff 的手机布局）：

- 卡片间距 24px；表格行高约 48px（比 Riff 的舒适型列表更紧凑，工具属性）
- 空状态/引导页可选先锋构图：非对称斜切分割（黑区约 60% + 亮绿区 40%），呼应 Riff 展示页
- 图表配色：亮绿主线 + 白 + 灰阶梯（`#1ED760 / #FFFFFF / #B3B3B3 / #6A6A6A`），禁止彩虹配色

**可读性硬性要求**：

- 正文对比度 WCAG AA（≥4.5:1）；`paper.mute` 用于次要说明
- `paper.faint #6A6A6A` **仅用于禁用态和装饰**，禁止承载有效信息（对暗底仅 2.6:1）
- 亮绿文字允许用于数据强调（对 `#121212` 约 10:1），但单屏绿字面积不超过文字总量 20%
- 结果页（模块③ 方案）额外适配 `@media print`：白底黑字、隐藏导航和参数面板

## 7. AI 接口约定（GLM-5）

- 端点：`https://open.bigmodel.cn/api/paas/v4/chat/completions`（OpenAI 兼容格式）
- **API Key 仅存 aiStore 内存 state**，界面提供输入框。严禁：写入 localStorage、写入代码、写入 git、打印到 console
- 流式输出：`fetch` + `ReadableStream` 解析 SSE，逐 chunk 追加渲染（打字机效果）
- Prompt 结构：system 定义「一页式方案」五段模板（项目概述 / 财务分析 / 技术路径 / 建设节奏建议 / 预期收益），user 注入模块①② 的结构化 JSON（含当次使用的系数值）；「建设节奏建议」由 `utils/phasing.js` 按回收期确定性派生后注入，敏感性结论由 `utils/sensitivity.js` 同规注入——AI 仅润色措辞，不得改动分期结论与数字
- 必须处理：Key 未填写、Key 失效（401）、网络中断三种状态，给明确提示而非静默失败

## 8. GitHub Pages 部署

- 仓库名：`energy-ai-assistant`（默认，若改名需同步改 base）
- `vite.config.js` 必须设置 `base: '/energy-ai-assistant/'`（仓库名非 `<user>.github.io` 时必须，否则资源 404）
- 流程：`npm run build` → `gh-pages` 包推 dist/ → Settings → Pages 选 gh-pages 分支
- 部署后自检：图标 / 字体 / 重新刷新后直接访问子路由均不出现 404

## 9. 编码约定与红线

**约定：**

- 组件文件 PascalCase.jsx；工具/store 文件 camelCase.js
- 关键业务逻辑（财务公式、对标逻辑）写中文注释，注明公式与假设
- 修改系数相关代码时，只改 `data/coefficients.js` 默认值或 configStore，组件内不出现任何魔法数字
- props 层级不超过 3 层，跨组件共享一律走 store

**红线（违反即为 bug）：**

- ❌ API Key 进入任何持久化存储或代码仓库（.gitignore 必含 `node_modules/ dist/ .env .DS_Store`）
- ❌ 任何系数硬编码在组件/页面文件中
- ❌ 引入后端、数据库、用户系统——本项目边界是纯前端 Demo
- ❌ 编造数据：所有预设系数的 `source` 字段必须指向真实来源（官方统计/行业报告），没有来源的标注「演示假设值」
- ❌ 部署前未验证 `base` 路径配置
