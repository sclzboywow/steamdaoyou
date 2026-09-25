import { isSteamRuntime } from '@app/lib/runtime';

export async function requestRealtimeBootstrapToken(): Promise<string | undefined> {
  if (!isSteamRuntime) return undefined;

  const response = await fetch('/api/realtime/token', { method: 'POST' });
  const payload = (await response.json()) as {
    success?: boolean;
    error?: string;
    data?: { token: string; expiresInSeconds: number };
  };
  if (!response.ok || !payload.success || !payload.data?.token) {
    throw new Error(payload.error || '实时认证失败');
  }
  return payload.data.token;
}
