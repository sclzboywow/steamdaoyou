import { adminAuditEvents } from '@server/lib/drizzle/adminSchema';
import { getExecutor } from '@server/lib/drizzle/db';
import type { AdminRole } from '@shared/contracts/adminAccess';
import type {
  AdminAuditEventView,
  AdminAuditListQuery,
} from '@shared/contracts/adminOps';
import { count, desc, ilike, or, sql } from 'drizzle-orm';

export interface WriteAdminAuditInput {
  operatorUserId: string;
  operatorEmail?: string | null;
  operatorRole: AdminRole;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAdminAuditEvent(input: WriteAdminAuditInput) {
  await getExecutor().insert(adminAuditEvents).values({
    ...input,
    operatorEmail: input.operatorEmail ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    reason: input.reason ?? null,
    method: input.method ?? null,
    path: input.path ?? null,
    status: input.status ?? null,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function listAdminAuditEvents(query: AdminAuditListQuery) {
  const q = getExecutor();
  const offset = (query.page - 1) * query.limit;
  const pattern = query.search ? `%${query.search}%` : null;
  const filter = pattern
    ? or(
        ilike(adminAuditEvents.action, pattern),
        ilike(adminAuditEvents.targetId, pattern),
        ilike(adminAuditEvents.operatorEmail, pattern),
        sql`${adminAuditEvents.operatorUserId}::text ILIKE ${pattern}`,
      )
    : undefined;

  const [rows, totals] = await Promise.all([
    q
      .select()
      .from(adminAuditEvents)
      .where(filter)
      .orderBy(desc(adminAuditEvents.createdAt))
      .limit(query.limit)
      .offset(offset),
    q.select({ value: count() }).from(adminAuditEvents).where(filter),
  ]);

  const events: AdminAuditEventView[] = rows.map((row) => ({
    id: row.id,
    operatorUserId: row.operatorUserId,
    operatorEmail: row.operatorEmail,
    operatorRole: row.operatorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    method: row.method,
    path: row.path,
    status: row.status,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));

  return { events, total: Number(totals[0]?.value ?? 0) };
}
