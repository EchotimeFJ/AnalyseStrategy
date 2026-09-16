# GPT-5.6 Luna Max 规则抽取与 AI 复核审计

日期：2026-09-16。范围：只读检查当前代码、测试样本和 `docs/contracts`。本记录按用户指定的 GPT-5.6 Luna Max 审核口径编排；没有调用付费 AI、修改业务代码或部署。

## 1. 当前六类数据及代码出处

`research-data-v1.md:14-21` 将交付对象分成报告和文章、公司和标的、研究观点、风险和催化剂、行业和主题、质量和溯源六类。当前实现没有与这六类一一对应的持久化对象，实际由 `ReportDocument`、`TargetMention`、`OpinionRecord`、信号和索引视图拼成。

| 数据类 | 当前类型/枚举 | 当前规则与消费者 |
| --- | --- | --- |
| 报告和文章 | `ReportDocument`、`InstitutionBlock`；`ReportSummary`/`ReportOverview` 是视图 | `reportParser.ts:22-34,98-120` 保存文件、日期、标题、行和机构块；日期只从路径或 ID 的 `YYYY-MM-DD` 正则取得（`reportParser.ts:213-222`），每个 H1 都可能成为机构块（`reportParser.ts:224-249`）。API 为 `/reports`、`/reports/:id`、`/overview`（`routes/research.ts:42-77`），页面由 `Reports.tsx` 消费。当前没有文章边界、文章日期或发布者关系。 |
| 公司和标的 | `SecurityEntity`（`key/code/displayName/aliases/confidence`，`domain/research.ts:15-20`）；`TargetMention`（`reportParser.ts:56-79`）；内部市场枚举 `A/H/US/SG/TW/JP/KR`（`reportRecognition.ts:5-5`） | 括号候选、代码和名称规则见 `reportRecognition.ts:16-21,87-170`；代码正规化和裸代码词典见 `entityResolver.ts:51-63`、`securityDictionary.ts:18-35`；全局按代码或名称合并别名见 `entityResolver.ts:114-135`。公司页、关注列表、机构矩阵、目标页和导出直接消费 `index.entities`/`index.mentions`（`reportIndex.ts:443-470,573-673`，`routes/research.ts:79-81,104-165`）。公司、证券、上市挂牌目前混在一个实体中。 |
| 研究观点 | `OpinionType = positive | rating-change | target-price-change | catalyst | risk`（`domain/research.ts:23-28`）；`OpinionRecord`（`domain/research.ts:30-48`） | `ratingValues` 从限定词和上下文提取评级、前评级及动作（`reportRecognition.ts:250-281`），`buyRecommendations` 提取“建议/推荐买入”（`reportRecognition.ts:284-293`），`priceValues`/`money` 提取目标价和现价（`reportRecognition.ts:295-340`）。`extractOpinions` 将每个目标提及都包成观点并按关键词分类（`opinionExtractor.ts:11-105`）；`resolveOpinions` 按报告、机构、证券合并（`opinionResolution.ts:3-31`）。报告表、首页、买入清单、评级搜索和研究助手都依赖它们（`ReportOpinionTable.tsx:10-70`、`aiBuyList.ts:21-80`、`reportIndex.ts:415-465,531-570`、`aiService.ts:74-118`）。 |
| 风险和催化剂 | `SignalType = catalyst | risk | valuation | financial | macro`（`reportParser.ts:12-12`）；`CatalystRiskItem`（`reportParser.ts:45-54`）；观点的 `OpinionType` 只接收 `catalyst/risk` | `extractSignals` 对机构块内每一行按关键词分类并取相邻两行（`reportParser.ts:183-210,262-280`），目标行再按候选范围挂接（`reportRecognition.ts:398-418`）。Radar 只把 `catalyst/risk` 独立列出（`reportIndex.ts:619-632`），目标页和 `SignalList` 展示；`valuation/financial/macro` 只留在 `TargetMention.signals`，不会进入 `OpinionRecord.types`。 |
| 行业和主题 | 无独立主题枚举；机构块 `tags: string[]`、报告 `tags: MarkdownTagOccurrence[]`；信号还包含 `valuation/financial/macro` | Markdown 标签由 `extractTags` 取出（`reportParser.ts:252-260`），全文标签 AST 来自 `buildReportFromMarkdown`（`reportParser.ts:98-120`）；Radar 的主题只统计机构块标签（`reportIndex.ts:945-947`），标签搜索走 `createTagSearch`（`reportParser.ts:122-147`）和 `/search?mode=tag`。没有来源标签与规范主题的区分，也没有主题归属证据。 |
| 质量和溯源 | `ConfidenceLevel = high | medium | low`（`domain/research.ts:1-1`）；`DataQualityIssue.type = parse-error | unverified-institution | low-confidence-security`（`domain/research.ts:50-56`）；`ReportChangeType = added | modified | removed`（`reportIndex.ts:67-80`） | 观点证据仅为报告、文件、行列、摘录、方法和置信度（`domain/research.ts:3-13`）；索引保存 `qualityIssues/errors/sourceFingerprint/cache`（`reportIndex.ts:32-45`）。机构和低置信标的质量问题由 `buildQualityIssues` 产生（`reportIndex.ts:310-336`），`/data-quality` 直接返回（`routes/research.ts:83-85`）。原文快照按来源目录指纹保存（`reportCache.ts:25-45,84-161`），重建差异仅是报告级增删改（`reportIndex.ts:339-369`）。 |

现行评级相关枚举还分散在三处：识别正则及 `normalizedRating`（`reportRecognition.ts:16-21,74-85`）、积极评级列表（`opinionExtractor.ts:11-16`）和搜索六档别名 `买入/增持/中性/持有/减持/卖出`（`reportIndex.ts:95-102`）。它们不是同一份版本化词典。

为避免把“六类数据”与代码枚举混淆，当前可直接检出的稳定枚举值如下：

| 枚举 | 当前值 | 代码出处 |
| --- | --- | --- |
| 置信度 | `high / medium / low` | `api/domain/research.ts:1` |
| 观点类型 | `positive / rating-change / target-price-change / catalyst / risk` | `api/domain/research.ts:23-28` |
| 信号类型 | `catalyst / risk / valuation / financial / macro` | `api/services/reportParser.ts:12` |
| 质量问题 | `parse-error / unverified-institution / low-confidence-security` | `api/domain/research.ts:50-52` |
| 报告变化 | `added / modified / removed` | `api/services/reportIndex.ts:67-73` |
| 代码推断市场 | `A / H / US / SG / TW / JP / KR` | `api/services/reportRecognition.ts:5` |
| 研究时间模式 | `default / latest / week` | `api/services/researchRetrieval.ts:13-18` |

评级本身当前不是 TypeScript 枚举，而是规则正则匹配后返回的自由字符串；搜索层才有六个中文键。因此“六档”应作为未来稳定的展示/查询枚举，不能误称为当前已经统一的事实枚举。

## 2. 当前规则和实际缺陷

### 规则链

1. `buildReportFromMarkdown` 按行读取 Markdown，扫描 H1 作为机构块；后一个 H1 截断前一个块。文件名是报告标题，日期主要来自路径。
2. 每个机构块通过括号表达式、显式代码、词典名称和少量“公司”字段结构生成候选。`owners` 再按同一括号、同一句中最近名称或最近标题把评级、买入建议、目标价和现价归属给候选（`reportRecognition.ts:185-226`）。
3. 规则只在候选有代码、评级、建议或价格时输出 `TargetMention`（`reportRecognition.ts:385-420`），然后 `extractOpinions` 无论是否有投资字段都生成 `OpinionRecord`。
4. 索引阶段先从观点合并实体，再另行抽取提及并回填实体显示名（`reportIndex.ts:263-285`）；页面按不同层次分别调用原始提及、观点或去重观点。

### 反例和缺陷

| 问题 | 证据 | 后果 |
| --- | --- | --- |
| 共同评级没有展开到成员 | 2026-09-08 原文第 223 行是“野村证券核心推荐股票（评级均为买入）”后跟四家公司（`tests/fixtures/real-reports/2026-09-08.md.gz` 第 223 行）。当前运行把 `野村证券核心推荐股票` 当成无代码候选并挂上 `buyRecommendation=true`；四家公司有目标价但 `rating` 和 `buyRecommendation` 为空。评级的括号所有者选择在同一括号内的长标签候选，代码没有 `SharedScope`（`reportRecognition.ts:100-135,185-226,342-420`）。 | 买入统计和报告表漏掉四家公司，且产生伪公司。 |
| 目标价被代码数字污染 | 同一行当前抽取的中际旭创目标价为 `2281 元`，而原文是 `300308 CH，目标价 1,375.00 港元`。`money` 对无币种的数字较宽松（`reportRecognition.ts:295-308`），`priceValues` 没有把代码字段与价格字段隔离（`reportRecognition.ts:311-340`）。 | 价格、币种和证券市场错配，后续目标价比较不可用。 |
| 纯正文同句多主体召回不足 | 2026-09-08 第 197 行明确写“赣锋锂业增持、天齐锂业中性”，当前只形成“中国锂业仪表盘”一个候选，两个真实主体没有各自观点；同一行的两个评级被塞进 `ratingAlternatives`。候选主要依赖括号/标题结构（`reportRecognition.ts:87-170,342-420`）。 | 评级历史、机构矩阵和公司页漏项；冲突粒度错误。 |
| 评级语义被压扁 | `normalizedRating` 把 `Overweight/OW/超配/跑赢/优于大市` 都归为“增持”，把 `Underweight/UW/跑输` 归为“减持”（`reportRecognition.ts:74-85`）；`isPositiveRating` 又把“增持/跑赢/优于大市/OW”统一视为积极（`opinionExtractor.ts:11-16`）。原始词虽放在 `rawRating`，但没有机构评级体系、基准或期限。 | 不同机构量表不能安全比较；“积极”与“明确买入”边界不稳。 |
| 推荐与正式评级耦合 | `classifyOpinionTypes` 用 `positive` 同时表示积极评级和“首选股/top pick/重点推荐”（`opinionExtractor.ts:18-38`）；`isBuyOpinion` 再将 `buyRecommendation` 与部分评级组合成买入（`src/lib/opinionPredicates.ts:1-5`）。 | UI 的“积极观点”、买入清单和统计可能把两种不同陈述混在一起。 |
| 机构和文章归属不足 | 任何合格 H1 都成为机构块（`reportParser.ts:224-249`），机构仅靠固定别名验证（`entityResolver.ts:4-31,87-99`）；没有文章范围，也没有区分报告作者和文中引用机构。 | 标题、同行、作者或被引用机构可能被误当观点归属；无法做文章级完整性检查。 |
| 观点去重会拼接不相干字段 | `resolveOpinions` 的键只有 `reportId|institution|security.key`（`opinionResolution.ts:3-8`），合并后评级冲突置空，但目标价、现价、动作分别取任意第一条记录（`opinionResolution.ts:17-28`）。 | 同一报告内不同文章、不同时点、不同共同评级范围被压成一条，证据与字段不再同一陈述。 |
| 公司页会跨日期/机构拼“最新” | `getCompanyProfiles` 分别用最新有评级和最新有目标价的记录填 `latestRating/latestTargetPrice`（`reportIndex.ts:452-465`）。 | 页面可能显示某篇文章的评级和另一篇文章的目标价，形成原文没有的组合。 |
| 信号只是关键词和邻近行 | `classifySignal` 只检查“风险/催化剂/估值/财务/宏观/政策”等词（`reportParser.ts:262-280`），没有极性、模态、时间窗口或独立主体；目标范围依赖候选标题（`reportRecognition.ts:398-418`）。 | “历史风险”“风险下降”“可能的催化剂”都可能被当成当前信号，行业风险也可能挂到错误公司。 |
| 质量门禁不完整 | `SecurityEntity` 当前只有有代码=`high`、无代码=`medium`，因此 `buildQualityIssues` 检查 `low` 的分支事实上很难命中（`opinionExtractor.ts:52-57`、`reportIndex.ts:327-335`）。读取错误被收集后在重建时直接抛错（`reportIndex.ts:255-260,287-292`），而不是形成可发布的部分结果。 | 低置信、未覆盖、未陈述、歧义、截断和失败没有分开的状态。 |
| 源版本和字段变化没有细粒度审计 | 来源指纹使用路径、大小、mtime/ctime（`reportCache.ts:25-45`）；`diffReportChanges` 只比较整篇 Markdown 并按路径生成 ID（`reportIndex.ts:339-369,747-753`）。 | 文件移动会被判为删除+新增；不能判定哪条观点新增、修改或删除，也不能稳定保留人工订正。 |
| 消费者绕过同一事实层 | 报告概览/首页用去重观点，目标、Radar、机构、关注列表和目标导出用 `index.mentions`，评级搜索也读提及（`reportIndex.ts:401-465,531-673`）；AI 买入清单用观点，AI 检索则把原文块与观点派生实体混合（`aiBuyList.ts:21-80`、`researchRetrieval.ts:48-153`）。 | 将来 AI 复核后，若只更新观点而不更新提及或反之，各页面会显示不同版本；原文可检索与合格结构化统计也没有明确门禁。 |

## 3. “规则先提取，AI 复核”的必要约束

### 不可变输入和版本

- 每次处理先固定完整原文版本：保存原始字节哈希、稳定 `reportId`、`reportRevisionId` 和文章范围。文件路径是定位信息，不能作为永久身份；移动文件应保持同一报告。
- 规则抽取产生候选提及、观点、信号、主题和证据。每个候选都有 `localId`、所属原文范围、字段证据和 `candidateFingerprint`。AI 只能引用当前原文和候选，不能制造标准公司/证券 ID、发布版本或“已确认”状态。
- 规则、实体词典、解析策略、提示词、实际模型和配置分别版本化。相同原文哈希与相同版本组合直接复用结果；只改词典时可先重跑身份解析，不自动重跑语义抽取。对应 `research-data-v1.md:233-245,309-319` 的版本边界应保留。

### AI 输出必须是闭世界变更集

AI 复核请求应携带本次报告的候选 ID 清单和覆盖范围，返回以下有限操作（与 `research-vocabulary-v1.json:quality.operation` 对齐）：

| 操作 | 可接受条件 | 程序应用前检查 |
| --- | --- | --- |
| `keep`（不变） | 候选语义、字段、归属和证据不变 | 当前候选 ID 属于本次原文版本，证据逐字命中。 |
| `add` | 原文存在规则漏掉的主体、观点、信号或主题 | 必须提供原文引用和范围；引用可唯一定位，主体/机构关系可解释。 |
| `modify` | 同一候选的字段、归属或范围有更正 | 同时提供旧候选 ID、新字段和独立证据；禁止把另一条观点的字段拼入。 |
| `delete`（删除/撤回） | 规则误报，或原文修订后旧候选确实消失 | 必须有旧候选引用；来源删除还要有完整覆盖范围。只有检索不到不能证明删除；落库用墓碑或 `withdrawn`。 |
| `defer` | 证据不完整、主体或字段冲突、输出被截断 | 不改变已发布事实，进入待核对队列并保留失败原因。 |

AI 结果必须覆盖候选清单和输入范围，未列出的候选不能默认为删除。系统验证报告归属、逐字引用、偏移/行列、主体和机构、评级/价格的独立证据、市场/币种/单位相容性、共同评级成员完整性和输出未截断。验证失败的记录进入 `needs_review` 或 `rejected`，不会静默更新已发布视图。

### 评级取舍

建议冻结六个兼容 UI 和搜索的显示档：`买入、增持、中性、持有、减持、卖出`，另加 `其他`。同时把状态单独建模：`未陈述`（原文没有该字段）、`未覆盖`（原文明示未覆盖）、`歧义`（有多个未解决候选）和 `不适用` 不属于评级值。

冻结六档只解决消费者显示和查询稳定性，不能抹掉语义差异：保留 `rawLabel`，并保存 `scaleRef`、`benchmarkText`、期限及映射策略版本。只有有证据的机构量表映射才能把 `Overweight/OW/超配/跑赢` 显示为“增持”；这类值不因归入“增持”就统计为明确“买入”。正式评级与 `recommendation.action=buy/top_pick/...` 分开；原文“建议买入、正式评级增持”应同时保留两条陈述。不能把 `EW` 当证券代码。

### 发布和消费者约束

- 处理状态、程序校验状态、人工复核状态和发布状态分开。整篇输出截断、范围缺失或 AI 失败时保留上一份完整发布版本，并把本次结果标为 `partial/failed/pending`；单条歧义可让其他合格记录继续发布，但必须显示待核对数量。
- 所有页面、搜索、导出和研究助手绑定同一 `publicationId`。结构化统计只读 `valid` 且达到当前发布门槛的观点；原文搜索继续保留全文，但不能由没有结构化命中推断“原文不存在”。
- 共同评级先保存共享证据，再为每个成员展开单独观点；标题或共同列表本身不能作为第五个公司。公司研究按公司聚合、再按证券/挂牌和机构展开，最新评级和目标价必须来自同一受限时点/条件的陈述。

## 4. 增量添加、修改、删除和不变判定

以 `(sourceDocumentKey, reportRevision/contentHash, extractionPolicyVersion, dictionaryVersion, resolutionPolicyVersion, modelId, promptVersion, configRevision)` 为处理去重键，并按以下顺序处理：

1. **报告不变**：原文哈希、规则/词典/解析版本均不变，候选指纹和证据未变，结果为 `keep`，复用抽取和复核结果，不调用 AI、不产生“新增观点”事件。仅 `mtime` 变化不能触发事实变化。
2. **新增报告**：稳定来源身份不存在，先完整规则抽取，再对高风险候选或需要语义判断的范围调用 AI；新候选经验证后为 `add`。整篇未完成只能是 `pending/partial`，不能发布为空或称全部正确。
3. **同一报告内容修改**：固定新 `reportRevisionId`，只重跑该报告；用主体、机构、语义范围和证据锚点匹配旧候选。匹配到且字段不同是 `modify`，仅证据位置随行移动也要更新证据引用；新出现的是 `add`；旧证据在已完整覆盖的修订范围内消失才是 `remove`。无法稳定匹配时保留两条候选并标 `ambiguous/needs_review`。
4. **报告删除或撤回**：来源清单中消失或明确撤回时，报告及其下游事实进入 `withdrawn`/墓碑状态，默认视图排除；审计、历史引用和人工订正保留。不要物理删除公司、证券主数据或历史证据。
5. **仅词典或解析策略变化**：复用原始提及和字段证据，重新解析身份/市场；代码冲突、名称冲突或历史有效期不明时保留候选并待核对。不要因为词典新增别名就无证据改写原文或自动生成买入。
6. **仅模型/提示词变化**：新建抽取版本并与旧版本并存，比较候选级增删改；相同内容不能覆盖旧发布，直到新版本完成验证。人工订正作为独立决策叠加，重跑不得无提示覆盖。

删除的证据门槛高于添加：添加只需可定位的原文证据，删除需要旧记录、完整覆盖证明或明确反证。来源不完整、分页/分段失败和模型截断均只能产生待处理状态，不能把未命中判为删除。

## 5. 不应过度设计

- 当前阶段不需要行情、复权、汇率、ADR 换算、交易、提醒推送、事件兑现、完整财务指标或组合系统；先把原文、观点、证据、状态和发布版本做对。
- 不需要为每个逻辑对象立即建独立数据库表，也不需要自由格式的无限 `extensions`、向量库、多模型投票或全量 AI 重抽。不可变 JSON/快照加严格 Schema 足以承载第一阶段。
- 不要用 AI 代替日期、代码、币种、行列和精确引用校验；AI 只补规则难以判断的关系、共同范围、语义否定/条件和候选纠错。
- 不要把所有“新增识别”当成新投资信号；重跑新增应标为补录/订正，并按发布版本决定是否可见。

本审计是当前代码和样本的方案审核，不是生产 Schema 校验器、模型质量评测或发布实施。下一步若实施，应先用共同评级、正文多主体、代码/价格混排、未覆盖、否定/历史表述和原文修订六组样本验证候选级变更集及全消费者同一版本读取。

## 6. 第二、三轮混合方案复核结论（2026-09-16）

### 仍需阻断的实现边界

1. `delete` 的方向正确，但实现必须明确为“从本次候选事实视图排除并写入墓碑”，不能级联删除 `Report/ReportRevision`、Organization、Security、Listing、Alias/IdentifierAssignment、原文证据或人工订正。来源撤回是另一种 `withdrawn` 状态。所有结构化消费者都必须读取带该状态的统一发布视图；否则报告页已删除伪公司，目标页、Radar、关注列表或导出仍可能从旧 `mentions` 显示它。全文原文搜索可以继续保留。
2. AI 的 `rawCode` 只能是原文连续字符串，不能承接程序候选的 `code`。系统另存 `resolvedCode`、候选列表、解析状态和依据。`YOFC` 是词典中的港股别名，而长飞光纤存在 `601869.SS/6869.HK` 相关身份；单独出现的 `YOFC` 最多是有歧义的原文简称，不能作为确定挂牌代码，也不能据此接受候选的 `601869.SS` 或推断“原文是 A 股”。`中国移动（CM；941 HK，买入）` 应把 `941 HK` 与 `CM` 分别保存，系统解析后也不能生成 `CM.N`。`300308 CH` 亦保留原写法；与港元目标价的冲突进入问题状态，不能靠解析结果改币种。
3. 评测用 `response.schema.json` 不是生产 `ReviewPatch`：生产协议要求 `baseRevisionId/baseCandidateHash/coverage/fieldChanges/defer` 等，而小样 Schema 只有 `results/records/decisions/signals/tags`，新增记录也没有稳定局部 ID。必须保留这一边界，不能因小样 JSON 可解析就直接接入 Patch 应用器；实现阶段要另建严格 Schema、基线检查、冲突处理、事务提交和回滚验证。

### 六类 Schema 的评测覆盖边界

本轮样本只覆盖少量观点字段、风险/催化剂字符串、原文标签和候选处置。它没有验证：

- 报告/文章的 `ReportRevision`、文章范围、标题来源、日期精度、发布者归属和撤回状态；
- Organization、Security、Listing 三层身份，市场/挂牌状态、别名有效期、`rawIdentifiers` 和 Resolution 候选；
- 观点的 Claim 状态、推荐与正式评级分离、评级体系/基准/期限、动作、条件、否定、历史语境、当前价、共享评级范围和逐字段证据；
- Signal 的主体范围、时间窗口、极性、模态和事件语义；TopicAssignment 的来源、分类版本和候选/批准状态；
- Evidence 的不可变偏移/哈希、ExtractionRevision、ProcessingAttempt、ReviewIssue/Decision、PublicationManifest 和跨页面同一版本约束。

因此本轮是针对已知反例的候选层烟囱测试，不能称为“六类 Schema 通过”。

### 三个适配轮的独立语义结论

| 结果 | 形式分数 | 仍未通过的语义门槛 |
| --- | --- | --- |
| DeepSeek `adapted` | JSON/Schema 通过，18/18 核心组合，24/24 引文 | R2 四家公司分别只引用自身价格括号，没有为每条评级引用“评级均为买入”的共同范围；R3 把“下游需求韧性支撑中期前景”误报为催化剂。 |
| MiMo `adapted` | JSON/Schema 通过，18/18 核心组合，21/21 引文 | R2 同样缺共同评级逐成员证据，且未报告代码市场与港元目标价疑点；S2 原文有 `# 示例券商`，却将机构填为 `null`。 |
| GLM `adapted` | 18/18 核心组合，43/44 引文，Schema 不通过 | R4 将 `YOFC` 当作确定 `rawCode`，并沿用候选的 A 股判断；R1 有一条带多余前导空格的非原文引文；R4 signal 含 Schema 禁止的 `note:null`。 |

`score.cjs` 的 18/18 只比较公司名、评级、目标价金额和币种，并检查部分引文、标签和候选 ID；它不检查 `rawCode`、机构、共同范围证据、字段归属、Signal 的 kind/subject/时间、删除语义或六类对象完整性。适配轮的 18/18 不能抵消上述语义失败。

基础/公共轮的 DeepSeek 分别因 6000 推理 token 用尽而无正文/截断，MiMo 因超时或 6000 输出截断；这些是失败尝试，不能从失败正文推断事实正确。九次评测已知供应商用量合计 68,031 token，另一次 MiMo 超时用量未知；保守预留为 199,112/200,000，测试已停止，未知用量不能按零计。

最终判断：混合架构和六档评级兼容口径可以进入实现评审；当前任一模型、当前小样协议和当前候选层结果均不能批准自动发布。生产放行仍以正式 `ReviewPatch`、raw/resolved 身份分离、共同范围证据门禁、六类 Schema/发布清单校验和分层留出集回归全部通过为前提。
