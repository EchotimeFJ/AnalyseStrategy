import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes=readFileSync(new URL('../data/security-aliases.json',import.meta.url));
const supplement=JSON.parse(bytes.toString()) as {verifiedAt:string;sourceUrl:string;entries:Array<{code:string;expectedName:string;names:string[]}>};
export const securityAliasProvenance={sourceUrl:supplement.sourceUrl,verifiedAt:supplement.verifiedAt,file:'security-aliases.json',sha256:createHash('sha256').update(bytes).digest('hex')};
const normalized=(name:string)=>name.normalize('NFKC').trim().toUpperCase();
export function applySecurityAliases<T extends {code:string;names:string[]}>(entries:T[]):T[]{
  return entries.map(entry=>{
    const correction=supplement.entries.find(c=>c.code===entry.code&&entry.names.some(n=>normalized(n)===normalized(c.expectedName)));
    // A reused ticker must never inherit an old issuer's translated alias.
    return correction?{...entry,names:[...new Set([...entry.names,...correction.names])]}:entry;
  });
}
