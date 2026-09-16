import type { ReviewRecord, ReviewEvidence, StatementRecord } from '../domain/review.js';
import { normalizeRatingLabel } from '../../src/shared/researchVocabulary.js';

/** Literal field support, separate from the model's broader semantic review. */
export function groundingErrors(records: ReviewRecord[], evidence: ReviewEvidence[]) {
  const byId=new Map(evidence.map(e=>[e.evidenceId,e]));
  const bareCodes = new Set(records.flatMap(r => r.kind === 'mention' ? r.payload.rawIdentifiers.filter(i => i.interpretation === 'ticker' && /^\d{4,6}$/.test(i.text)).map(i => i.text) : []));
  const errors:Array<{recordId:string;field:string;code:string}>=[];
  const quote=(ids:string[])=>ids.map(id=>byId.get(id)?.quote??'').join('\n');
  const number=(value:string)=>{
    const [integer,fraction='']=value.replace(/,/g,'').replace(/^\+/,'').split('.');
    const whole=integer.replace(/^(-?)0+(?=\d)/,'$1');const tail=fraction.replace(/0+$/,'');
    return tail?`${whole}.${tail}`:whole;
  };
  for(const record of records.filter((r):r is StatementRecord=>r.kind==='statement'&&r.status!=='deleted'&&r.status!=='deferred')){
    const rating=record.payload.rating;
    if(rating?.state==='stated'&&rating.value?.coverage==='rated'){
      const expected=normalizeRatingLabel(rating.value.rawLabel);
      const text=quote(rating.evidenceIDs).normalize('NFKC').toLowerCase();
      if(!text.includes(rating.value.rawLabel.normalize('NFKC').toLowerCase()) || expected && expected!==rating.value.normalizedLabel || !expected && rating.value.normalizedLabel==='buy')errors.push({recordId:record.id,field:'rating',code:'REVIEW_RATING_UNSUPPORTED'});
    }
    for(const field of ['targetPrice','priorTargetPrice','currentPrice'] as const){
      const claim=record.payload[field];if(claim?.state!=='stated'||!claim.value)continue;
      const text=quote(claim.evidenceIDs);const value=claim.value;
      const numbers=new Set([...text.matchAll(/[+-]?\d+(?:,\d{3})*(?:\.\d+)?/g)].filter(m=>{const after=text.slice(m.index!+m[0].length);const before=text.slice(Math.max(0,m.index!-20),m.index);return !/^\s*\.?(?:CH|HK|SS|SH|SZ|BJ|US|JP|TW|KS)\b/i.test(after)&&(!bareCodes.has(m[0])||/^\s*(?:元|港元|美元|人民币|HKD|USD|CNY)/i.test(after)||/(?:目标价|target price|TP)\s*[:：]?\s*$/i.test(before));}).map(m=>number(m[0])));
      const values=value.shape==='range'?[value.lower,value.upper]:[value.amount];
      if(values.some(v=>typeof v!=='string'||!numbers.has(number(v))))errors.push({recordId:record.id,field,code:'REVIEW_PRICE_UNSUPPORTED'});
    }
  }
  return errors;
}
