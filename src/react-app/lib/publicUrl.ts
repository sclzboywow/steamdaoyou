import { clientEnv } from '@app/lib/env';

export function toPublicWebUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = clientEnv.publicWebOrigin?.replace(/\/+$/, '');
  if (base) return `${base}${normalized}`;
  if (typeof window !== 'undefined') {
    return new URL(normalized, window.location.origin).toString();
  }
  return normalized;
}
