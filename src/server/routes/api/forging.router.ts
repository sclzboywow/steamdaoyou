import {
  getValidatedJson,
  redisLockErrorResponse,
  requireActiveCultivatorRef,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { PlayerCommandIdempotencyError } from '@server/lib/services/CommandExecutors';
import {
  forgeEquipment,
  readForge,
} from '@server/lib/services/ForgingService';
import {
  assertOfficialContentSafe,
  OfficialContentSafetyError,
} from '@server/lib/services/OfficialContentSafetyService';
import { InventoryError } from '@server/lib/services/InventoryService';
import { QiServiceError } from '@server/lib/services/QiService';
import { ForgeRequestSchema, type ForgeRequest } from '@shared/contracts/forging';
import { InventoryRuleError } from '@shared/inventory';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
router.use('*', requireActiveCultivatorRef());
router.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
router.onError((error, c) => {
  const lock = redisLockErrorResponse(error);
  if (lock) return lock;
  if (error instanceof z.ZodError)
    return c.json({ success: false, error: '请求参数或材料数据无效' }, 400);
  if (error instanceof OfficialContentSafetyError)
    return c.json(
      { success: false, error: error.message, code: error.code },
      error.status,
    );
  if (
    error instanceof InventoryError ||
    error instanceof InventoryRuleError ||
    error instanceof QiServiceError ||
    error instanceof PlayerCommandIdempotencyError
  )
    return c.json({ success: false, error: error.message }, 409);
  console.error('[forging] request failed', error);
  return c.json(
    { success: false, error: '请求未完成，请核对物品状态后重试' },
    500,
  );
});
router.get('/', async (c) =>
  c.json({
    success: true,
    data: await readForge(c.get('activeCultivatorRef')!.cultivatorId),
  }),
);
router.post('/', validateJson(ForgeRequestSchema), async (c) => {
  const input = getValidatedJson<ForgeRequest>(c);
  const ref = c.get('activeCultivatorRef')!;
  if (input.intent) {
    await assertOfficialContentSafe({
      userId: ref.userId,
      source: 'forging_intent',
      content: input.intent,
    });
  }
  return c.json({
    success: true,
    ...(await forgeEquipment(ref.cultivatorId, input, ref.userId)),
  });
});
export default router;
