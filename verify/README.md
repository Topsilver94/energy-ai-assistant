# verify/ — 全链路回归验证脚本

Playwright 驱动真实页面（headless Chromium），对三大模块与配置中心做端到端回归。
不依赖项目自身依赖（复用 npx 缓存里的 playwright），不侵入 `src/`。

## 脚本清单

| 脚本 | 覆盖 |
|---|---|
| `m1.cjs` | 模块②：表单→组合总账→分项表→敏感性；数值与手算对照（广东 光伏2000kW+储能1000kWh ⇒ 投资820万/IRR 26.3%/回收3.6年/碳减排1405.9t；储能按 2026年8月 广东峰谷价差 1.2655 元/kWh 计收益）；规模为 0 的校验 toast |
| `m2.cjs` | 模块①：既有路径（对标/潜力/评级/3条措施/推荐列表/热力图）、储能双口径定容（推定变压器 1,600 kVA × 25% × 2h 与负荷口径取短板 → 800 kWh）+ 布置红线（GB/T 51048-2025）、一键填入模块②、新建路径（设计校核、不输出节能潜力）、商场集中供冷双口径（占比0.9 → 供冷面积1.8万㎡ · 折算3600kW，负荷指标 200 W/㎡ 手册中值）、工业厂房供冷置信度降级（触发依据含「需工艺负荷资料复核」）、屋面类型分支（坡屋面728kW · 新建BIPV满铺1008kW · 平屋面典型=场景A 800kW） |
| `m3.cjs` | 模块③：锁定态、未填 Key 本地模板降级（含年代侧重注入）、401 分型提示、Key 不落 localStorage、剪贴板复制 |
| `m4.cjs` | 模块③：真实 GLM-5 流式生成（需 `GLM_KEY` 环境变量，Key 不进脚本不落盘） |
| `m5.cjs` | 双界面切换不丢状态、专家参数/公开数据抽屉改系数→组合结果自动重算、公开参考表（屋面系数）改值→模块① 推荐规模自动重算、恢复默认复现 |
| `era-dates.cjs` | 守护：年份滑杆上限随当前年自动前滚、既有结果标准代际侧重行（2005 前 / 节能 50% / 节能 65% 三档）、≥2022 年 GB 55015 光伏余量提示双出口（年代行 + 光伏触发依据）、新建不输出年代行、储能触发依据月份随 SPREAD_AS_OF 常量渲染 |

## 运行

```bash
# 1. 起 dev server（脚本默认连 localhost:5175，可用 BASE_URL 覆盖）
npm run dev

# 2. 首次需装浏览器内核（默认 CDN 国内不通，必须走 npmmirror 镜像）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium --only-shell

# 3. 跑脚本（playwright 包从 npx 缓存解析，无需安装）
NODE_PATH="C:/Users/hp/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules" node verify/m1.cjs

# m4 需要真实 Key（仅经环境变量进内存，页面关闭即失效）
GLM_KEY=<你的Key> NODE_PATH=... node verify/m4.cjs
```

产出：`verify/out/*.json`（提取数值+控制台报错）、`verify/shots/*.png`（各阶段截图）。
两目录为可再生工件，已 gitignore；脚本本身随仓库提交。

## 判定口径

- 脚本退出码非 0 = 存在 console/page 错误或断言失败
- `out/*.json` 中的 `extracted` 字段用于人工比对预期值（README 表内即基准）
- 系数默认值改动会使历史基准失效，改 `data/coefficients.js` 后需同步更新本 README 的对照值
