import { getAdminRole } from '@server/lib/auth/adminAccess';
import type { AppEnv } from '@server/lib/hono/types';
import { writeAdminAuditEvent } from '@server/lib/services/AdminAuditService';
import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function clientIp(headers: Headers) {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

function targetFromPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  const adminIndex = parts.indexOf('admin');
  const module = adminIndex >= 0 ? parts[adminIndex + 1] : null;
  const id = adminIndex >= 0 ? parts[adminIndex + 2] : null;
  return { targetType: module, targetId: id };
}

export function adminMutationAuditMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      await next();
      return;
    }

    const startedAt = Date.now();
    const requestId = c.req.header('x-request-id')?.trim() || randomUUID();
    c.header('x-request-id', requestId);

    await next();

    if (c.res.headers.get('x-admin-audit-detailed')) return;

    const user = c.get('user');
    const role = getAdminRole(user);
    if (!user || !role) return;

    const path = new URL(c.req.url).pathname;
    const target = targetFromPath(path);
    try {
      await writeAdminAuditEvent({
        operatorUserId: user.id,
        operatorEmail: user.email,
        operatorRole: role,
        action: `${method} ${path}`,
        targetType: target.targetType,
        targetId: target.targetId,
        method,
        path,
        status: c.res.status,
        requestId,
        ipAddress: clientIp(c.req.raw.headers),
        userAgent: c.req.header('user-agent') ?? null,
        metadata: { durationMs: Date.now() - startedAt },
      });
    } catch (error) {
      console.error('[admin-audit] failed to persist audit event', {
        requestId,
        path,
        error,
      });
    }
  };
}
