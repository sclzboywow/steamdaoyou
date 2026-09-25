import {
  adminCapabilitiesForRole,
  getAdminRole,
} from '@server/lib/auth/adminAccess';
import { adminMutationAuditMiddleware } from '@server/lib/hono/adminAuditMiddleware';
import {
  requireAdmin,
  requireAdminCapability,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { requireAdminMutationOrigin } from '@server/lib/http/adminOriginGuard';
import accountsRouter from '@server/routes/api/admin/accounts.router';
import announcementRouter from '@server/routes/api/admin/announcement.router';
import auditRouter from '@server/routes/api/admin/audit.router';
import communityGroupRouter from '@server/routes/api/admin/community-qrcode.router';
import contentModerationRouter from '@server/routes/api/admin/content-moderation.router';
import feedbackRouter from '@server/routes/api/admin/feedback.router';
import itemLibraryRouter from '@server/routes/api/admin/item-library.router';
import llmMetricsRouter from '@server/routes/api/admin/llm-metrics.router';
import onlineUsersRouter from '@server/routes/api/admin/online-users.router';
import redeemCodesRouter from '@server/routes/api/admin/redeem-codes.router';
import reputationShopRouter from '@server/routes/api/admin/reputation-shop.router';
import sectShopRouter from '@server/routes/api/admin/sect-shop.router';
import sponsorshipRouter from '@server/routes/api/admin/sponsorship.router';
import steamAccountsRouter from '@server/routes/api/admin/steam-accounts.router';
import systemMailsRouter from '@server/routes/api/admin/system-mails.router';
import towerEnemySetsRouter from '@server/routes/api/admin/tower-enemy-sets.router';
import type { AdminCapability } from '@shared/contracts/adminAccess';
import { Hono } from 'hono';
import rewardItemsRouter from './reward-items.router';

const router = new Hono<AppEnv>();

router.use('*', async (c, next) => {
  const fromSteamClient =
    c.req.header('x-distribution-channel') === 'steam' ||
    c.req.header('origin') === 'http://tauri.localhost';
  const localSteamAdminBypass =
    process.env.APP_ENV === 'local' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.STEAM_AUTH_DEV_BYPASS === 'true';

  if (fromSteamClient && !localSteamAdminBypass) {
    c.res = Response.json(
      { success: false, error: 'Steam 客户端不提供管理后台能力' },
      { status: 403 },
    );
    return;
  }
  await next();
});
router.use('*', requireAdmin());
router.use('*', adminMutationAuditMiddleware());
router.use('*', requireAdminMutationOrigin());

function protect(prefix: string, capability: AdminCapability) {
  router.use(prefix, requireAdminCapability(capability));
  router.use(`${prefix}/*`, requireAdminCapability(capability));
}

protect('/accounts', 'accounts');
protect('/steam-accounts', 'steam_accounts');
protect('/feedback', 'feedback');
protect('/system-mails', 'ops_messaging');
protect('/announcement', 'ops_messaging');
protect('/redeem-codes', 'ops_messaging');
protect('/community-group', 'ops_messaging');
protect('/item-library', 'game_content');
protect('/tower-enemy-sets', 'game_content');
protect('/reputation-shop', 'commerce');
protect('/sect-shop', 'commerce');
protect('/reward-items', 'commerce');
protect('/sponsorship', 'sponsorship');
protect('/llm-metrics', 'llm_observe');
protect('/online-users', 'presence');
protect('/content-moderation', 'content_moderation');
protect('/audit', 'audit');

router.get('/session', (c) => {
  const user = c.get('user');
  const role = getAdminRole(user);
  if (!user || !role) {
    return c.json({ success: false, error: '无管理员权限' }, 403);
  }
  return c.json({
    success: true,
    userId: user.id,
    email: user.email,
    role,
    capabilities: adminCapabilitiesForRole(role),
  });
});

router.route('/accounts', accountsRouter);
router.route('/steam-accounts', steamAccountsRouter);
router.route('/feedback', feedbackRouter);
router.route('/system-mails', systemMailsRouter);
router.route('/announcement', announcementRouter);
router.route('/item-library', itemLibraryRouter);
router.route('/reward-items', rewardItemsRouter);
router.route('/redeem-codes', redeemCodesRouter);
router.route('/reputation-shop', reputationShopRouter);
router.route('/sect-shop', sectShopRouter);
router.route('/sponsorship', sponsorshipRouter);
router.route('/community-group', communityGroupRouter);
router.route('/llm-metrics', llmMetricsRouter);
router.route('/online-users', onlineUsersRouter);
router.route('/tower-enemy-sets', towerEnemySetsRouter);
router.route('/content-moderation', contentModerationRouter);
router.route('/audit', auditRouter);

export default router;
