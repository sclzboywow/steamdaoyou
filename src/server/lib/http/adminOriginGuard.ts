import type { AppEnv } from '@server/lib/hono/types';
import type { MiddlewareHandler } from 'hono';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedAdminOrigins() {
  return (process.env.ADMIN_WEB_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function requireAdminMutationOrigin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }

    const allowed = allowedAdminOrigins();
    if (allowed.length === 0) {
      await next();
      return;
    }

    const origin = c.req.header('Origin')?.replace(/\/$/, '');
    if (!origin || !allowed.includes(origin)) {
      c.res = Response.json(
        { success: false, error: '管理后台请求来源未授权' },
        { status: 403 },
      );
      return;
    }

    await next();
  };
}
