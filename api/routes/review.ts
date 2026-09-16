import { Router } from 'express';
import { reviewStatus, reviewStore, reviewEnabled } from '../services/reviewRuntime.js';
import { requireAdmin } from '../security.js';
import { sendCachedReport } from '../services/reportHttpCache.js';
import { ensureIndex, getReportDraft } from '../services/reportIndex.js';
import { readPublication } from '../services/publicationStore.js';
import { contentHash } from '../services/reviewStore.js';

const router = Router();
let wake: (() => void) | undefined;
export function registerReviewWake(callback: () => void) { wake = callback; }
router.get('/status', async (_req,res,next) => {
  try { res.setHeader('Cache-Control','no-store'); res.json({success:true,data:await reviewStatus()}); } catch(error){next(error);}
});
router.post('/retry', requireAdmin, async(req,res,next)=>{
  try {
    if (!reviewEnabled() || !wake) {res.status(503).json({success:false,error:{code:'REVIEW_NOT_RUNNING',message:'自动复核尚未启动，请检查服务器配置'}});return;}
    if (req.body.reportId !== undefined && (typeof req.body.reportId !== 'string'||req.body.reportId.length>200)) {res.status(400).json({success:false,error:{code:'INVALID_REPORT',message:'报告标识不正确'}});return;}
    const count=await reviewStore().retry(req.body.reportId);wake();
    res.json({success:true,data:{queued:count}});
  }catch(error){next(error);}
});
router.get('/reports/:id/draft', async(req,res,next)=>{
  try{const index=await ensureIndex();if(!index.reports.some(r=>r.id===req.params.id)){res.status(404).json({success:false,error:{code:'REPORT_NOT_FOUND',message:'报告不存在'}});return;}await sendCachedReport(req,res,index,async()=>getReportDraft(req.params.id,index));}catch(error){next(error);}
});
// Public structured facts only; candidate tombstones and original model output
// remain in the private store, never in a public list/assistant payload.
router.get('/reports/:id/structure', async(req,res,next)=>{
  try{
    const index=await ensureIndex();const result=index.reviewFacts?.find(r=>r.reportId===req.params.id);
    if(!result){res.status(404).json({success:false,error:{code:'REVIEW_PENDING',message:'该报告尚无已发布的结构化结果'}});return;}
    res.json({success:true,data:{publicationId:index.version,reportId:result.reportId,sourceHash:result.sourceHash,records:result.records.filter(r=>!r.status||r.status==='active'),evidence:result.evidence,identityGraph:index.identityGraph??null,identityMapping:Object.fromEntries(result.records.filter(r=>r.kind==='mention').flatMap(r=>index.identityMapping?.[r.id]?[[r.id,index.identityMapping[r.id]]]:[])),readiness:result.readiness}});
  }catch(error){next(error);}
});
router.get('/reports/:id/revisions/:hash', async(req,res,next)=>{
  try{
    if(!/^[a-f0-9]{64}$/.test(req.params.hash)||req.params.id.length>200){res.status(400).json({success:false,error:{code:'INVALID_REVISION',message:'原文版本不正确'}});return;}
    const index=await ensureIndex({checkSource:false});
    const current=index.reports.find(r=>r.id===req.params.id&&contentHash(r.markdown)===req.params.hash);
    const publication=await readPublication();
    if(!current&&!publication?.reviewRevisions?.some(r=>r.reportId===req.params.id&&r.sourceHash===req.params.hash)){res.status(404).json({success:false,error:{code:'REVISION_NOT_PUBLISHED',message:'该原文版本不存在或尚未发布'}});return;}
    const report=current??await reviewStore().loadReport({reportId:req.params.id,sourceHash:req.params.hash});
    res.json({success:true,data:{...report,targetCount:0,mentions:[],sourceHash:req.params.hash,publicationId:`revision:${req.params.hash}`,review:{status:'historical',sourceHash:req.params.hash,publishedSourceHash:req.params.hash}}});
  }catch(error){next(error);}
});
export default router;
