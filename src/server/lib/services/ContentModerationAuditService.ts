import { contentModerationEvents } from '@server/lib/drizzle/adminSchema';
import { getExecutor } from '@server/lib/drizzle/db';
import type {
  AdminContentModerationEventView,
  AdminContentModerationListQuery,
  ContentModerationDecision,
} from '@shared/contracts/adminOps';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';

export async function recordContentModerationEvent(input: {
  userId: string;
  source: string;
  provider: string;
  decision: ContentModerationDecision;
  content: string;
  reason?: string | null;
  durationMs?: number | null;
}) {
  const content = input.content.trim();
  const logText = process.env.CONTENT_SAFETY_LOG_TEXT === 'true';
  await getExecutor().insert(contentModerationEvents).values({
    userId: input.userId,
    source: input.source,
    provider: input.provider,
    decision: input.decision,
    reason: input.reason ?? null,
    contentHash: createHash('sha256').update(content).digest('hex'),
    contentLength: Array.from(content).length,
    contentExcerpt: logText ? content.slice(0, 240) : null,
    durationMs: input.durationMs ?? null,
  });
}

export async function listContentModerationEvents(
  query: AdminContentModerationListQuery,
) {
  const q = getExecutor();
  const offset = (query.page - 1) * query.limit;
  const filters = [];
  if (query.decision !== 'all') {
    filters.push(eq(contentModerationEvents.decision, query.decision));
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(contentModerationEvents.userId, pattern),
        ilike(contentModerationEvents.source, pattern),
        ilike(contentModerationEvents.reason, pattern),
        ilike(contentModerationEvents.contentHash, pattern),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    q
      .select()
      .from(contentModerationEvents)
      .where(where)
      .orderBy(desc(contentModerationEvents.createdAt))
      .limit(query.limit)
      .offset(offset),
    q.select({ value: count() }).from(contentModerationEvents).where(where),
  ]);

  const events: AdminContentModerationEventView[] = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    source: row.source,
    provider: row.provider,
    decision: row.decision,
    reason: row.reason,
    contentHash: row.contentHash,
    contentLength: row.contentLength,
    contentExcerpt: row.contentExcerpt,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  }));

  return { events, total: Number(totals[0]?.value ?? 0) };
}
