import {
  getValidatedQuery,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { listContentModerationEvents } from '@server/lib/services/ContentModerationAuditService';
import {
  AdminContentModerationListQuerySchema,
  type AdminContentModerationListQuery,
} from '@shared/contracts/adminOps';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get(
  '/',
  validateQuery(AdminContentModerationListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AdminContentModerationListQuery>(c);
    const result = await listContentModerationEvents(query);
    return c.json({
      success: true as const,
      data: { ...result, page: query.page, limit: query.limit },
    });
  },
);

export default router;
