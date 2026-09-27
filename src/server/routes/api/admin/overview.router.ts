import { getAdminRole } from '@server/lib/auth/adminAccess';
import type { AppEnv } from '@server/lib/hono/types';
import { getAdminOverviewSnapshot } from '@server/lib/services/AdminOverviewService';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  const user = c.get('user');
  const role = getAdminRole(user);

  if (!user || !role) {
    return c.json({ success: false, error: '无管理员权限' }, 403);
  }

  return c.json({
    success: true as const,
    data: await getAdminOverviewSnapshot(role),
  });
});

export default router;
