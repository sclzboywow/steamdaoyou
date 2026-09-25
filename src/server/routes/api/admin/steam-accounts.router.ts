import { getAdminRole } from '@server/lib/auth/adminAccess';
import { authAccounts, authSessions, authUsers } from '@server/lib/auth/schema';
import { db, getExecutor, runDbTasks } from '@server/lib/drizzle/db';
import { cultivators } from '@server/lib/drizzle/schema';
import {
  getValidatedJson,
  getValidatedQuery,
  validateJson,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { writeAdminAuditEvent } from '@server/lib/services/AdminAuditService';
import {
  AdminSteamAccountListQuerySchema,
  AdminSteamUnlinkRequestSchema,
  type AdminSteamAccountItem,
  type AdminSteamAccountListQuery,
  type AdminSteamUnlinkRequest,
} from '@shared/contracts/adminOps';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();
const SYNTHETIC_EMAIL_SUFFIX = '@steam.wanjiedaoyou.invalid';

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

router.get(
  '/',
  validateQuery(AdminSteamAccountListQuerySchema),
  async (c) => {
    const query = getValidatedQuery<AdminSteamAccountListQuery>(c);
    const q = getExecutor();
    const offset = (query.page - 1) * query.limit;
    const pattern = query.search ? `%${query.search}%` : null;
    const searchFilter = pattern
      ? or(
          ilike(authAccounts.accountId, pattern),
          ilike(authUsers.email, pattern),
          ilike(authUsers.name, pattern),
          ilike(cultivators.name, pattern),
          sql`${authUsers.id}::text ILIKE ${pattern}`,
        )
      : undefined;
    const where = and(eq(authAccounts.providerId, 'steam'), searchFilter);

    const [rows, totals] = await Promise.all([
      q
        .select({
          steamId: authAccounts.accountId,
          linkedAt: authAccounts.createdAt,
          userId: authUsers.id,
          accountName: authUsers.name,
          email: authUsers.email,
          banned: authUsers.banned,
          banReason: authUsers.banReason,
          banExpires: authUsers.banExpires,
          cultivatorId: cultivators.id,
          cultivatorName: cultivators.name,
          realm: cultivators.realm,
          realmStage: cultivators.realm_stage,
          lastActiveAt: cultivators.lastActiveAt,
        })
        .from(authAccounts)
        .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
        .leftJoin(
          cultivators,
          and(
            eq(cultivators.userId, authUsers.id),
            eq(cultivators.status, 'active'),
          ),
        )
        .where(where)
        .orderBy(desc(authAccounts.createdAt))
        .limit(query.limit)
        .offset(offset),
      q
        .select({ value: count() })
        .from(authAccounts)
        .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
        .leftJoin(
          cultivators,
          and(
            eq(cultivators.userId, authUsers.id),
            eq(cultivators.status, 'active'),
          ),
        )
        .where(where),
    ]);

    const userIds = rows.map((row) => row.userId);
    const providerMap = new Map<string, Set<string>>();
    const sessionMap = new Map<
      string,
      { activeSessionCount: number; lastSessionAt: Date | null }
    >();

    if (userIds.length > 0) {
      const now = new Date();
      const [providers, sessions] = await runDbTasks(q, [
        () =>
          q
            .select({
              userId: authAccounts.userId,
              providerId: authAccounts.providerId,
            })
            .from(authAccounts)
            .where(inArray(authAccounts.userId, userIds)),
        () =>
          q
            .select({
              userId: authSessions.userId,
              expiresAt: authSessions.expiresAt,
              updatedAt: authSessions.updatedAt,
            })
            .from(authSessions)
            .where(inArray(authSessions.userId, userIds)),
      ] as const);

      for (const provider of providers) {
        const values = providerMap.get(provider.userId) ?? new Set<string>();
        if (provider.providerId !== 'steam') values.add(provider.providerId);
        providerMap.set(provider.userId, values);
      }
      for (const session of sessions) {
        const current = sessionMap.get(session.userId) ?? {
          activeSessionCount: 0,
          lastSessionAt: null,
        };
        if (session.expiresAt > now) current.activeSessionCount += 1;
        if (!current.lastSessionAt || session.updatedAt > current.lastSessionAt) {
          current.lastSessionAt = session.updatedAt;
        }
        sessionMap.set(session.userId, current);
      }
    }

    const accounts: AdminSteamAccountItem[] = rows.map((row) => ({
      steamId: row.steamId,
      userId: row.userId,
      accountName: row.accountName,
      email: row.email,
      syntheticEmail: row.email.endsWith(SYNTHETIC_EMAIL_SUFFIX),
      banned: Boolean(row.banned),
      banReason: row.banReason ?? null,
      banExpires: toIso(row.banExpires),
      linkedAt: toIso(row.linkedAt) ?? '',
      otherProviders: Array.from(providerMap.get(row.userId) ?? []).sort(),
      activeSessionCount: sessionMap.get(row.userId)?.activeSessionCount ?? 0,
      lastSessionAt: toIso(sessionMap.get(row.userId)?.lastSessionAt),
      activeCultivator: row.cultivatorId
        ? {
            id: row.cultivatorId,
            name: row.cultivatorName ?? '',
            realm: row.realm ?? '',
            realmStage: row.realmStage ?? '',
            lastActiveAt: toIso(row.lastActiveAt),
          }
        : null,
    }));

    return c.json({
      success: true as const,
      data: {
        accounts,
        total: Number(totals[0]?.value ?? 0),
        page: query.page,
        limit: query.limit,
      },
    });
  },
);

router.post(
  '/:steamId/unlink',
  validateJson(AdminSteamUnlinkRequestSchema),
  async (c) => {
    const steamId = c.req.param('steamId').trim();
    if (!/^\d{15,20}$/.test(steamId)) {
      return c.json({ success: false as const, error: 'SteamID64 格式错误' }, 400);
    }

    const input = getValidatedJson<AdminSteamUnlinkRequest>(c);
    const operator = c.get('user');
    const role = getAdminRole(operator);
    if (!operator || !role) {
      return c.json({ success: false as const, error: '未授权访问' }, 401);
    }

    const q = getExecutor();
    const [row] = await q
      .select({
        userId: authAccounts.userId,
        email: authUsers.email,
      })
      .from(authAccounts)
      .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
      .where(
        and(
          eq(authAccounts.providerId, 'steam'),
          eq(authAccounts.accountId, steamId),
        ),
      )
      .limit(1);

    if (!row) {
      return c.json({ success: false as const, error: 'Steam 绑定不存在' }, 404);
    }
    if (row.userId !== input.expectedUserId) {
      return c.json(
        { success: false as const, error: '绑定关系已变化，请刷新后重试' },
        409,
      );
    }
    if (row.userId === operator.id) {
      return c.json(
        { success: false as const, error: '不能在管理后台解除当前管理员自己的 Steam 绑定' },
        409,
      );
    }

    const providerRows = await q
      .select({ providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(eq(authAccounts.userId, row.userId));
    const otherProviders = providerRows
      .map((item) => item.providerId)
      .filter((provider) => provider !== 'steam');
    const hasAlternativeLogin =
      !row.email.endsWith(SYNTHETIC_EMAIL_SUFFIX) || otherProviders.length > 0;

    if (!hasAlternativeLogin) {
      return c.json(
        {
          success: false as const,
          error: '该账号目前只有 Steam 登录。请先让玩家绑定可用邮箱，再解除 Steam 绑定。',
          code: 'STEAM_ONLY_ACCOUNT',
        },
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(authAccounts)
        .where(
          and(
            eq(authAccounts.providerId, 'steam'),
            eq(authAccounts.accountId, steamId),
            eq(authAccounts.userId, row.userId),
          ),
        );
      await tx.delete(authSessions).where(eq(authSessions.userId, row.userId));
    });

    try {
      await writeAdminAuditEvent({
        operatorUserId: operator.id,
        operatorEmail: operator.email,
        operatorRole: role,
        action: 'steam.unlink',
        targetType: 'steam_account',
        targetId: steamId,
        reason: input.reason,
        method: 'POST',
        path: new URL(c.req.url).pathname,
        status: 200,
        metadata: {
          userId: row.userId,
          otherProviders,
          sessionsRevoked: true,
        },
      });
    } catch (error) {
      console.error('[steam-admin] detailed audit write failed', error);
    }

    c.header('x-admin-audit-detailed', 'steam.unlink');
    return c.json({
      success: true as const,
      data: {
        steamId,
        userId: row.userId,
        unlinked: true as const,
        sessionsRevoked: true as const,
      },
    });
  },
);

export default router;
