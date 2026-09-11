export async function aiConfigRequest<T>(operation: (signal: AbortSignal) => Promise<T>, action: 'verify' | 'test' | 'save', timeoutMs = 25_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await operation(controller.signal); }
  catch (error) {
    if (controller.signal.aborted) throw new Error(action === 'save'
      ? '保存请求超时，配置可能已经保存。请重新进入配置确认当前状态，不要连续重复提交。'
      : '请求超时，网站服务器未及时返回。请检查网络后重试；这不代表密码或 API Key 错误。');
    if (error instanceof Error && error.message === '此操作仅限管理员') throw new Error('网站管理员密码不正确，或服务器尚未配置管理员凭据。这与 AI 接口的 API Key 不同。');
    if (error instanceof TypeError) throw new Error('无法连接网站服务器。请检查当前网络后重试。');
    throw error;
  } finally { clearTimeout(timer); }
}
