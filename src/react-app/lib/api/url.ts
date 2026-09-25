import { clientEnv } from '@app/lib/env';
import type { RealtimeChannel } from '@shared/contracts/realtime';

export function resolveApiUrl(input: string) {
  if (!input.startsWith('/api/')) {
    return input;
  }

  if (!clientEnv.apiBaseUrl) {
    return input;
  }

  return `${clientEnv.apiBaseUrl}${input}`;
}

export function resolveRealtimeUrl(
  channels?: RealtimeChannel[],
  realtimeToken?: string,
) {
  const query = new URLSearchParams();
  if (channels?.length) query.set('channels', channels.join(','));
  if (realtimeToken) query.set('rt', realtimeToken);
  const channelQuery = query.size > 0 ? `?${query.toString()}` : '';

  if (clientEnv.apiBaseUrl) {
    const apiUrl = new URL(clientEnv.apiBaseUrl);
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    apiUrl.pathname = '/api/realtime';
    apiUrl.search = channelQuery;
    apiUrl.hash = '';
    return apiUrl.toString();
  }

  if (typeof window === 'undefined') {
    return `/api/realtime${channelQuery}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/realtime${channelQuery}`;
}
