# 工具页合集 · snowelf306.github.io

纯静态 GitHub Pages 站点，入口为 [`index.html`](index.html) 的卡片导航。每个页面都是**自包含单文件**（CSS/JS 内联、favicon 用 data URI），可直接双击本地打开，也可单独分享。

## 页面一览

| 页面 | 说明 |
| --- | --- |
| [qdii-nav.html](qdii-nav.html) | QDII-LOF 持仓净值估算看板：按季报持仓 + 实时行情推算「海外科技LOF / 全球芯片LOF」最新净值，含持仓明细、日度涨跌与净值走势对比 |
| [qdii_t0.html](qdii_t0.html) | T+0 QDII · 欧美市场：跟踪美/欧指数的场内 T+0 ETF/LOF，现价涨幅、成交额、净值、溢价率、盘前份额及日增、相关指数与申购状态，支持排序 / 搜索 / 自选高亮 / 置顶 |
| [etf_tracker.html](etf_tracker.html) | ETF 并排看板：多只 ETF 横向对比行情表现 |
| [weather.html](weather.html) | 多城月度天气对比：同城同月每日天气、最低/最高气温与紫外线强度 |
| [git-tutorial.html](git-tutorial.html) | **Git 交互式教学**：三区流转动画、可点击的分支/合并/rebase 实验室、GitHub Flow 与 PR 工作流图示、提交信息生成器、命令速查表与自测题 |

## 目录结构

```
.
├── index.html               # 卡片导航首页
├── qdii-nav.html            # 以下均为发布页（自包含单文件）
├── qdii_t0.html
├── etf_tracker.html
├── weather.html
├── git-tutorial.html        # ← 由 build/build-git-tutorial.js 生成
├── data.json                # QDII 看板的数据快照
├── build/                   # 生成脚本与源文件（不参与 Pages 展示）
│   ├── build_data.js        #   抓取行情 → data.json
│   ├── make_page.js         #   data.json → qdii-nav.html
│   ├── qdii_fetch.js        #   抓取欧美 T+0 QDII 行情 → 写回 qdii_t0.html
│   ├── git-tutorial.html    #   Git 教学页源文件（HTML）
│   ├── git-tutorial.css     #   Git 教学页源文件（样式）
│   ├── git-tutorial.js      #   Git 教学页源文件（交互）
│   └── build-git-tutorial.js#   三件套 → 根目录 git-tutorial.html
└── .github/workflows/update.yml   # 每交易日定时重建 QDII 看板并提交
```

## 本地构建

> ⚠️ 先 `cd qdii-publish`（本仓库根目录）。在别处执行会报 cannot find module；
> 从仓库外运行请用完整路径：`node <路径>/qdii-publish/build/build-git-tutorial.js`。

修改 Git 教学页时，**只改 `build/git-tutorial.{html,css,js}`（编辑用源文件，别直接上传它们）**，然后重新生成发布页：

```bash
cd qdii-publish
node build/build-git-tutorial.js
```

脚本会把 CSS/JS 内联、注入广告位，并校验产物（是否残留外部引用、`</script>` 是否闭合、`$` 系列辅助函数有没有被 `String.replace` 的特殊替换序列吃掉）。校验不通过会直接报错退出，不会产出半坏的页面。

QDII 看板同理：`node build/build_data.js && node build/make_page.js`（需外网）。

## 数据说明

- **qdii-nav.html**：数据为静态快照，由 `build/build_data.js` 抓取 Nasdaq / 腾讯 ifzq / Yahoo（经 allorigins 代理）/ 中国外汇交易中心 / 东方财富等公开接口生成 `data.json`。GitHub Actions 每个交易日（北京时间约 05:45）自动重建并提交，页面右上角徽标显示快照时间。
- **qdii_t0.html**：收录跟踪**美国 / 欧洲市场指数**、可 T+0 回转交易的场内 ETF / LOF（共 25 只，基金池在 `build/qdii_fetch.js` 的 `POOL` 中人工维护，新增代码即可）。数据来自东方财富公开接口：`push2` 行情一次批量取全部现价/涨幅/成交额，`fundmobapi` 逐只（300ms 限速）取净值/申购状态/公司/相关指数；页面脚本只读取内嵌 JSON（`QDII_DATA` 标记块），浏览时不发任何请求。GitHub Actions 每交易日运行 `node build/qdii_fetch.js` 刷新并提交；抓取失败自动保留上一版数据。支持表头排序、关键字搜索、☆ 自选高亮、📌 置顶（均存 localStorage）。溢价率 = 现价 ÷ T-1 净值 − 1（QDII 净值滞后一天，仅供参考）。盘前份额与日增份额来自沪深交易所每日披露（深交所单只接口自带历史；上交所取最新与前一交易日快照差值）。
- **weather.html**：运行时调用 Open-Meteo（预报 + 历史 archive）与 Nominatim / Open-Meteo Geocoding 公开接口，数据实时。
- **etf_tracker.html**：运行时经 allorigins 代理调用 Yahoo Finance `v7/finance/quote`，数据实时，可用性受代理影响。
- **git-tutorial.html**：纯教学内容，无任何外部数据请求（广告脚本除外），可离线使用。

## 免责声明

行情、净值、天气等均来自公开接口或静态快照，可能存在延迟与误差，**仅供参考，不构成投资建议**。
