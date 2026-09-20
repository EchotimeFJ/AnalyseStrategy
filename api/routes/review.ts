import { Router } from 'express';
import { reviewStore } from '../services/reviewRuntime.js';
import { requireAdmin } from '../security.js';
import { sendCachedReport } from '../services/reportHttpCache.js';
import { ensureIndex, getReportDraft, getReportOverview } from '../services/reportIndex.js';
import { readPublication } from '../services/publicationStore.js';
import { contentHash } from '../services/reviewStore.js';

const router = Router();
// Compatibility endpoint for older clients; no review worker is registered.
router.get('/status', (_req, res) => {
  res.json({success:true,data:{enabled:false,mode:'program',total:0,queued:0,running:0,succeeded:0,partial:0,failed:0,paused:0,legacy:0}});
});
router.post('/retry', requireAdmin, (_req, res) => {
  res.status(410).json({success:false,error:{code:'REVIEW_RETIRED',message:'报告已改为程序分析，无需 AI 复核。'}});
});
router.get('/reports/:id/draft', async(req,res,next)=>{
  try{const index=await ensureIndex();if(!index.reports.some(r=>r.id===req.params.id)){res.status(404).json({success:false,error:{code:'REPORT_NOT_FOUND',message:'报告不存在'}});return;}await sendCachedReport(req,res,index,async()=>getReportDraft(req.params.id,index));}catch(error){next(error);}
});
router.get('/reports/:id/structure', async(req,res,next)=>{
  try {
    const overview=await getReportOverview(req.params.id);
    if(!overview){res.status(404).json({success:false,error:{code:'REPORT_NOT_FOUND',message:'报告不存在'}});return;}
    res.json({success:true,data:{...overview,mode:'program'}});
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
