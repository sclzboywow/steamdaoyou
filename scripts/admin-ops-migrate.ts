import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, ssl: false, max: 1 });

const sql = `
CREATE TABLE IF NOT EXISTS "wanjiedaoyou_admin_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "operator_user_id" uuid NOT NULL,
  "operator_email" text,
  "operator_role" varchar(32) NOT NULL,
  "action" varchar(180) NOT NULL,
  "target_type" varchar(64),
  "target_id" text,
  "reason" text,
  "method" varchar(16),
  "path" text,
  "status" integer,
  "request_id" varchar(128),
  "ip_address" varchar(128),
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_audit_created_idx"
  ON "wanjiedaoyou_admin_audit_events" ("created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_operator_idx"
  ON "wanjiedaoyou_admin_audit_events" ("operator_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "admin_audit_target_idx"
  ON "wanjiedaoyou_admin_audit_events" ("target_type", "target_id");

CREATE TABLE IF NOT EXISTS "wanjiedaoyou_content_moderation_events" (
  "id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "source" varchar(160) NOT NULL,
  "provider" varchar(64) NOT NULL,
  "decision" varchar(32) NOT NULL,
  "reason" text,
  "content_hash" varchar(64) NOT NULL,
  "content_length" integer NOT NULL,
  "content_excerpt" text,
  "duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "content_moderation_created_idx"
  ON "wanjiedaoyou_content_moderation_events" ("created_at");
CREATE INDEX IF NOT EXISTS "content_moderation_user_idx"
  ON "wanjiedaoyou_content_moderation_events" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "content_moderation_source_idx"
  ON "wanjiedaoyou_content_moderation_events" ("source", "created_at");
CREATE INDEX IF NOT EXISTS "content_moderation_decision_idx"
  ON "wanjiedaoyou_content_moderation_events" ("decision", "created_at");
`;

try {
  await pool.query(sql);
  console.log('[admin:migrate] admin audit/content moderation tables are ready');
} finally {
  await pool.end();
}
