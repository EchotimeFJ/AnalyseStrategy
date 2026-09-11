export function configError(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  const result = (code: string, message: string, status = 502) => ({ code, message, status });
  const codes: string[] = [];
  let current: unknown = error;
  for (let i = 0; current && typeof current === 'object' && i < 6; i++) {
    const item = current as { code?: string; name?: string; cause?: unknown };
    codes.push(item.code ?? '', item.name ?? ''); current = item.cause;
  }
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) return result('AI_DNS_FAILED', '网站服务器无法解析 AI 接口域名。请核对地址；内网域名需要服务器具备对应网络和 DNS，与你电脑能否访问无关。');
  if (codes.includes('ERR_INVALID_URL')) return result('AI_CONFIG_INVALID', 'API 基础地址格式不正确，请填写完整的 HTTP/HTTPS 地址。', 400);
  if (raw === 'AI_PROTOCOL_ERROR') return result('AI_PROTOCOL_ERROR', '接口没有返回兼容的 Chat Completions JSON。请检查基础地址，避免填写网页登录地址或返回登录页的内网入口。');
  if (codes.some(code => ['AbortError', 'TimeoutError', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code))) return result('AI_CONNECTION_TIMEOUT', '网站服务器连接 AI 接口超时。请检查接口网络可达性及服务状态。', 504);
  if (codes.some(code => /CERT|TLS|SELF_SIGNED/.test(code))) return result('AI_TLS_FAILED', 'AI 接口的 HTTPS 证书校验失败。请联系接口提供方检查证书，不要关闭证书校验。');
  if (codes.some(code => ['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET'].includes(code))) return result('AI_CONNECTION_FAILED', '网站服务器无法连接 AI 接口，或连接被中断。请检查地址、端口、防火墙和网络准入。');
  const status = Number(raw.match(/^AI_PROVIDER_ERROR:(\d{3}):/)?.[1]);
  if (status === 401) return result('AI_KEY_REJECTED', 'AI 接口返回 401，API Key 未被接受。请核对这套配置的密钥和服务商；这不是网站管理员密码错误。');
  if (status === 403) return result('AI_PROVIDER_FORBIDDEN', 'AI 接口返回 403，访问被拒绝。请检查密钥权限、模型权限及服务器 IP 白名单；网站管理员验证已通过。');
  if (status === 404) return result('AI_MODEL_OR_ENDPOINT_NOT_FOUND', 'AI 接口返回 404。请核对模型 ID 和 API 基础地址，并确认支持 Chat Completions。');
  if (status === 429 || status === 402) return result('AI_PROVIDER_LIMIT', 'AI 服务方返回额度或限流错误。请检查服务方余额、额度和并发限制。');
  if (status >= 500) return result('AI_PROVIDER_UNAVAILABLE', 'AI 服务方暂时异常，请稍后重试或联系接口提供方。');
  if (status === 400 || status === 422) return result('AI_PROVIDER_PARAMETERS', 'AI 接口拒绝了请求参数。请核对模型 ID，并确认该接口兼容 Chat Completions 请求。');
  const validation = ['请填写 API Key', '请填写模型名称', '请填写 API 基础地址', 'API 基础地址仅支持 HTTP/HTTPS', '管理员密码错误，请检查后重试'];
  if (validation.includes(raw)) return result('AI_CONFIG_INVALID', raw, 400);
  if (raw.includes('AI_CONFIG_SECRET')) return result('AI_CONFIG_STORAGE_UNAVAILABLE', '服务器尚未配置密钥加密能力，暂时无法保存。请联系网站管理员。', 503);
  return result('AI_CONFIG_FAILED', '配置操作失败，暂时无法确定原因。请核对配置或联系网站管理员；不要仅凭此提示判断密钥错误。');
}
