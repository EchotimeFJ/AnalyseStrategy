# AnalyseStrategy

AnalyseStrategy 是一个双端友好的机构研究工作台，用来整理、阅读和检索
Strategy 仓库中的 Markdown 日报。服务器默认读取 `/opt/Strategy/港A美/机构日报`，本地可通过环境变量覆盖。

平台会把分散的日报解析成可追踪的研究资产，包括报告、机构、标的、评级、目标价、催化剂和风险信号。前端使用 React + Vite + TypeScript，后端使用 Express + TypeScript。

## 功能概览

- 今日速览：直接查看最新报告、买入/积极观点、评级与目标价变化，并可在首页更新数据。
- 报告库：每份报告先展示公司、评级、目标价、风险和催化剂速览，再阅读 Markdown 原文。
- 智能检索：识别公司、代码、机构或普通关键词，默认按报告聚合；严格原文模式保留逐行核对。
- 公司研究：上市代码优先归并同一公司的不同名称，展示机构观点历史、目标价、催化剂和风险。
- 研究助手：可选的全局 AI 增量层，先检索报告再流式回答，并给出可点击来源。
- 关注列表：维护重点标的池，并优先查看关注标的的变化。
- 数据更新：刷新本地索引，或对 Strategy 仓库执行 `git pull --ff-only` 后重建，并展示报告 diff、解析质量和应用版本。

## 交互规则

- AI 未配置、失败或额度耗尽时，所有非 AI 功能保持可用。
- 研究助手会话只保存在当前浏览器，不在服务器共享聊天历史。
- 证券识别优先使用标准化上市代码；名称和报告错写作为别名保留。
- 所有搜索结果、评级变化、历史提及和雷达内容按时间逆序展示，最新内容在前。
- Markdown 中成对 `==` 包裹的内容会渲染为高亮，跨行内容也会保留原始换行。
- 每次“仅刷新索引”或“Git 更新并重建”后，页面会展示报告变更 diff：新增报告、修改报告、删除报告。新增和修改项可以直接点击进入报告阅读页。

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
- 后端 API：`3003`

## 数据源

服务器默认日报目录：

```text
/opt/Strategy/港A美/机构日报
```

后端会扫描该目录下的 Markdown 文件，并按文件日期、机构标题、正文段落和结构化字段生成内存索引。

本地用户配置位于：

```text
data/user-config.json
```

其中保存关注列表和别名配置。

## 可选 AI 研究助手

复制 `.env.example` 中的 AI 配置。推荐至少设置：

```text
AI_CONFIG_SECRET=<用于加密运行时 API Key 的随机长密钥>
AI_CONFIG_ADMIN_TOKEN=<网页修改全局配置时使用的管理令牌>
```

之后可以在“研究助手”页面填写任意 OpenAI-compatible 服务的基础地址、模型和 API Key。密钥使用 AES-256-GCM 加密后写入 Git 忽略的 `data/runtime/ai-config.json`；接口只返回掩码，不返回明文。

也可以完全用服务器环境变量配置：`AI_PROVIDER_NAME`、`AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`、`AI_TIMEOUT_MS`、`AI_DAILY_TOKEN_BUDGET` 和 `AI_MAX_CONCURRENCY`。环境变量优先于网页保存值。

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

- `npm test`：运行全部 `tests/*.test.ts`，覆盖解析、检索、AI 配置/流式问答和版本。
- `npm run lint`：运行 ESLint。
- `npm run check`：运行 TypeScript 类型检查。
- `npm run build`：运行生产构建。

## 主要目录

```text
api/
  routes/                 API 路由
  services/               报告解析、索引、检索、AI、Git 更新和本地配置服务
src/
  components/             通用 UI、布局、Markdown 渲染和信号卡片
  pages/                  今日速览、报告、检索、公司、研究助手、关注、数据页面
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
