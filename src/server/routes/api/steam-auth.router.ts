import {
  getValidatedJson,
  requireUser,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  getLinkedSteamId,
  linkSteamUser,
  loginSteamUser,
  SteamAuthError,
} from '@server/lib/services/SteamAuthService';
import {
  SteamTicketRequestSchema,
  type SteamTicketRequest,
} from '@shared/contracts/steam';
import { Hono, type Context } from 'hono';

const router = new Hono<AppEnv>();

function respond(c: Context<AppEnv>, error: unknown) {
  if (error instanceof SteamAuthError) {
    return c.json(
      { success: false as const, error: error.message, code: error.code },
      error.status,
    );
  }
  console.error('[steam-auth]', error);
  return c.json({ success: false as const, error: 'Steam 登录失败' }, 500);
}

router.post(
  '/login',
  validateJson(SteamTicketRequestSchema),
  async (c) => {
    try {
      const result = await loginSteamUser(
        getValidatedJson<SteamTicketRequest>(c),
      );
      return c.json({ success: true as const, data: result });
    } catch (error) {
      return respond(c, error);
    }
  },
);

router.get('/status', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ success: false as const, error: '未授权访问' }, 401);
  return c.json({
    success: true as const,
    data: { steamId: await getLinkedSteamId(user.id) },
  });
});

router.post(
  '/link',
  requireUser(),
  validateJson(SteamTicketRequestSchema),
  async (c) => {
    const user = c.get('user');
    if (!user)
      return c.json({ success: false as const, error: '未授权访问' }, 401);
    try {
      const result = await linkSteamUser(
        user.id,
        getValidatedJson<SteamTicketRequest>(c),
      );
      return c.json({ success: true as const, data: result });
    } catch (error) {
      return respond(c, error);
    }
  },
);

export default router;
