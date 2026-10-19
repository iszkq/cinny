export type RecoveryIdentity = { baseUrl: string; userId: string };
export async function verifyRecoveryLogin(
  identity: RecoveryIdentity, password: string, signal: AbortSignal
): Promise<void> {
  const server = new URL(identity.baseUrl);
  if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password || server.search || server.hash) {
    throw new Error('服务器地址无效。');
  }
  const endpoint = `${server.href.replace(/\/$/, '')}/_matrix/client/v3`;
  // Only account credentials reach the server. PIN and its local hash never do.
  const response = await fetch(`${endpoint}/login`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: identity.userId },
      password, initial_device_display_name: '计算器 PIN 恢复验证' }),
  });
  if (!response.ok) throw new Error(response.status === 403 ? '账户或登录密码不正确。' : '登录验证失败，请稍后重试。');
  const login = await response.json() as { user_id?: string; access_token?: string };
  if (!login.access_token) throw new Error('服务器未返回有效的登录凭证。');
  try {
    if (login.user_id !== identity.userId) throw new Error('请使用原账户重新登录。');
    if (signal.aborted) throw new Error('恢复已取消。');
  } finally {
    // Revoke only the temporary verification session, preserving the existing
    // device and its encrypted chat keys. Never persist this access token.
    try {
      await fetch(`${endpoint}/logout`, { method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' },
        body: '{}' });
    } catch {
      // Losing connectivity here must not disclose a token or replace the saved session.
    }
  }
}
