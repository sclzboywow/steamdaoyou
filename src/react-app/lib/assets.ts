import { clientEnv } from '@app/lib/env';

export function assetUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!clientEnv.assetBaseUrl) return normalizedPath;
  return `${clientEnv.assetBaseUrl}${normalizedPath}`;
}
