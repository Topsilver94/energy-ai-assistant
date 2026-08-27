# verify/ — 全链路回归验证脚本

Playwright 驱动真实页面（headless Chromium），对三大模块与配置中心做端到端回归。
不依赖项目自身依赖（复用 npx 缓存里的 playwright），不侵入 `src/`。

## 脚本清单

| 脚本 | 覆盖 |
|---|---|
| `m1.cjs` | 模块②：表单→组合总账→分项表→敏感性；数值与手算对照（广东 光伏2MW+储能1MWh ⇒ 投资820万/IRR 26.3%/回收3.6年/碳减排1405.9t；储能按 2026年8月 广东峰谷价差 1.2655 元/kWh 计收益）；规模为 0 的校验 toast |
| `m2.cjs` | 模块①：既有路径（对标/潜力/评级/3条措施/推荐列表/热力图）、一键填入模块②、新建路径（设计校核、不输出节能潜力） |
| `m3.cjs` | 模块③：锁定态、未填 Key 本地模板降级、401 分型提示、Key 不落 localStorage、剪贴板复制 |
| `m4.cjs` | 模块③：真实 GLM-5 流式生成（需 `GLM_KEY` 环境变量，Key 不进脚本不落盘） |
| `m5.cjs` | 双界面切换不丢状态、专家参数/公开数据抽屉改系数→组合结果自动重算、恢复默认复现 |

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
