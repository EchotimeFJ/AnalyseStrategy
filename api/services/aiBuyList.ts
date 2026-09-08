import type { OpinionRecord } from '../domain/research.js';
import { normalizeText, type ReportDocument } from './reportParser.js';
import type { ResearchIntent } from './researchRetrieval.js';
import { resolveOpinions } from './opinionResolution.js';
import { getBuyCoverage, isExplicitBuy } from './buyCoverage.js';
import { resolveInstitution } from './entityResolver.js';

export function isBuyListQuestion(question: string, scope: ResearchIntent['scope'], opinions: OpinionRecord[] = []) {
  if (scope.securityKey || /理由|原因|为什么|为何|风险|逻辑|新增|首次|上调|下调|恢复/.test(question)) return false;
  if (/它|该公司|这家公司|上述公司|前者|后者/.test(question)) return false;
  const list = /买入|\bbuy\b/i.test(question)
    && /汇总|全部|所有|名单|清单|哪些.*(?:标的|公司|股票|买入)|(?:标的|公司|股票).*哪些/.test(question);
  if (!list) return false;
  if (/全部历史报告|所有报告|(?:报告|日报)(?:中|里|内|的)*.*买入.*(?:标的|名单|清单|股票)/.test(question)) return true;
  const normalized = normalizeText(question);
  const generic = /^(?:标的|股票|公司|买入|的买入|增持|评级|机构|报告|日报|历史|全部|所有|市场|目标价|当前|个股|清单|名单|观点|\d+)$/;
  if (opinions.some(({ security }) => [security.displayName, ...security.aliases, security.code ?? ''].some((term) => term.length >= 2 && !generic.test(term) && normalized.includes(normalizeText(term))))) return false;
  return true;
}

export function buildBuyList(reports: ReportDocument[], opinions: OpinionRecord[], intent: ResearchIntent) {
  const scope = intent.scope;
  const scopedReports = reports.filter((report) => (!scope.from || report.date >= scope.from) && (!scope.to || report.date <= scope.to));
  const reportById = new Map(scopedReports.map((report) => [report.id, report]));
  const resolved = resolveOpinions(opinions);
  const candidates = resolved.filter((opinion) => reportById.has(opinion.reportId)
    && (!scope.institution || resolveInstitution(opinion.institution).canonicalName === resolveInstitution(scope.institution).canonicalName)
    && isExplicitBuy(opinion));
  const seen = new Set<string>();
  let unverified = 0;
  const rows = candidates.flatMap((opinion) => {
    const evidence = opinion.evidence[0];
    const report = reportById.get(opinion.reportId)!;
    if (!evidence) { unverified += 1; return []; }
    const endLine = (evidence as typeof evidence & { endLineNumber?: number }).endLineNumber ?? evidence.lineNumber;
    const original = report.lines.slice(evidence.lineNumber - 1, endLine).join('\n');
    // A parsed rating without an original rating line is not verified evidence.
    if (!/买入|\bbuy\b/i.test(original)) { unverified += 1; return []; }
    const excerpt = evidence.excerpt && original.includes(evidence.excerpt) ? evidence.excerpt : original;
    const key = [opinion.reportId, opinion.institution, opinion.security.key, evidence.lineNumber].join(':');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ opinion, excerpt, lineNumber: evidence.lineNumber }];
  }).sort((a, b) => b.opinion.reportDate.localeCompare(a.opinion.reportDate) || a.lineNumber - b.lineNumber);
  const sources = rows.map(({ opinion, excerpt, lineNumber }, index) => ({
    id: `buy:${opinion.reportId}:${lineNumber}:${index}`,
    reportId: opinion.reportId, date: opinion.reportDate,
    institution: opinion.institution, securityName: opinion.security.displayName,
    lineNumber, excerpt,
  }));
  const dates = scopedReports.map((report) => report.date).sort();
  const range = scope.from || scope.to
    ? `${scope.from ?? '最早报告'} 至 ${scope.to ?? '最新报告'}`
    : `全部已加载历史报告（${dates[0] ?? '无'} 至 ${dates.at(-1) ?? '无'}）`;
  const lines = [
    `范围：${range}${scope.institution ? `；机构：${scope.institution}` : ''}，共 ${scopedReports.length} 份报告。`,
    `以下列出该范围内 ${rows.length} 条有原文依据的买入评级或明确买入建议（同一公司可有多条观点）。仅有“增持 / 跑赢”评级而没有买入建议的观点不在此列。`,
    '名单来自结构化识别与原文核验，可能仍有未识别公司；未列出不等于原文没有买入观点。',
  ];
  if (unverified) lines.push(`另有 ${unverified} 条已识别评级缺少直接买入原文证据，未计入名单。`);
  if (intent.mode === 'latest') lines.push(`当前日期：${intent.currentDate}；报告库最新日期：${intent.latestReportDate ?? '无'}。`);
  if (rows.length) {
    lines.push('', '| 日期 | 机构 | 标的 | 评级 | 原文依据 |', '| --- | --- | --- | --- | --- |');
    rows.forEach(({ opinion, excerpt }, index) => {
      lines.push(`| ${opinion.reportDate} | ${cell(opinion.institution)} | ${cell(opinion.sourceName ?? opinion.security.displayName)}${opinion.security.code ? ` (${cell(opinion.security.code)})` : ''} | ${cell(opinion.rawRating ?? opinion.rating ?? '原文建议买入')} | ${cell(excerpt)} [${index + 1}] |`);
    });
  }
  const pending = scopedReports.flatMap((report) => getBuyCoverage(report, resolved.filter((opinion) => opinion.reportId === report.id)).review
    .filter((item) => !scope.institution || report.institutions.some((block) => resolveInstitution(block.institution).canonicalName === resolveInstitution(scope.institution).canonicalName && block.startLine <= item.lineNumber && block.endLine >= item.lineNumber))
    .map((item) => ({ report, item })));
  if (pending.length) {
    lines.push('', `另有 ${pending.length} 处买入相关原文尚需核对，保留在这里供逐项查看：`, '');
    for (const { report, item } of pending) {
      sources.push({ id: `review:${report.id}:${item.lineNumber}:${item.startColumn}`, reportId: report.id, date: report.date,
        institution: scope.institution ?? '', securityName: '待核对原文', lineNumber: item.lineNumber, excerpt: item.excerpt });
      lines.push(`- ${report.date} 第 ${item.lineNumber} 行：${cell(item.excerpt)} [${sources.length}]`);
    }
  }
  return { sources, answer: lines.join('\n') };
}

function cell(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]])/g, '\\$1');
}
