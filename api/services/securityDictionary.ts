import fs from 'node:fs';

type Entry = { code: string; symbol: string; names: string[] };
const data = JSON.parse(fs.readFileSync(new URL('../data/securities.json', import.meta.url), 'utf8')) as { securities: Entry[] };
const bySymbol = new Map<string, Set<string>>();
const byName = new Map<string, Set<string>>();
const normalize = (text: string) => text.normalize('NFKC').trim().toLowerCase();
function add(map: Map<string, Set<string>>, key: string, code: string) {
  const values = map.get(key) ?? new Set<string>();
  values.add(code); map.set(key, values);
}
for (const entry of data.securities) {
  const symbols = entry.code.endsWith('.HK') ? [entry.symbol, entry.code.split('.')[0]] : [entry.symbol];
  for (const symbol of symbols) add(bySymbol, symbol.toUpperCase(), entry.code);
  for (const name of entry.names) add(byName, normalize(name), entry.code);
}

// Exact user queries may omit the market. Never resolve a collision arbitrarily.
export function lookupBareCode(input: string): string | null {
  const key = input.normalize('NFKC').trim().toUpperCase();
  if (!/^(?:\d{4,6}|[A-Z][A-Z0-9.-]{0,9})$/.test(key)) return null;
  const found = bySymbol.get(key);
  return found?.size === 1 ? [...found][0] : null;
}

// Used only on a structural company candidate, not arbitrary prose. Longest
// suffix allows “同时覆盖国电南瑞” without collecting an ever-growing verb list.
export function dictionaryName(text: string): { name: string; codes: string[] } | null {
  for (let start = 0; start < text.length - 1; start++) {
    if (start && /[A-Za-z]/.test(text[start - 1]) && /[A-Za-z]/.test(text[start])) continue;
    const name = text.slice(start).trim();
    const codes = byName.get(normalize(name));
    if (codes) return { name, codes: [...codes] };
  }
  return null;
}
