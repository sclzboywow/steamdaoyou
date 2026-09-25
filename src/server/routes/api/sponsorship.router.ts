import {
  getValidatedJson,
  getValidatedQuery,
  requireActiveCultivatorRef,
  validateJson,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  claimSponsorshipOrder,
  createSponsorshipCheckoutIntent,
  getCheckoutIntentStatus,
  getCultivatorMerit,
  getSponsorshipClientConfig,
  listPublicMeritProfiles,
  recordAfdianWebhook,
  SponsorshipApplicationError,
  updateMeritVisibility,
} from '@server/lib/services/SponsorshipApplicationService';
import {
  SponsorshipCheckoutRequestSchema,
  SponsorshipClaimRequestSchema,
  SponsorshipPublicQuerySchema,
  SponsorshipVisibilityRequestSchema,
  type SponsorshipCheckoutRequest,
  type SponsorshipClaimRequest,
} from '@shared/contracts/sponsorship';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

const router = new Hono<AppEnv>();
function isSteamChannel(c: Context<AppEnv>) {
  return (
    c.req.header('x-distribution-channel') === 'steam' ||
    c.req.header('origin') === 'http://tauri.localhost'
  );
}

function steamPaidFlowDisabled(c: Context<AppEnv>) {
  return c.json(
    {
      error: 'Steam 客户端不提供站外支付入口',
      code: 'STEAM_EXTERNAL_PAYMENT_DISABLED',
    },
    403,
  );
}


function sponsorshipErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof SponsorshipApplicationError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  throw error;
}

router.post(
  '/providers/afdian/webhook',
  bodyLimit({ maxSize: 256 * 1_024 }),
  async (c) => {
    try {
      await recordAfdianWebhook(await c.req.json());
      return c.json({ ec: 200, em: '' });
    } catch (error) {
      console.warn('[sponsorship-webhook] rejected', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      return c.json({ ec: 400, em: 'invalid webhook' }, 400);
    }
  },
);

router.get('/config', async (c) => {
  const config = await getSponsorshipClientConfig();
  if (!isSteamChannel(c)) return c.json(config);
  return c.json({ ...config, enabled: false, fulfillmentEnabled: false });
});

router.get(
  '/public',
  validateQuery(SponsorshipPublicQuerySchema),
  async (c) => {
    const query = getValidatedQuery<{ page: number; pageSize: number }>(c);
    return c.json(await listPublicMeritProfiles(query.page, query.pageSize));
  },
);

router.get('/me', requireActiveCultivatorRef(), async (c) => {
  const ref = c.get('activeCultivatorRef')!;
  return c.json(await getCultivatorMerit(ref.cultivatorId));
});

router.patch(
  '/me/visibility',
  requireActiveCultivatorRef(),
  validateJson(SponsorshipVisibilityRequestSchema),
  async (c) => {
    const ref = c.get('activeCultivatorRef')!;
    const body = getValidatedJson<{ isPublic: boolean }>(c);
    const updated = await updateMeritVisibility(
      ref.cultivatorId,
      body.isPublic,
    );
    return c.json({ success: true, updated });
  },
);

router.post(
  '/checkout-intents',
  requireActiveCultivatorRef(),
  validateJson(SponsorshipCheckoutRequestSchema),
  async (c) => {
    if (isSteamChannel(c)) return steamPaidFlowDisabled(c);
    const user = c.get('user')!;
    const ref = c.get('activeCultivatorRef')!;
    const body = getValidatedJson<SponsorshipCheckoutRequest>(c);
    try {
      return c.json(
        await createSponsorshipCheckoutIntent({
          userId: user.id,
          cultivatorId: ref.cultivatorId,
          ...body,
        }),
        201,
      );
    } catch (error) {
      return sponsorshipErrorResponse(c, error);
    }
  },
);

router.get('/checkout-intents/:id', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user')!;
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '下单意图不存在' }, 404);
  const status = await getCheckoutIntentStatus({
    id: id.data,
    userId: user.id,
  });
  return status ? c.json(status) : c.json({ error: '下单意图不存在' }, 404);
});

router.post(
  '/claims',
  requireActiveCultivatorRef(),
  validateJson(SponsorshipClaimRequestSchema),
  async (c) => {
    if (isSteamChannel(c)) return steamPaidFlowDisabled(c);
    const user = c.get('user')!;
    const ref = c.get('activeCultivatorRef')!;
    const body = getValidatedJson<SponsorshipClaimRequest>(c);
    try {
      await claimSponsorshipOrder({
        userId: user.id,
        cultivatorId: ref.cultivatorId,
        ...body,
      });
      return c.json({ success: true });
    } catch (error) {
      return sponsorshipErrorResponse(c, error);
    }
  },
);

export default router;
