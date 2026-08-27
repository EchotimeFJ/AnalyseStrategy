import type { SecurityEntity } from '../domain/research.js';

const INSTITUTION_ALIASES: Record<string, string> = {
  UBS: '瑞银',
  中信证券: '中信证券',
  中金: '中金',
  中金公司: '中金',
  中银国际: '中银国际',
  光大证券: '光大证券',
  华泰证券: '华泰证券',
  国泰海通: '国泰海通',
  国泰君安: '国泰君安',
  摩根士丹利: '摩根士丹利',
  摩根大通: '摩根大通',
  瑞银: '瑞银',
  瑞信: '瑞信',
  申万宏源: '申万宏源',
  花旗: '花旗',
  高盛: '高盛',
  麦格理: '麦格理',
};

const INVALID_EXACT = new Set([
  'AI',
  'AH',
  'A股',
  'H股',
  '未覆盖',
  '买入',
  '增持',
  '中性',
  '持有',
  '减持',
  '卖出',
  '零件材料',
  '行业',
  '市场',
  '主题',
]);

const CODE_PATTERN = /^([A-Z]{1,6}|\d{4,6})[.\s-]?(HK|SS|SH|SZ|US|TW|KS|KQ|JP|L|O|N|SI)$/i;

export function normalizeSecurityCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.normalize('NFKC').trim().replace(/\s+/g, '');
  const match = normalized.match(CODE_PATTERN);
  if (!match) return null;
  const market = match[2].toUpperCase() === 'SH' ? 'SS' : match[2].toUpperCase();
  return `${match[1].toUpperCase()}.${market}`;
}

export function normalizeEntityName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/^精选\s*[-—:：]\s*/, '')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInvalidEntityName(input: string): boolean {
  const name = normalizeEntityName(input);
  if (!name || name.length < 2 || name.length > 48) return true;
  if (INVALID_EXACT.has(name.toUpperCase()) || INVALID_EXACT.has(name)) return true;
  return /^(?:评级|目标价|当前价|催化剂|风险|估值|财务|宏观|市场|行业|主题)/.test(name);
}

export function securityKey(input: { code?: string | null; name: string }): string {
  const code = normalizeSecurityCode(input.code);
  if (code) return `code:${code}`;
  return `name:${normalizeEntityName(input.name).toLowerCase()}`;
}

export function resolveInstitution(input: string): {
  rawName: string;
  canonicalName: string;
  verified: boolean;
} {
  const rawName = input.trim();
  const normalized = normalizeEntityName(rawName);
  const canonicalName = INSTITUTION_ALIASES[normalized] ?? normalized;
  return {
    rawName,
    canonicalName,
    verified: Boolean(INSTITUTION_ALIASES[normalized]),
  };
}

export function chooseCanonicalSecurityName(names: string[]): string {
  const counts = new Map<string, { count: number; first: number }>();
  names.forEach((value, index) => {
    const name = normalizeEntityName(value);
    if (isInvalidEntityName(name)) return;
    const current = counts.get(name);
    counts.set(name, { count: (current?.count ?? 0) + 1, first: current?.first ?? index });
  });
  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].first - right[1].first)[0]?.[0] ?? '待识别证券';
}

export function mergeSecurityEntities(
  inputs: Array<{ name: string; code?: string | null; aliases?: string[] }>,
): Map<string, SecurityEntity> {
  const grouped = new Map<string, Array<{ name: string; code?: string | null; aliases?: string[] }>>();
  for (const input of inputs) {
    const key = securityKey(input);
    grouped.set(key, [...(grouped.get(key) ?? []), input]);
  }

  return new Map(
    [...grouped.entries()].map(([key, values]) => {
      const aliases = [...new Set(values.flatMap((item) => [item.name, ...(item.aliases ?? [])]).map(normalizeEntityName))]
        .filter((name) => !isInvalidEntityName(name));
      const code = values.map((item) => normalizeSecurityCode(item.code)).find(Boolean) ?? null;
      return [key, {
        key,
        code,
        displayName: chooseCanonicalSecurityName(values.map((item) => item.name)),
        aliases,
        confidence: code ? 'high' : 'medium',
      } satisfies SecurityEntity];
    }),
  );
}
