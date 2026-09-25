import { authAccounts, authSessions, authUsers } from '@server/lib/auth/schema';
import {
  assertGenericContentSafe,
  GenericContentSafetyProviderError,
} from '@server/lib/contentSafety/GenericContentSafetyProvider';
import { db, getExecutor } from '@server/lib/drizzle/db';
import { textFilter } from '@server/lib/services/textFilter';
import type { SteamTicketRequest } from '@shared/contracts/steam';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class SteamAuthError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 409 | 503 = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SteamAuthError';
  }
}

type SteamTicketResponse = {
  response?: {
    params?: {
      result?: string;
      steamid?: string;
      ownersteamid?: string;
      vacbanned?: boolean;
      publisherbanned?: boolean;
    };
    error?: { errorcode?: number; errordesc?: string };
  };
};

function requiredEnv(name: 'STEAM_APP_ID' | 'STEAM_WEB_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) throw new SteamAuthError(`Steam 服务未配置：${name}`, 503);
  return value;
}

function expectedIdentity() {
  return process.env.STEAM_WEB_API_IDENTITY?.trim() || 'wanjie-daoyou-steam';
}

function localSteamBypassEnabled() {
  return (
    process.env.APP_ENV === 'local' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.STEAM_AUTH_DEV_BYPASS === 'true'
  );
}

function verifyLocalSteamBypass(input: SteamTicketRequest) {
  const configuredAppId = Number(process.env.STEAM_APP_ID?.trim() || '480');
  const expectedSteamId =
    process.env.STEAM_DEV_USER_ID?.trim() || '76561198000000000';
  if (input.appId !== configuredAppId) {
    throw new SteamAuthError('本地 Steam AppID 不匹配', 401);
  }
  if (input.identity !== expectedIdentity()) {
    throw new SteamAuthError('本地 Steam identity 不匹配', 401);
  }
  if (input.ticket !== '6465762d6279706173732d7469636b6574' || input.steamId !== expectedSteamId) {
    throw new SteamAuthError('本地 Steam mock 凭据无效', 401);
  }
  return { steamId: expectedSteamId };
}

export async function verifySteamTicket(input: SteamTicketRequest) {
  if (localSteamBypassEnabled()) return verifyLocalSteamBypass(input);

  const configuredAppId = Number(requiredEnv('STEAM_APP_ID'));
  if (!Number.isInteger(configuredAppId) || configuredAppId <= 0) {
    throw new SteamAuthError('STEAM_APP_ID 配置错误', 503);
  }
  if (input.appId !== configuredAppId) {
    throw new SteamAuthError('Steam AppID 不匹配', 401);
  }
  if (input.identity !== expectedIdentity()) {
    throw new SteamAuthError('Steam 认证 identity 不匹配', 401);
  }

  const url = new URL(
    'https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/',
  );
  url.searchParams.set('key', requiredEnv('STEAM_WEB_API_KEY'));
  url.searchParams.set('appid', String(configuredAppId));
  url.searchParams.set('ticket', input.ticket);
  url.searchParams.set('identity', input.identity);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new SteamAuthError('Steam 认证服务暂不可用', 503);
  }
  if (!response.ok) {
    throw new SteamAuthError(
      'Steam 认证失败',
      response.status >= 500 ? 503 : 401,
    );
  }

  const payload = (await response.json()) as SteamTicketResponse;
  const params = payload.response?.params;
  if (!params?.steamid || (params.result && params.result !== 'OK')) {
    throw new SteamAuthError(
      payload.response?.error?.errordesc || 'Steam Ticket 无效或已失效',
      401,
    );
  }
  if (params.steamid !== input.steamId) {
    throw new SteamAuthError('Steam 身份校验不一致', 401);
  }
  if (params.publisherbanned) {
    throw new SteamAuthError('该 Steam 账号当前无法使用本游戏在线服务', 401);
  }
  return { steamId: params.steamid };
}

async function findSteamAccount(steamId: string) {
  const [row] = await getExecutor()
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.providerId, 'steam'),
        eq(authAccounts.accountId, steamId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLinkedSteamId(userId: string) {
  const [row] = await getExecutor()
    .select({ accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(
      and(eq(authAccounts.providerId, 'steam'), eq(authAccounts.userId, userId)),
    )
    .limit(1);
  return row?.accountId ?? null;
}

function issueToken() {
  return randomBytes(32).toString('base64url');
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}

async function createSession(userId: string) {
  const token = issueToken();
  const now = new Date();
  await getExecutor().insert(authSessions).values({
    userId,
    token,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    userAgent: 'wanjiedaoyou-steam',
  });
  return token;
}

function syntheticSteamEmail(steamId: string) {
  return `steam-${steamId}@steam.wanjiedaoyou.invalid`;
}

async function assertSteamDisplayNameSafe(steamId: string, displayName: string) {
  if (textFilter.mask(displayName).changed) {
    throw new SteamAuthError(
      'Steam 昵称不符合社区规范，请修改 Steam 昵称后重试',
      400,
      'STEAM_NAME_REJECTED',
    );
  }
  try {
    await assertGenericContentSafe({
      userId: `steam:${steamId}`,
      source: 'auth_display_name',
      content: displayName,
    });
  } catch (error) {
    if (error instanceof GenericContentSafetyProviderError) {
      throw new SteamAuthError(
        error.kind === 'rejected'
          ? 'Steam 昵称不符合社区规范，请修改 Steam 昵称后重试'
          : '内容审核服务暂不可用，请稍后重试',
        error.kind === 'rejected' ? 400 : 503,
        error.kind === 'rejected'
          ? 'STEAM_NAME_REJECTED'
          : 'CONTENT_CHECK_UNAVAILABLE',
      );
    }
    throw error;
  }
}

export async function loginSteamUser(input: SteamTicketRequest) {
  const { steamId } = await verifySteamTicket(input);
  const linked = await findSteamAccount(steamId);
  if (linked) {
    return {
      created: false,
      steamId,
      bearerToken: await createSession(linked.userId),
    };
  }

  if (!input.createIfMissing) {
    throw new SteamAuthError(
      '当前 Steam 账号尚未绑定万界道友账号',
      409,
      'STEAM_ACCOUNT_NOT_LINKED',
    );
  }

  const displayName = input.personaName.trim() || `Steam ${steamId.slice(-6)}`;
  await assertSteamDisplayNameSafe(steamId, displayName);

  let created = true;
  let createdUserId: string;
  try {
    createdUserId = await db.transaction(async (tx) => {
      const [alreadyLinked] = await tx
        .select({ userId: authAccounts.userId })
        .from(authAccounts)
        .where(
          and(
            eq(authAccounts.providerId, 'steam'),
            eq(authAccounts.accountId, steamId),
          ),
        )
        .limit(1);
      if (alreadyLinked) {
        created = false;
        return alreadyLinked.userId;
      }

      const now = new Date();
      const [user] = await tx
        .insert(authUsers)
        .values({
          name: displayName,
          email: syntheticSteamEmail(steamId),
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: authUsers.id });
      if (!user) throw new SteamAuthError('创建 Steam 游戏账号失败', 503);

      await tx.insert(authAccounts).values({
        userId: user.id,
        providerId: 'steam',
        accountId: steamId,
        createdAt: now,
        updatedAt: now,
      });
      return user.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findSteamAccount(steamId);
    if (!raced) throw error;
    created = false;
    createdUserId = raced.userId;
  }

  return {
    created,
    steamId,
    bearerToken: await createSession(createdUserId),
  };
}

export async function linkSteamUser(userId: string, input: SteamTicketRequest) {
  const { steamId } = await verifySteamTicket(input);
  const linked = await findSteamAccount(steamId);
  if (linked && linked.userId !== userId) {
    throw new SteamAuthError(
      '该 Steam 账号已绑定其他万界道友账号',
      409,
      'STEAM_ALREADY_LINKED',
    );
  }
  if (linked) return { steamId };

  const existingSteamId = await getLinkedSteamId(userId);
  if (existingSteamId && existingSteamId !== steamId) {
    throw new SteamAuthError(
      '当前万界道友账号已绑定其他 Steam 账号',
      409,
      'USER_ALREADY_HAS_STEAM',
    );
  }

  const now = new Date();
  try {
    await getExecutor().insert(authAccounts).values({
      userId,
      providerId: 'steam',
      accountId: steamId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const owner = await findSteamAccount(steamId);
    if (owner?.userId === userId) return { steamId };
    if (owner) {
      throw new SteamAuthError(
        '该 Steam 账号已绑定其他万界道友账号',
        409,
        'STEAM_ALREADY_LINKED',
      );
    }
    const existing = await getLinkedSteamId(userId);
    if (existing && existing !== steamId) {
      throw new SteamAuthError(
        '当前万界道友账号已绑定其他 Steam 账号',
        409,
        'USER_ALREADY_HAS_STEAM',
      );
    }
    throw error;
  }
  return { steamId };
}
