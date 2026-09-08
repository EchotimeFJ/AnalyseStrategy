import { normalizeEntityName, normalizeSecurityCode, resolveInstitution } from './entityResolver.js';
import type { CatalystRiskItem, InstitutionBlock, ReportDocument, TargetMention } from './reportParser.js';

type Market = 'A' | 'H' | 'US' | 'SG' | 'TW' | 'JP' | 'KR';
type Line = { text: string; raw: string; number: number; offsets?: number[] };
type Candidate = {
  name: string; aliases: string[]; code?: string; market?: Market;
  line: number; start: number; end: number; innerStart: number; innerEnd: number;
  codeStart?: number; separateFields: boolean; heading: boolean; explicitName: boolean;
};
type Value = { value: string; rawValue?: string; line: number; excerpt: string; score: number; previous?: string; action?: string; startColumn?: number; endColumn?: number; tokenLength?: number };
type Row = { candidate: Candidate; references: Candidate[]; ratings: Value[]; recommendations: Value[]; prices: Value[]; currents: Value[]; priceChanged: boolean };
type Signals = (report: ReportDocument, block: InstitutionBlock, targetName?: string, range?: { startLine: number; endLine: number }) => CatalystRiskItem[];

const RATING = '(?:买入(?:[/／]高风险)?|增持|超配|中性|持有|减持|卖出|跑赢(?:大市|大盘|行业)?|跑输(?:大市|大盘|行业)?|优于大市|弱于大市|低于行业表现|Overweight|Underweight|Neutral|Buy|Hold|Sell|OW|UW)';
const CODE = /\b(\d{1,6}|[A-Z]{1,8})[.\s]+(HK|SS|SH|SZ|US|TW|KS|KQ|JP|L|O|N|SI|CH|C1|C2)\b/gi;
const PAREN = /([\p{L}][\p{L}\p{N}·・&.'’\-\s]{1,70})\(([^()]*)\)/gu;
const PRICE_LABEL = /(?:目标价(?:格)?|target price|\bTP\b|\bPT\b)/gi;
const GENERIC = /^(?:评级|投资评级|Rating|买入|增持|超配|中性|卖出|持有|公司|目标价|当前价|发布日期|估值|财务|风险|催化剂|行业|市场|主题|观点|核心|展望|摘要|结论|我们|由于|因为|因此|当|从|基于|考虑|对所有|盈利|利润|收入|营收|基本面|投资策略|投资要点|业务概览|中国互联网行业|中国房地产|视点|附录|核心要点)(?:$|[:：\s]|[^A-Za-z])/i;
const ACRONYMS = new Set(['AI', 'AH', 'EPS', 'EBIT', 'EBITDA', 'DCF', 'ROE', 'ROI', 'ASP', 'CEO', 'CFO', 'GPU', 'CPU', 'CAPEX', 'FCF', 'AIDC', 'IDC', 'OS', 'PFS', 'HR', 'DIO', 'TP', 'PT', 'HK', 'US', 'SS', 'SZ', 'RMB', 'BUY', 'HOLD', 'SELL', 'GPM', 'OPM', 'NPM', 'GMV', 'CAGR', 'TAM', 'WACC', 'SOTP', 'YTD', 'YOY', 'MOM', 'QOQ', 'CPI', 'PPI']);

function clean(value: string) {
  return value.normalize('NFKC').replace(/==|\*\*|__/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}
function nameOf(value: string) {
  return normalizeEntityName(value)
    .replace(/^.*?覆盖(?:个股|公司)\s*[:：]\s*/, '')
    .replace(/^(?:(?:我们)?(?:调整了|维持对|重申对|继续看好|看好|首推|推荐|偏好|给予|将|对)|以及|包括)\s*/, '')
    .replace(/^([A-Za-z][A-Za-z0-9 .&'’-]*)公司$/, '$1')
    .replace(/股份有限公司$/, '').trim();
}
function validName(value: string) {
  return value.length >= 2 && value.length <= 48 && !GENERIC.test(value) &&
    !/^(?:(?:推荐|投资|核心|覆盖|精选)?标的|股票|个股|的(?:买入|增持|持有|卖出))$/.test(value) &&
    !/行业|指数|风险回报|风险收益|市场展望|计价|预计|预测|以下简称|人民币|美元|港元|目标价|评级|毛利率|净利率|营业利润率|复合年增长率|每股收益/.test(value) && !ACRONYMS.has(value.toUpperCase());
}
function market(code?: string): Market | undefined {
  if (!code) return;
  const suffix = code.split('.').at(-1);
  if (suffix === 'HK') return 'H';
  if (suffix === 'SS' || suffix === 'SZ') return 'A';
  if (['US', 'N', 'O'].includes(suffix ?? '')) return 'US';
  if (suffix === 'SI') return 'SG';
  if (suffix === 'TW') return 'TW';
  if (suffix === 'JP') return 'JP';
  if (suffix === 'KS' || suffix === 'KQ') return 'KR';
}
function currency(value?: Market) {
  return value ? ({ A: '元', H: '港元', US: '美元', SG: '新元', TW: '新台币', JP: '日元', KR: '韩元' })[value] : undefined;
}
function codes(text: string) {
  return [...text.matchAll(CODE)].flatMap((match) => {
    const code = normalizeSecurityCode(match[0]);
    return code ? [{ code, start: match.index!, end: match.index! + match[0].length }] : [];
  });
}
function normalizedRating(value: string) {
  const lower = value.toLowerCase();
  if (/^buy$/.test(lower) || value.startsWith('买入')) return '买入';
  if (['ow', 'overweight'].includes(lower) || value === '超配') return '增持';
  if (/^(?:跑赢|优于大市)/.test(value)) return '增持';
  if (/^(?:跑输|弱于大市|低于行业表现)/.test(value)) return '减持';
  if (['uw', 'underweight'].includes(lower)) return '减持';
  if (lower === 'neutral') return '中性';
  if (lower === 'hold') return '持有';
  if (lower === 'sell') return '卖出';
  return value;
}

function candidatesFor(lines: Line[]) {
  const found: Candidate[] = [];
  const firstContentLine = lines.find((line) => line.text.trim() && !/^#/.test(line.text.trim()))?.number;
  for (const line of lines) {
    for (const match of line.text.matchAll(PAREN)) {
      let name = nameOf(match[1]);
      if (/[)）]\s*$/.test(line.text.slice(0, match.index!))) name = name.replace(/^(?:和|与|及)\s*/, '');
      if (!validName(name)) continue;
      const inside = match[2];
      const listed = codes(inside);
      const bare = /^[A-Z][A-Z0-9.-]{0,6}$/.test(inside.trim()) && !ACRONYMS.has(inside.trim());
      const explicitName = /^\s*(?:[#>*•-]+\s*)?覆盖(?:个股|公司)\s*[:：]/.test(line.text);
      const hasField = new RegExp(`(?:^|[^A-Za-z])${RATING}(?:$|[^A-Za-z])`, 'i').test(inside) || /目标价|target price/i.test(inside);
      const following = lines.find((item) => item.number > line.number && item.text.trim())?.text.trim();
      const companyProfile = /^(?:公司描述|公司简介|Company Description)$/i.test(following ?? '');
      if (!listed.length && !bare && !hasField && !explicitName && !companyProfile) continue;
      const start = match.index!;
      const recommendationPrefix = line.text.slice(Math.max(0, start - 35), start);
      const namedRecommendation = /首推|首选|看好|推荐|买入|增持|持有|卖出|评级/.test(recommendationPrefix);
      // A parenthesized industry abbreviation is not a ticker just because it
      // is uppercase. Bare symbols need title or recommendation structure.
      if (bare && !listed.length && !hasField && !explicitName && !companyProfile && line.number !== firstContentLine && !namedRecommendation) continue;
      const innerStart = start + match[0].indexOf('(') + 1;
      const prefix = line.text.slice(0, start).trim();
      const prefixedRating = new RegExp(`^[【\\[]${RATING}[】\\]]$`, 'i').test(prefix);
      const atHeading = !prefix || /^[#>*•\d.\s-]+$/.test(prefix) || explicitName || prefixedRating;
      const tail = line.text.slice(start + match[0].length).trim();
      const heading = atHeading && (listed.length > 0 || explicitName || companyProfile || hasField || prefixedRating || line.number === firstContentLine || /^[:：]?$/.test(tail));
      const aliases = inside.split(/[/,，;；]/).map((part) => part.trim()).filter((part) =>
        part.length >= 2 && !new RegExp(`(?:^|[^A-Za-z])${RATING}(?:$|[^A-Za-z])`, 'i').test(part) && !/目标价|\$|\d.*(?:元|币)/.test(part) && !codes(part).length && !ACRONYMS.has(part.toUpperCase()));
      const separateFields = listed.slice(0, -1).some((code, index) =>
        new RegExp(`${RATING}|目标价`, 'i').test(inside.slice(code.end, listed[index + 1].start)));
      for (const item of listed.length ? listed : [{ code: undefined, start: 0, end: 0 }]) {
        found.push({ name, aliases, code: item.code, market: market(item.code), line: line.number,
          start, end: start + match[0].length, innerStart, innerEnd: innerStart + inside.length,
          codeStart: item.code ? innerStart + item.start : undefined, separateFields, heading, explicitName });
      }
    }
  }
  // PDF/plain-text layouts often put 公司 / company name / ticker on separate
  // lines. Use actual title/field structure, never a blanket keyword override.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const text = line.text.trim().replace(/^#+\s*/, '').split(/\s+\|\s+/)[0];
    if (/[()。！？:：]/.test(text) || text.length > 48 || !validName(nameOf(text))) continue;
    if (found.some((candidate) => candidate.line === line.number)) continue;
    const previous = lines.slice(0, index).filter((item) => item.text.trim()).at(-1)?.text.trim();
    const firstContent = lines.find((item) => item.text.trim() && !/^#/.test(item.text.trim()));
    const fieldTitle = previous === '公司' || /^Company$/i.test(previous ?? '');
    const sectionTitle = firstContent?.number === line.number;
    if (!fieldTitle && !sectionTitle) continue;
    if (!fieldTitle && resolveInstitution(text).verified) continue;
    if (!lines.some((item) => new RegExp(`${RATING}|目标价`, 'i').test(item.text))) continue;
    const name = nameOf(text);
    const named = found.filter((candidate) => candidate.code && (name.includes(candidate.name) || candidate.name.includes(name)));
    const nearby = lines.slice(index + 1, index + 4).flatMap((item) => codes(item.text));
    const code = named.length === 1 ? named[0].code : nearby.length === 1 ? nearby[0].code : undefined;
    found.push({ name: named.length === 1 ? named[0].name : name, aliases: named.length === 1 ? [name] : [], code,
      market: market(code), line: line.number, start: line.text.indexOf(text), end: line.text.length,
      innerStart: -1, innerEnd: -1, separateFields: false, heading: true, explicitName: true });
  }
  const byName = new Map<string, Set<string>>();
  for (const candidate of found) if (candidate.code) {
    const key = candidate.name.toLowerCase();
    byName.set(key, new Set([...(byName.get(key) ?? []), candidate.code]));
  }
  for (const candidate of found) if (!candidate.code) {
    const known = byName.get(candidate.name.toLowerCase());
    if (known?.size === 1) { candidate.code = [...known][0]; candidate.market = market(candidate.code); }
  }
  return found.sort((a, b) => a.line - b.line || a.start - b.start || (a.codeStart ?? 0) - (b.codeStart ?? 0));
}

function sentenceBounds(text: string, position: number) {
  const left = Math.max(text.lastIndexOf('。', position - 1), text.lastIndexOf('；', position - 1), text.lastIndexOf(';', position - 1), text.lastIndexOf('！', position - 1), text.lastIndexOf('？', position - 1)) + 1;
  const next = text.slice(position).search(/[。；;！？]/);
  return { left, right: next < 0 ? text.length : position + next };
}
function marketHint(text: string): Market | undefined {
  const joint = [...text.matchAll(/(?:A\s*股?\s*[/／]\s*H|H\s*股?\s*[/／]\s*A)\s*股/gi)];
  const hints = [...text.matchAll(/A\s*股|H\s*股|港股|美股|ADR/gi)].filter((match) =>
    !joint.some((item) => item.index! <= match.index! && item.index! + item[0].length >= match.index! + match[0].length));
  const last = hints.at(-1)?.[0].toUpperCase();
  return last?.startsWith('A') && last !== 'ADR' ? 'A' : last === '港股' || last?.startsWith('H') ? 'H' : last ? 'US' : undefined;
}
function owners(line: Line, position: number, candidates: Candidate[], headings: Candidate[]) {
  const sameLine = candidates.filter((candidate) => candidate.line === line.number);
  const prefixRating = /^[#>*•\s【[-]*$/.test(line.text.slice(0, position));
  if (prefixRating && sameLine.length && position < sameLine[0].start) {
    return sameLine.filter((candidate) => candidate.start === sameLine[0].start);
  }
  const enclosed = sameLine.filter((candidate) => candidate.innerStart <= position && candidate.innerStart >= 0 && candidate.innerEnd >= position);
  if (enclosed.length) {
    if (enclosed.some((candidate) => candidate.separateFields)) {
      const last = enclosed.filter((candidate) => (candidate.codeStart ?? candidate.start) < position).at(-1);
      return last ? [last] : [];
    }
    return enclosed;
  }
  const bounds = sentenceBounds(line.text, position);
  const before = line.text.slice(bounds.left, position);
  // Explicitly named companies in the current clause take precedence over the
  // article heading, including peer companies mentioned in parentheses.
  const named = candidates.flatMap((candidate) => {
    const terms = [candidate.name, ...candidate.aliases, candidate.code ?? ''].filter((term) => term.length >= 2);
    const at = Math.max(...terms.map((term) => before.toLowerCase().lastIndexOf(term.toLowerCase())));
    return at >= 0 ? [{ candidate, at }] : [];
  });
  let selected: Candidate[];
  if (named.length) {
    const last = Math.max(...named.map((item) => item.at));
    selected = named.filter((item) => item.at === last).map((item) => item.candidate);
  } else {
    selected = headings.filter((candidate) => candidate.line <= line.number);
    if (selected.length) {
      const lastLine = Math.max(...selected.map((candidate) => candidate.line));
      selected = selected.filter((candidate) => candidate.line === lastLine);
    } else if (/^(?:买入|增持|超配|中性|持有|卖出|减持|Rating|投资评级|评级)/i.test(line.text.trim())) {
      const next = headings.find((candidate) => candidate.line > line.number && candidate.line - line.number <= 5);
      selected = next ? headings.filter((candidate) => candidate.line === next.line) : [];
    }
  }
  const hint = marketHint(before);
  if (hint) selected = selected.filter((candidate) => candidate.market === hint || !candidate.market);
  return [...new Map(selected.map((candidate) => [candidate.code ?? candidate.name.toLowerCase(), candidate])).values()];
}

function originalOffsets(line: Line) {
  if (line.offsets) return line.offsets;
  // Map normalized character positions back to the original text; formatting
  // markers are never removed from the evidence users open or copy.
  const offsets: number[] = [];
  for (let index = 0; index < line.raw.length;) {
    if (['==', '**', '__'].includes(line.raw.slice(index, index + 2))) { index += 2; continue; }
    const character = String.fromCodePoint(line.raw.codePointAt(index)!);
    const normalized = clean(character);
    for (let j = 0; j < normalized.length; j++) offsets.push(index);
    index += character.length;
  }
  offsets.push(line.raw.length);
  line.offsets = offsets;
  return offsets;
}
function excerpt(line: Line, position: number) {
  const offsets = originalOffsets(line);
  const bounds = sentenceBounds(line.text, position);
  return line.raw.slice(offsets[bounds.left] ?? 0, offsets[Math.min(line.text.length, bounds.right + 1)] ?? line.raw.length).trim();
}

function ratingValues(line: Line) {
  const results: Array<Value & { position: number }> = [];
  const transitions = new RegExp(`(?:从|由)\\s*["']?(${RATING})["']?(?:评级)?\\s*(上调|下调|调整|调升|调降)\\s*(?:至|为)\\s*["']?(${RATING})`, 'gi');
  const oldRanges: Array<[number, number]> = [];
  for (const match of line.text.matchAll(transitions)) {
    const newPosition = match.index! + match[0].lastIndexOf(match[3]);
    oldRanges.push([match.index!, newPosition]);
    results.push({ value: normalizedRating(match[3]), rawValue: match[3], previous: normalizedRating(match[1]), action: match[2],
      position: newPosition, tokenLength: match[3].length, line: line.number, excerpt: excerpt(line, newPosition), score: 5 });
  }
  for (const match of line.text.matchAll(new RegExp(RATING, 'gi'))) {
    const position = match.index!;
    if (oldRanges.some(([start, end]) => position >= start && position <= end)) continue;
    if (/^[A-Za-z]/.test(match[0]) && /[A-Za-z]/.test((line.text[position - 1] ?? '') + (line.text[position + match[0].length] ?? ''))) continue;
    const before = line.text.slice(Math.max(0, position - 45), position);
    const after = line.text.slice(position + match[0].length, position + match[0].length + 18);
    if (/(?:此前|原为|原先|原评级|曾经|不再|并非|不是)[^。；]{0,12}$/.test(before) || /^["']?评级以来/.test(after)) continue;
    const standalone = line.text.trim().replace(/["']/g, '') === match[0];
    const labeled = /(?:投资评级|评级|Rating)\s*[:：]?\s*["']?$/i.test(before) || /^["']?\s*(?:评级|Rating)/i.test(after);
    const acted = /(?:维持|重申|首予|首次给予|给予|上调至|下调至|评级为)[^。；,，]{0,25}["']?$/.test(before);
    const inline = /[(,，;；]\s*["']?$/.test(before) && /^["']?\s*[,，;；)/]/.test(after);
    const bracketed = /[【[]\s*$/.test(before) && /^\s*[】\]]/.test(after);
    if (!standalone && !labeled && !acted && !inline && !bracketed) continue;
    const action = /首予|首次给予/.test(before) ? '首予' : /重申/.test(before) ? '重申' : /维持/.test(before) ? '维持' : /下调至/.test(before) ? '下调' : /上调至/.test(before) ? '上调' : undefined;
    results.push({ value: normalizedRating(match[0]), rawValue: match[0], position, tokenLength: match[0].length, line: line.number, excerpt: excerpt(line, position), action, score: standalone ? 3 : inline ? 4 : 5 });
  }
  for (const result of results) {
    const offsets = originalOffsets(line);
    result.startColumn = (offsets[result.position] ?? result.position) + 1;
    result.endColumn = (offsets[result.position + (result.tokenLength ?? result.value.length)] ?? line.raw.length) + 1;
  }
  return results;
}

function buyRecommendations(line: Line) {
  return [...line.text.matchAll(/(?:建议|推荐)[^。；,，]{0,20}买入|(?:积极|逢低|择机)买入/g)].flatMap((match) => {
    const position = match.index! + match[0].lastIndexOf('买入');
    const before = line.text.slice(Math.max(0, match.index! - 100), match.index!);
    if (/(?:不|未|别|避免)\s*$|参见[^。]{0,85}报告|此前[^。]{0,30}|曾经[^。]{0,20}/.test(before)) return [];
    const offsets = originalOffsets(line);
    return [{ value: '买入', line: line.number, position, excerpt: excerpt(line, position), score: 4,
      startColumn: (offsets[position] ?? position) + 1, endColumn: (offsets[position + 2] ?? line.raw.length) + 1 }];
  });
}

type Money = { number: string; currency?: string; position: number; end: number };
function money(text: string) {
  const pattern = /(HK\$|US\$|HKD|USD|RMB|CNY|人民币|港币|港元|美元|新台币|新元|新加坡元|日元|韩元|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(元人民币|人民币|港元|美元|新台币|新元|新加坡元|日元|韩元|元)?/gi;
  const found: Money[] = [];
  for (const match of text.matchAll(pattern)) {
    const tail = text.slice(match.index! + match[0].length);
    if (!match[1] && !match[3] && /^(?:%|年|财年|倍|亿|万|股|个月|季度|\.[A-Z])/i.test(tail)) continue;
    if (!match[1] && !match[3] && /^[-~至到]\s*\d+(?:\.\d+)?\s*%/.test(tail)) continue;
    const unit = match[3] || match[1];
    const normalized = unit && (/HK\$|HKD|港币|港元/i.test(unit) ? '港元' : /US\$|USD|美元|^\$$/i.test(unit) ? '美元' : /RMB|CNY|人民币|^元$/i.test(unit) ? '元' : unit === '新加坡元' ? '新元' : unit);
    found.push({ number: String(Number(match[2].replace(/,/g, ''))), currency: normalized,
      position: match.index! + match[0].indexOf(match[2]), end: match.index! + match[0].length });
  }
  return found;
}

function priceValues(line: Line, current = false) {
  const labels = [...line.text.matchAll(current ? /(?:当前股价|现价|current price)/gi : PRICE_LABEL)];
  return labels.flatMap((label, index) => {
    const start = label.index! + label[0].length;
    const prefix = line.text.slice(Math.max(0, label.index! - 14), label.index!);
    if (/牛市|熊市|乐观|悲观|此前|原先/.test(prefix)) return [];
    const bounds = sentenceBounds(line.text, start);
    let end = Math.min(bounds.right, labels[index + 1]?.index ?? line.text.length, start + 170);
    const explanation = line.text.slice(start, end).search(/基于|对应|应用|反映|意味着|以反映|较此前|原为|此前为|之前为/);
    if (explanation >= 0) end = start + explanation;
    let text = line.text.slice(start, end);
    if (current) text = text.replace(/^\s*\([^)]*\)/, '');
    if (current && !/^\s*(?:[:：]|为|约为|约)?\s*(?:HK\$|US\$|HKD|USD|RMB|CNY|人民币|港币|港元|美元|\$)?\s*\d/i.test(text)) return [];
    const values = money(text);
    if (!values.length) {
      if (current) return [];
      const before = line.text.slice(Math.max(0, label.index! - 55), label.index!);
      const previousAmount = money(before).filter((value) => value.currency && /^\s*的?\s*$/.test(before.slice(value.end))).at(-1);
      return previousAmount ? [{ position: label.index!, values: [previousAmount], previous: [], changed: false, score: 5 }] : [];
    }
    const transition = /从|由/.test(text.slice(0, values[0].position));
    const changed = !current && /上调|下调|升至|降至|提高|降低|调整/.test(text);
    const marker = text.match(/(?:上调|下调|调整|提高|降低|调升|调降|升|降)\s*(?:至|为)/);
    const boundary = marker ? marker.index! + marker[0].length : -1;
    const pair = transition && boundary >= 0 && values.some((value) => value.position >= boundary);
    const selected = pair ? values.filter((value) => value.position >= boundary) : values;
    return [{ position: label.index!, values: selected, previous: pair ? values.filter((value) => value.position < boundary) : [],
      changed, score: pair ? 6 : selected[0].currency ? 5 : 3 }];
  });
}

export function recognizeTargets(report: ReportDocument, signals: Signals): TargetMention[] {
  const output: TargetMention[] = [];
  for (const block of report.institutions) {
    const lines = report.lines.slice(block.startLine - 1, block.endLine).map((raw, index) => ({ raw, text: clean(raw), number: block.startLine + index }));
    const candidates = candidatesFor(lines);
    const headings = candidates.filter((candidate) => candidate.heading);
    const rows = new Map<string, Row>();
    const key = (candidate: Candidate) => candidate.code ?? candidate.name.toLowerCase();
    const rowFor = (candidate: Candidate) => {
      const existing = rows.get(key(candidate));
      if (existing) {
        if (!existing.references.includes(candidate)) existing.references.push(candidate);
        existing.candidate.aliases = [...new Set([...existing.candidate.aliases, candidate.name, ...candidate.aliases])];
        return existing;
      }
      const row: Row = { candidate, references: [candidate], ratings: [], recommendations: [], prices: [], currents: [], priceChanged: false };
      rows.set(key(candidate), row);
      return row;
    };
    for (const candidate of candidates) rowFor(candidate);
    for (const line of lines) {
      for (const rating of ratingValues(line)) for (const owner of owners(line, rating.position, candidates, headings)) rowFor(owner).ratings.push(rating);
      for (const recommendation of buyRecommendations(line)) for (const owner of owners(line, recommendation.position, candidates, headings)) rowFor(owner).recommendations.push(recommendation);
      for (const current of [false, true]) for (const field of priceValues(line, current)) {
        for (const owner of owners(line, field.position, candidates, headings)) {
          const expectedCurrency = currency(owner.market);
          const compatible = field.values.filter((value) => !expectedCurrency || !value.currency || value.currency === expectedCurrency);
          const value = compatible[0];
          if (!value) continue;
          const unit = value.currency || expectedCurrency || '';
          const previous = field.previous.find((item) => !unit || !item.currency || item.currency === unit);
          const result: Value = { value: `${value.number}${unit ? ` ${unit}` : ''}`, line: line.number, excerpt: excerpt(line, field.position), score: field.score,
            previous: previous ? `${previous.number}${previous.currency || unit ? ` ${previous.currency || unit}` : ''}` : undefined };
          const row = rowFor(owner);
          (current ? row.currents : row.prices).push(result);
          if (!current && field.changed) row.priceChanged = true;
        }
      }
      if (/目标价[^。\n]{0,35}(?:上调|下调)|(?:上调|下调)[^。\n]{0,15}目标价/.test(line.text)) {
        const at = line.text.indexOf('目标价');
        for (const owner of owners(line, at, candidates, headings)) rowFor(owner).priceChanged = true;
      }
    }
    const best = (values: Value[]) => values.slice().sort((a, b) => b.score - a.score || b.line - a.line)[0];
    for (const row of rows.values()) {
      const c = row.candidate;
      const rating = best(row.ratings), price = best(row.prices), current = best(row.currents);
      const recommendation = best(row.recommendations);
      const alternatives = [...new Set(row.ratings.map((value) => value.value))];
      const resolvedTransition = rating?.previous && row.ratings.every((value) => value.line <= rating.line && [rating.value, rating.previous].includes(value.value));
      const conflicting = alternatives.length > 1 && !resolvedTransition;
      if (!c.code && !rating && !recommendation && !price && !current) continue;
      const nextHeading = headings.find((candidate) => candidate.line > c.line);
      const endLine = c.heading ? (nextHeading?.line ?? block.endLine + 1) - 1 : c.line;
      const context = report.lines.slice(c.line - 1, endLine).join(' ').trim();
      const relatedRatings = row.ratings.filter((value) => value.value === rating?.value && value !== rating);
      const relatedSignals = row.references.flatMap((candidate) => {
        const next = headings.find((item) => item.line > candidate.line);
        return signals(report, block, c.name, { startLine: candidate.line, endLine: candidate.heading ? (next?.line ?? block.endLine + 1) - 1 : candidate.line });
      });
      output.push({ reportId: report.id, date: report.date, institution: block.institution,
        targetName: c.name, aliases: [...new Set([c.name, ...c.aliases, ...(c.code ? [c.code] : [])])], code: c.code,
        rating: conflicting ? undefined : rating?.value, previousRating: rating?.previous, action: conflicting ? undefined : rating?.action,
        rawRating: conflicting ? undefined : rating?.rawValue,
        ratingAlternatives: conflicting ? alternatives : undefined,
        buyRecommendation: Boolean(recommendation),
        targetPrice: price?.value, previousTargetPrice: price?.previous, currentPrice: current?.value,
        lineNumber: rating?.line ?? price?.line ?? c.line, headingLineNumber: c.line,
        excerpt: context.slice(0, 520),
        fieldEvidence: [recommendation && rating?.value !== '买入' && { field: 'buy-recommendation' as const, lineNumber: recommendation.line, excerpt: recommendation.excerpt, startColumn: recommendation.startColumn, endColumn: recommendation.endColumn },
          rating && { field: 'rating' as const, lineNumber: rating.line, excerpt: rating.excerpt, startColumn: rating.startColumn, endColumn: rating.endColumn },
          price && { field: 'target-price' as const, lineNumber: price.line, excerpt: price.excerpt },
          current && { field: 'current-price' as const, lineNumber: current.line, excerpt: current.excerpt },
          ...(conflicting ? row.ratings.filter((value) => value !== rating) : relatedRatings).map((value) => ({ field: 'rating' as const, lineNumber: value.line, excerpt: value.excerpt, startColumn: value.startColumn, endColumn: value.endColumn }))].filter((value): value is NonNullable<typeof value> => Boolean(value)),
        ratingChanged: Boolean(rating?.previous && rating.previous !== rating.value || rating?.action && /首予|首次|恢复|上调|下调/.test(rating.action)),
        targetPriceChanged: row.priceChanged,
        signals: [...new Map(relatedSignals.map((signal) => [`${signal.type}:${signal.lineNumber}`, signal])).values()],
      });
    }
  }
  return output;
}
