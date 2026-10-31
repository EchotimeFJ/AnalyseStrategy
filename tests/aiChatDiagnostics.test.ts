import assert from 'node:assert/strict';
import {aiError} from '../api/routes/ai';
assert.equal(aiError(new Error('AI_PROVIDER_ERROR:400:Unsupported model retired-model')).code,'AI_MODEL_UNAVAILABLE');
for(const [status,code] of [[401,'AI_KEY_INVALID'],[403,'AI_KEY_INVALID'],[402,'AI_PROVIDER_PAYMENT_REQUIRED'],[429,'AI_PROVIDER_RATE_LIMIT'],[500,'AI_PROVIDER_UNAVAILABLE']] as const){
 const error=aiError(new Error(`AI_PROVIDER_ERROR:${status}:upstream-secret-and-private-url`));
 assert.equal(error.code,code);assert.ok(!JSON.stringify(error).includes('upstream-secret'));
}
console.log('public chat diagnostics are actionable and sanitized');
