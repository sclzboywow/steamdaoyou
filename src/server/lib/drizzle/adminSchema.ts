import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AdminRole } from '@shared/contracts/adminAccess';
import type { ContentModerationDecision } from '@shared/contracts/adminOps';

const auditTimestamp = (name: string) =>
  timestamp(name, { mode: 'date', withTimezone: true });

export const adminAuditEvents = pgTable(
  'wanjiedaoyou_admin_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorUserId: uuid('operator_user_id').notNull(),
    operatorEmail: text('operator_email'),
    operatorRole: varchar('operator_role', { length: 32 })
      .$type<AdminRole>()
      .notNull(),
    action: varchar('action', { length: 180 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: text('target_id'),
    reason: text('reason'),
    method: varchar('method', { length: 16 }),
    path: text('path'),
    status: integer('status'),
    requestId: varchar('request_id', { length: 128 }),
    ipAddress: varchar('ip_address', { length: 128 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: auditTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admin_audit_created_idx').on(table.createdAt),
    index('admin_audit_operator_idx').on(table.operatorUserId, table.createdAt),
    index('admin_audit_target_idx').on(table.targetType, table.targetId),
  ],
);

export const contentModerationEvents = pgTable(
  'wanjiedaoyou_content_moderation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    source: varchar('source', { length: 160 }).notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    decision: varchar('decision', { length: 32 })
      .$type<ContentModerationDecision>()
      .notNull(),
    reason: text('reason'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    contentLength: integer('content_length').notNull(),
    contentExcerpt: text('content_excerpt'),
    durationMs: integer('duration_ms'),
    createdAt: auditTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('content_moderation_created_idx').on(table.createdAt),
    index('content_moderation_user_idx').on(table.userId, table.createdAt),
    index('content_moderation_source_idx').on(table.source, table.createdAt),
    index('content_moderation_decision_idx').on(table.decision, table.createdAt),
  ],
);
