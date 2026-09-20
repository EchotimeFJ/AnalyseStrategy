import path from 'node:path';
import { createReviewStore, contentHash } from './reviewStore.js';
import { getReportDir } from '../runtimeConfig.js';

export function reviewEnabled() {
  return false;
}
export function reviewStore(sourceDir = getReportDir()) {
  const root = process.env.RESEARCH_REVIEW_DIR || path.resolve('data/runtime/research-review');
  return createReviewStore(path.join(root, contentHash(path.resolve(sourceDir)).slice(0, 20)));
}
