import {
  getValidatedQuery,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { listAdminAuditEvents } from '@server/lib/services/AdminAuditService';
import {
  AdminAuditListQuerySchema,
  type AdminAuditListQuery,
} from '@shared/contracts/adminOps';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', validateQuery(AdminAuditListQuerySchema), async (c) => {
  const query = getValidatedQuery<AdminAuditListQuery>(c);
  const result = await listAdminAuditEvents(query);
  return c.json({
    success: true as const,
    data: { ...result, page: query.page, limit: query.limit },
  });
});

export default router;
