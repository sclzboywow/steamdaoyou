import {
  adminRoleHasCapability,
  type AdminRole,
} from '@shared/contracts/adminAccess';
import type { AdminOverviewSnapshot } from '@shared/contracts/adminOverview';
import { authAccounts, authUsers } from '@server/lib/auth/schema';
import { contentModerationEvents } from '@server/lib/drizzle/adminSchema';
import {
  getExecutor,
  getPostgresHealthStatus,
} from '@server/lib/drizzle/db';
import { cultivators, feedbacks } from '@server/lib/drizzle/schema';
import { getLlmMetricsSnapshot } from '@server/lib/llm/metricsStore';
import { getMessageInfrastructureHealthStatus } from '@server/lib/mq/domainEventRegistry';
import { getNatsHealthStatus } from '@server/lib/nats';
import { getRedisHealthStatus } from '@server/lib/redis';
import { getOnlineUsersSnapshot } from '@server/lib/services/onlinePresenceService';
import {
  getShanghaiDateKey,
  getShanghaiDayStart,
} from '@server/lib/time/shanghai';
import { and, count, eq, gte, or } from 'drizzle-orm';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const LLM_SAMPLE_SIZE = 300;

function readCount(rows: Array<{ value: number | bigint }>): number {
  return Number(rows[0]?.value ?? 0);
}

async function loadSystemStatus(): Promise<AdminOverviewSnapshot['system']> {
  const [postgres, redis, nats] = await Promise.all([
    getPostgresHealthStatus(),
    getRedisHealthStatus(),
    getNatsHealthStatus(),
  ]);

  return {
    postgres,
    redis,
    nats,
    messaging: getMessageInfrastructureHealthStatus(),
  };
}

async function loadPresence(
  now: Date,
): Promise<NonNullable<AdminOverviewSnapshot['presence']>> {
  const q = getExecutor();
  const activeSince = new Date(now.getTime() - ONE_DAY_MS);
  const [online, activeRows] = await Promise.all([
    getOnlineUsersSnapshot(),
    q
      .select({ value: count() })
      .from(cultivators)
      .where(
        and(
          eq(cultivators.status, 'active'),
          gte(cultivators.lastActiveAt, activeSince),
        ),
      ),
  ]);

  return {
    currentOnline: online.currentOnline,
    todayPeakOnline: online.todayPeakOnline,
    active24h: readCount(activeRows),
  };
}

async function loadAccounts(
  now: Date,
): Promise<NonNullable<AdminOverviewSnapshot['accounts']>> {
  const q = getExecutor();
  const todayStart = getShanghaiDayStart(now);
  const [newUsers, newSteamUsers] = await Promise.all([
    q
      .select({ value: count() })
      .from(authUsers)
      .where(gte(authUsers.createdAt, todayStart)),
    q
      .select({ value: count() })
      .from(authUsers)
      .innerJoin(
        authAccounts,
        and(
          eq(authAccounts.userId, authUsers.id),
          eq(authAccounts.providerId, 'steam'),
        ),
      )
      .where(gte(authUsers.createdAt, todayStart)),
  ]);

  return {
    newToday: readCount(newUsers),
    newSteamToday: readCount(newSteamUsers),
  };
}

async function loadFeedback(): Promise<
  NonNullable<AdminOverviewSnapshot['feedback']>
> {
  const q = getExecutor();
  const [pendingRows, processingRows] = await Promise.all([
    q
      .select({ value: count() })
      .from(feedbacks)
      .where(eq(feedbacks.status, 'pending')),
    q
      .select({ value: count() })
      .from(feedbacks)
      .where(eq(feedbacks.status, 'processing')),
  ]);

  return {
    pending: readCount(pendingRows),
    processing: readCount(processingRows),
  };
}

async function loadModeration(
  now: Date,
): Promise<NonNullable<AdminOverviewSnapshot['moderation']>> {
  const q = getExecutor();
  const since = new Date(now.getTime() - ONE_DAY_MS);
  const [unavailableRows, rejectedRows] = await Promise.all([
    q
      .select({ value: count() })
      .from(contentModerationEvents)
      .where(
        and(
          gte(contentModerationEvents.createdAt, since),
          eq(contentModerationEvents.decision, 'unavailable'),
        ),
      ),
    q
      .select({ value: count() })
      .from(contentModerationEvents)
      .where(
        and(
          gte(contentModerationEvents.createdAt, since),
          or(
            eq(contentModerationEvents.decision, 'local_reject'),
            eq(contentModerationEvents.decision, 'reject'),
          ),
        ),
      ),
  ]);

  return {
    unavailable24h: readCount(unavailableRows),
    rejected24h: readCount(rejectedRows),
  };
}

async function loadLlm(): Promise<
  NonNullable<AdminOverviewSnapshot['llm']>
> {
  const snapshot = await getLlmMetricsSnapshot({ limit: LLM_SAMPLE_SIZE });
  return {
    sampleSize: LLM_SAMPLE_SIZE,
    calls: snapshot.overview.calls,
    failureCalls: snapshot.overview.failureCalls,
    successRate: snapshot.overview.successRate,
  };
}

export async function getAdminOverviewSnapshot(
  role: AdminRole,
): Promise<AdminOverviewSnapshot> {
  const now = new Date();
  const canPresence = adminRoleHasCapability(role, 'presence');
  const canAccounts =
    adminRoleHasCapability(role, 'accounts') ||
    adminRoleHasCapability(role, 'steam_accounts');
  const canFeedback = adminRoleHasCapability(role, 'feedback');
  const canModeration = adminRoleHasCapability(role, 'content_moderation');
  const canLlm = adminRoleHasCapability(role, 'llm_observe');

  const [system, presence, accounts, feedback, moderation, llm] =
    await Promise.all([
      loadSystemStatus(),
      canPresence ? loadPresence(now) : Promise.resolve(null),
      canAccounts ? loadAccounts(now) : Promise.resolve(null),
      canFeedback ? loadFeedback() : Promise.resolve(null),
      canModeration ? loadModeration(now) : Promise.resolve(null),
      canLlm ? loadLlm() : Promise.resolve(null),
    ]);

  return {
    generatedAt: now.toISOString(),
    businessDate: getShanghaiDateKey(now),
    release: process.env.APP_RELEASE?.trim() || 'unknown',
    system,
    presence,
    accounts,
    feedback,
    moderation,
    llm,
  };
}
