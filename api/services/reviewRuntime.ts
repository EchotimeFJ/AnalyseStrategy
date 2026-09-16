import path from 'node:path';
import { createReviewStore, contentHash } from './reviewStore.js';
import { getReportDir } from '../runtimeConfig.js';
import { aiConfigStore } from './aiConfig.js';

let workerRunning = false;
export function setReviewWorkerRunning(value: boolean) { workerRunning = value; }

export function reviewEnabled() {
  if (process.env.RESEARCH_REVIEW_ENABLED === 'false') return false;
  return process.env.RESEARCH_REVIEW_ENABLED === 'true' || Boolean(process.env.AI_CONFIG_SECRET || process.env.AI_API_KEY);
}
export function reviewStore(sourceDir = getReportDir()) {
  const root = process.env.RESEARCH_REVIEW_DIR || path.resolve('data/runtime/research-review');
  return createReviewStore(path.join(root, contentHash(path.resolve(sourceDir)).slice(0, 20)));
}
export async function reviewStatus() {
  const enabled = reviewEnabled() && workerRunning;
  const state = await reviewStore().read();
  const jobs = Object.values(state.sources).filter(s => s.active).map(s => state.jobs[s.jobId]).filter(Boolean);
  const count = (...statuses: string[]) => jobs.filter(j => statuses.includes(j.status)).length;
  const errors: Record<string, string> = {
    REVIEW_NEEDS_CONFIRMATION: '部分字段不能确定，已保留为待核对',
    AI_NOT_CONFIGURED: '请先配置 AI', AI_DEEPSEEK_NOT_CONFIGURED: '请先在研究助手配置 DeepSeek，自动复核固定使用它', AI_DAILY_BUDGET: '今日额度不足，次日继续',
    AI_PROVIDER_401: '当前模型密钥被拒绝', AI_PROVIDER_403: '当前模型访问被拒绝',
    AI_PROVIDER_404: '模型或接口不存在', AI_PROVIDER_429: '服务商限流或额度不足',
    AI_INCOMPLETE_COMPLETION: '模型输出未完成，需检查输出额度或分块大小', AI_PROTOCOL_ERROR: '模型未返回完整有效的 JSON', AI_REVIEW_PATCH_INVALID: '模型的复核差异不符合数据结构或证据要求', REVIEW_PROFILE_CHANGED: '模型配置身份发生变化，任务已暂停', REVIEW_PUBLICATION_FAILED: '复核结果已保存，发布暂未成功',
    AI_TIMEOUT: '模型响应超时', AI_COMPLETION_TRUNCATED: '模型输出被截断',
    REVIEW_FAILED: '复核未完成，请检查配置或重试',
  };
  const latest = jobs.filter(j => j.errorCode).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  let automatedModel: string | undefined;
  try { automatedModel = (await aiConfigStore.resolveProvider('deepseek'))?.model; } catch { /* Status must remain readable when a key is unavailable. */ }
  return {
    enabled, automatedProvider: 'deepseek' as const, total: jobs.length, queued: count('queued', 'retry_wait'), running: count('running'),
    succeeded: count('succeeded'), partial: count('partial'), failed: count('failed'),
    paused: count('budget_paused', 'config_paused'), legacy: enabled ? 0 : jobs.length,
    lastError: latest ? errors[latest.errorCode!] ?? '输出或证据未通过校验，等待核对' : undefined,
    // This is the model used for future automated reviews. Historical local
    // backfill pins must not make the status banner look like the online model.
    model: automatedModel,
  };
}
