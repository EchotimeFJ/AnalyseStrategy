import path from 'node:path';
import { groundingErrors } from './reviewGrounding.js';
import { dictionaryCodeNames } from './securityDictionary.js';
import { createIdentityStore } from './researchIdentity.js';
import type { IdentityGraph, IdentityMapping } from '../domain/identity.js';
import { RATING_DISPLAY_LABELS } from '../../src/shared/researchVocabulary.js';
import type { OpinionRecord, SecurityEntity, SourceEvidence } from '../domain/research.js';
import type { MentionRecord, ReviewedReport, SignalRecord, StatementRecord, ReviewClaim, ReviewPriceValue } from '../domain/review.js';
import type { ReportDocument, TargetMention, CatalystRiskItem } from './reportParser.js';
import { normalizeEntityName, normalizeSecurityCode, resolveInstitution, securityKey, isInvalidEntityName } from './entityResolver.js';
import { createReviewStore, contentHash, type ReviewJob, type StoredReviewResult } from './reviewStore.js';
import { reviewEnabled, reviewStore } from './reviewRuntime.js';
import { classifyOpinionTypes } from './opinionExtractor.js';

export type ReportReviewState = { status: string; sourceHash: string; publishedSourceHash?: string; model?: string; issueCount: number };
export type ReviewProjection = {
  reports: ReportDocument[]; opinions: OpinionRecord[]; mentions: TargetMention[];
  entities: Map<string, SecurityEntity>; signals: CatalystRiskItem[];
  identityGraph?: IdentityGraph; identityMapping?: Record<string, IdentityMapping>;
  facts: ReviewedReport[]; states: Record<string, ReportReviewState>; fingerprint: string;
};
const stated = <T>(claim: ReviewClaim<T> | undefined): T | null => claim?.state === 'stated' ? claim.value : null;
const labels = RATING_DISPLAY_LABELS;
const actions: Record<string, string> = { maintain:'维持',upgrade:'上调',downgrade:'下调',initiate:'首次覆盖',resume:'恢复覆盖',withdraw:'撤回' };
const money = (value: ReviewPriceValue | null) => value?.rawText ?? null;

export function isPublishableReview(result: ReviewedReport) {
  return result.complete && ['ready','partial'].includes(result.readiness) && ['valid','needs_review'].includes(result.validationState) && !result.issues.some(i=>i.severity==='error'&&i.status==='open'&&!i.recordRef);
}

export function projectReviewedReport(report: ReportDocument, result: ReviewedReport) {
  if (contentHash(report.markdown) !== result.sourceHash || result.reportId !== report.id || !isPublishableReview(result)) throw new Error('REVIEW_RESULT_NOT_PUBLISHABLE');
  const active = result.records.filter(r => !r.status || r.status === 'active');
  const mentionsById = new Map(active.filter((r): r is MentionRecord => r.kind === 'mention').map(r => [r.id,r]));
  const evidence = new Map(result.evidence.map(e => [e.evidenceId,e]));
  const ev = (ids: string[]): SourceEvidence[] => [...new Set(ids)].flatMap(id => {
    const e = evidence.get(id);
    if (!e || e.reportId !== report.id || e.reportRevisionId !== result.reportRevisionId || e.sourceHash !== result.sourceHash || !Number.isSafeInteger(e.startOffset) || !Number.isSafeInteger(e.endOffset) || e.startOffset < 0 || e.endOffset <= e.startOffset || e.endOffset > report.markdown.length || report.markdown.slice(e.startOffset,e.endOffset) !== e.quote) throw new Error('REVIEW_EVIDENCE_CORRUPT');
    const startLine = report.markdown.slice(0,e.startOffset).split('\n').length;
    const endLine = report.markdown.slice(0,e.endOffset - 1).split('\n').length;
    const startColumn = e.startOffset - report.markdown.lastIndexOf('\n',e.startOffset - 1);
    const endColumn = e.endOffset - report.markdown.lastIndexOf('\n',e.endOffset - 1);
    if(e.startLine!==startLine || e.endLine!==endLine || e.startColumn!==undefined&&e.startColumn!==startColumn || e.endColumn!==undefined&&e.endColumn!==endColumn) throw new Error('REVIEW_EVIDENCE_COORDINATES');
    return [{sourceHash:result.sourceHash,reportId:report.id,filePath:report.filePath,lineNumber:e.startLine,endLineNumber:e.endLine,startColumn:e.startColumn,endColumn:e.endColumn,excerpt:e.quote,method:e.method,confidence:e.confidence??'medium'}];
  });
  const knownName = (m:MentionRecord) => {const code=normalizeSecurityCode(m.payload.rawCode??m.payload.resolution.resolvedCode);return code&&dictionaryCodeNames(code).some(n=>n.normalize('NFKC').toLowerCase()===m.payload.rawName.normalize('NFKC').toLowerCase());};
  const validMention = (m: MentionRecord | undefined) => m && m.payload.roles.some(r=>['main_subject','recommended_target','peer','customer_supplier'].includes(r)) && !m.payload.roles.some(r => ['terminology','publisher','analyst'].includes(r)) && (!isInvalidEntityName(m.payload.rawName) || knownName(m));
  const signalRecords = active.filter((r): r is SignalRecord => r.kind === 'signal')
    .filter(s => s.payload.polarity === 'affirmative' && s.payload.temporalContext !== 'historical' && !result.issues.some(i=>i.severity==='error'&&i.status==='open'&&(!i.recordRef||[s.id,s.payload.articleRef,s.payload.subject.mentionRef].includes(i.recordRef))));
  const signals: CatalystRiskItem[] = signalRecords.map(s => {
    const subject = mentionsById.get(s.payload.subject.mentionRef ?? '');
    const source = ev(s.payload.evidenceIDs)[0];
    const article = active.find(r => r.id === s.payload.articleRef && r.kind === 'article');
    return {sourceHash:result.sourceHash,reportId:report.id,date:report.date,institution:article?.kind==='article'?stated(article.payload.publisher)??'未知机构':'未知机构',targetName:subject?.payload.rawName??s.payload.subject.rawText??undefined,type:s.payload.kind,title:s.payload.summary,excerpt:source?.excerpt??'',lineNumber:source?.lineNumber??1};
  });
  const opinions: OpinionRecord[] = [];
  const targetMentions: TargetMention[] = [];
  for (const record of active.filter((r): r is StatementRecord => r.kind === 'statement')) {
    const s=record.payload;
    const m=mentionsById.get(s.subject.mentionRef??'');
    if (!validMention(m) || !m || ['theme','market','unresolved'].includes(s.subject.scope) || s.polarity!=='affirmative' || s.modality!=='actual' || s.temporalContext!=='current') continue;
    if (result.issues.some(i=>i.status==='open'&&i.severity==='error'&&(!i.recordRef || [record.id,m.id,s.articleRef].includes(i.recordRef)))) continue;
    const resolution=m.payload.resolution;
    if (resolution.status==='conflict'||resolution.status==='ambiguous') continue;
    const name=normalizeEntityName(resolution.displayName||m.payload.rawName);
    const code=resolution.status==='resolved'?normalizeSecurityCode(resolution.resolvedCode):null;
    const security: SecurityEntity={key:resolution.resolvedSecurityKey||securityKey({name,code}),code,displayName:name,aliases:[...new Set([name,m.payload.rawName,...resolution.aliases])],confidence:resolution.confidence};
    const ratingValue=stated(s.rating);
    const rating=ratingValue?.coverage==='rated'&&ratingValue.normalizedLabel?labels[ratingValue.normalizedLabel]??null:null;
    const recommendation=stated(s.recommendation);
    const price=stated(s.targetPrice);
    const institution=resolveInstitution(s.attribution.rawName??'');
    const institutionName=institution.canonicalName||s.attribution.rawName||'未知机构';
    const evidenceIds=[...s.rating.evidenceIDs,...s.recommendation.evidenceIDs,...s.targetPrice.evidenceIDs,...s.attribution.evidenceIDs,...m.payload.nameEvidenceIDs,...record.evidenceIDs];
    const ratingSources=ev(s.rating.evidenceIDs).map(e=>({...e,method:'rating-statement'}));
    const recommendationSources=ev(s.recommendation.evidenceIDs).map(e=>({...e,method:'buy-recommendation-statement'}));
    const priceSources=ev(s.targetPrice.evidenceIDs).map(e=>({...e,method:'target-price-statement'}));
    const preferred=recommendation?.action==='buy'&&rating!=='买入'?[...recommendationSources,...ratingSources]:[...ratingSources,...recommendationSources];
    const sources=[...new Map([...preferred,...priceSources,...ev(evidenceIds)].map(e=>[`${e.method}:${e.lineNumber}:${e.startColumn}:${e.endColumn}`,e])).values()];
    const source=sources[0];
    const unsupported=groundingErrors([record],result.evidence)[0];
    if(unsupported)throw new Error(`${unsupported.code}:${record.id}:${unsupported.field}`);
    if (!source) continue;
    const actionValue=stated(s.ratingAction);const action=actionValue?actions[actionValue]??actionValue:null;
    const associated=signals.filter(signal=>signal.targetName===m.payload.rawName || signal.targetName===name);
    const types=classifyOpinionTypes({rating,action,text:'',ratingChanged:!!actionValue&&['upgrade','downgrade','initiate','resume'].includes(actionValue),targetPriceChanged:['raise','lower'].includes(stated(s.targetPriceAction)??'')});
    const opinion: OpinionRecord={rawCode:m.payload.rawCode??m.payload.rawIdentifiers.find(i=>i.interpretation==='ticker')?.text??null,sourceHash:result.sourceHash,id:record.id,reportId:report.id,reportDate:report.date,institution:institutionName,institutionVerified:institution.verified,security,sourceName:m.payload.rawName,rating,rawRating:ratingValue?.rawLabel??null,action,targetPrice:money(price),currentPrice:money(stated(s.currentPrice)),buyRecommendation:recommendation?.action==='buy',types:[...new Set([...types,...associated.map(a=>a.type as 'risk'|'catalyst')])],evidence:sources,previousRating:stated(s.priorRating)?.rawLabel,previousTargetPrice:money(stated(s.priorTargetPrice))};
    opinions.push(opinion);
    targetMentions.push({sourceHash:result.sourceHash,reviewStatementId:record.id,ratingScaleRef:ratingValue?.scaleRef??undefined,targetPriceHorizon:price?.horizonText??undefined,targetPriceComparable:price?.currency?JSON.stringify([price.currency,price.unit,price.horizonText??null,price.shape,price.amount??null,price.lower??null,price.upper??null]):undefined,reportId:report.id,date:report.date,institution:institutionName,targetName:name,aliases:security.aliases,code:code??undefined,rating:rating??undefined,rawRating:opinion.rawRating??undefined,targetPrice:opinion.targetPrice??undefined,currentPrice:opinion.currentPrice??undefined,action:action??undefined,lineNumber:source.lineNumber,excerpt:source.excerpt,signals:associated,buyRecommendation:opinion.buyRecommendation,previousRating:opinion.previousRating,previousTargetPrice:money(stated(s.priorTargetPrice))??undefined});
  }
  return {opinions,mentions:targetMentions,signals};
}

export async function loadReviewProjection(reports: ReportDocument[], sourceDir: string, storeOverride?: ReturnType<typeof createReviewStore>): Promise<ReviewProjection | null> {
  if (!storeOverride && !reviewEnabled()) return null;
  const store=storeOverride??reviewStore(sourceDir);
  const state=await store.read();
  const output: ReviewProjection={reports:[],opinions:[],mentions:[],signals:[],facts:[],entities:new Map(),states:{},fingerprint:''};
  for (const report of reports) {
    const hash=contentHash(report.markdown);
    const source=Object.values(state.sources).find(s=>s.active&&(s.filePath===report.filePath||s.reportId===report.id));
    const current=source&&state.jobs[source.jobId];
    const id=source?.reportId??report.id;
    const info:ReportReviewState={status:current?.status??'pending',sourceHash:hash,model:current?.pin?.model,issueCount:0};
    output.states[id]=info;
    const completed=Object.values(state.jobs).filter(j=>j.reportId===id&&['succeeded','partial'].includes(j.status)&&j.resultRef)
      .sort((a,b)=>(b.sourceHash===hash?1:0)-(a.sourceHash===hash?1:0)||b.updatedAt.localeCompare(a.updatedAt));
    let chosen: {job:ReviewJob;saved:StoredReviewResult<ReviewedReport>} | undefined;
    for (const job of completed) {
      const saved=await store.loadResult<ReviewedReport>(job.resultRef!);
      if(saved.reportId!==id||saved.sourceHash!==job.sourceHash||saved.result.sourceHash!==job.sourceHash)throw new Error('REVIEW_RESULT_CORRUPT');
      if(isPublishableReview(saved.result)){chosen={job,saved};break;}
    }
    if(!chosen){output.reports.push({...report,id});continue;}
    const {job:selected,saved}=chosen;
    // Keep old source and old facts together while a changed report is pending.
    const published=selected.sourceHash===hash?{...report,id}:await store.loadReport(selected);
    const projection=projectReviewedReport(published,saved.result);
    output.reports.push(published);output.opinions.push(...projection.opinions);output.mentions.push(...projection.mentions);output.signals.push(...projection.signals);output.facts.push(saved.result);
    info.publishedSourceHash=selected.sourceHash;info.issueCount=saved.result.issues.length;
    for(const opinion of projection.opinions)output.entities.set(opinion.security.key,opinion.security);
  }
  const identityInputs = output.facts.flatMap(f => f.records.filter((r): r is MentionRecord => r.kind === 'mention' && (!r.status || r.status === 'active')).map(r => ({ ...r, reportId: f.reportId, date: output.reports.find(p => p.id === f.reportId)?.date })));
  if (identityInputs.length) {
    const resolved = await createIdentityStore(path.join(store.directory, 'identities')).resolveMentions(identityInputs);
    output.identityGraph = resolved.identityGraph; output.identityMapping = resolved.mapping;
    const statementMentions = new Map(output.facts.flatMap(f => f.records.filter((r): r is StatementRecord => r.kind === 'statement').map(r => [r.id, r.payload.subject.mentionRef ?? ''] as const)));
    output.opinions = output.opinions.filter(opinion => {
      const identity = resolved.mapping[statementMentions.get(opinion.id) ?? ''];
      if (!identity) return false;
      if (identity.status === 'conflict' || identity.status === 'ambiguous') return false;
      const standardSecurity=resolved.identityGraph.securities.find(s=>s.securityId===identity.securityId);
      const standardCompany=resolved.identityGraph.organizations.find(o=>o.organizationId===identity.organizationId);
      const displayName=standardSecurity?.displayName??(standardCompany?.verificationState==='verified'?standardCompany.canonicalName:opinion.security.displayName);
      opinion.security = { ...opinion.security, displayName, aliases:[...new Set([...opinion.security.aliases,displayName,...(standardSecurity?.aliases??[]),...(standardCompany?.aliases??[])])], organizationId: identity.organizationId ?? undefined, securityId: identity.securityId ?? undefined, listingId: identity.listingId ?? undefined,
        key: identity.securityId ?? (identity.organizationId ? `organization:${identity.organizationId}` : opinion.security.key), code: identity.resolvedCode,
      };
      return true;
    });
    const visible = new Map(output.opinions.map(o => [o.id,o]));
    output.mentions = output.mentions.filter(m => m.reviewStatementId && visible.has(m.reviewStatementId)).map(m => ({ ...m, targetName:visible.get(m.reviewStatementId!)!.security.displayName,aliases:visible.get(m.reviewStatementId!)!.security.aliases,code: visible.get(m.reviewStatementId!)!.security.code ?? undefined }));
    output.entities = new Map(output.opinions.map(o => [o.security.key,o.security]));
  }
  output.fingerprint=contentHash(JSON.stringify([output.states,output.identityMapping,output.facts.map(f=>[f.sourceHash,f.candidateHash,f.operations,f.records])]));
  return output;
}
