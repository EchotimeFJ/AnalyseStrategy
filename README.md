# AnalyseStrategy

AnalyseStrategy 是一个本地机构日报分析平台，用来整理、阅读和检索
`/Users/bytedance/ai-projects/Strategy/港A美/机构日报` 下的 Markdown 日报。

平台会把分散的日报解析成可追踪的研究资产，包括报告、机构、标的、评级、目标价、催化剂和风险信号。前端使用 React + Vite + TypeScript，后端使用 Express + TypeScript。

## 功能概览

- 报告总览：查看报告数量、标的提及数量、覆盖机构和最新索引状态。
- 报告阅读：按日期阅读 Markdown 原文，保留 Markdown 排版和跨行 `==高亮==`。
- 精确搜索：标准化精确匹配关键词，支持评级类结构化搜索，例如“买入评级”“卖出评级”。
- 标的分析：输入标的名称、英文名或代码，查看历史提及、评级变化、目标价变化、机构矩阵和风险/催化剂。
- 研究雷达：抽取首次覆盖、评级/目标价变化、催化剂、风险和主题热度。
- 机构观点：横向比较机构覆盖频率、最新评级、目标价和观点分歧；留空可查看全局覆盖。
- 关注列表：维护重点标的池，并优先查看关注标的的变化。
- 索引管理：刷新本地 Markdown 索引，也支持对 Strategy 仓库执行 `git pull --ff-only` 后重建索引。

## 交互规则

- 搜索、标的分析、机构观点等查询页首次进入时不填默认标的。
- 用户执行过查询、分析或生成后，切到其它页面再回来，会在本次浏览会话中恢复上一次输入和结果。
- 所有搜索结果、评级变化、历史提及和雷达内容按时间逆序展示，最新内容在前。
- Markdown 中成对 `==` 包裹的内容会渲染为高亮，跨行内容也会保留原始换行。

## 本地运行

```bash
npm install
npm run dev
```

启动后访问：

```text
http://localhost:5173/
```

默认端口：

- 前端 Vite：`5173`
- 后端 API：`3001`

## 数据源

默认日报目录：

```text
/Users/bytedance/ai-projects/Strategy/港A美/机构日报
```

后端会扫描该目录下的 Markdown 文件，并按文件日期、机构标题、正文段落和结构化字段生成内存索引。

本地用户配置位于：

```text
data/user-config.json
```

其中保存关注列表和别名配置。

## Git 更新说明

索引管理页的“Git 更新并重建”会尝试在 Strategy 仓库执行：

```bash
git pull --ff-only
```

在部分 Trae 沙箱环境中，网页服务进程可能无法写入相邻仓库的 `.git/FETCH_HEAD`。此时系统会使用 `git ls-remote` 对比本地 HEAD 与远端 HEAD：

- 如果本地与远端一致，视为已是最新，并继续重建索引。
- 如果远端已有新提交但沙箱禁止写入 `.git/FETCH_HEAD`，会返回明确错误，提示需要在有权限的终端执行 `git pull --ff-only`，或把 Strategy 目录加入沙箱允许路径。

## 常用命令

```bash
npm test
npm run lint
npm run check
npm run build
```

命令说明：

- `npm test`：运行解析、Git 更新、排序和评级搜索回归测试。
- `npm run lint`：运行 ESLint。
- `npm run check`：运行 TypeScript 类型检查。
- `npm run build`：运行生产构建。

## 主要目录

```text
api/
  routes/                 API 路由
  services/               报告解析、索引、Git 更新和本地配置服务
src/
  components/             通用 UI、布局、Markdown 渲染和信号卡片
  pages/                  总览、报告、搜索、标的、雷达、机构、关注、索引页面
  lib/                    API 请求和格式化工具
tests/                    回归测试
.trae/documents/          产品和技术设计文档
```

## 技术栈

- React 18
- Vite
- TypeScript
- Express
- Tailwind CSS
- react-markdown
- remark-gfm
