import { invoke } from '@tauri-apps/api/core';
import { clientEnv } from '@app/lib/env';
import { isSteamRuntime } from '@app/lib/runtime';

const TOKEN_KEY = 'wanjiedaoyou:steam:bearer';
const STEAM_ID_KEY = 'wanjiedaoyou:steam:id';
const DEFAULT_IDENTITY = 'wanjie-daoyou-steam';
const env = import.meta.env as Record<string, string | boolean | undefined>;
const DEFAULT_DEV_STEAM_ID = '76561198000000000';

export const isSteamAuthDevBypass =
  isSteamRuntime &&
  import.meta.env.DEV &&
  env.VITE_STEAM_AUTH_DEV_BYPASS === 'true';

export type SteamTicketPayload = {
  appId: number; steamId: string; personaName: string; ticket: string; identity: string;
};
export class SteamSessionError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = 'SteamSessionError'; }
}
export function readSteamBearerToken(): string | null {
  if (!isSteamRuntime || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function writeSteamBearerToken(token: string, steamId?: string) {
  if (!isSteamRuntime || typeof localStorage === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  if (steamId) localStorage.setItem(STEAM_ID_KEY, steamId);
}
export function clearSteamBearerToken() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(STEAM_ID_KEY);
}
export function getSteamAppId(): number {
  const parsed = Number(clientEnv.steamAppId ?? '');
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Steam AppID 未配置，请设置 VITE_STEAM_APP_ID');
  return parsed;
}
export async function requestSteamWebApiTicket(): Promise<SteamTicketPayload> {
  if (!isSteamRuntime) throw new Error('当前不是 Steam 客户端');
  const appId = getSteamAppId();
  const identity = clientEnv.steamWebApiIdentity || DEFAULT_IDENTITY;
  if (isSteamAuthDevBypass) {
    return {
      appId,
      steamId:
        String(env.VITE_STEAM_DEV_USER_ID || '').trim() || DEFAULT_DEV_STEAM_ID,
      personaName:
        String(env.VITE_STEAM_DEV_PERSONA_NAME || '').trim() || '本地测试道友',
      ticket: '6465762d6279706173732d7469636b6574',
      identity,
    };
  }
  return invoke<SteamTicketPayload>('steam_get_webapi_ticket', {
    appId,
    identity,
  });
}
export async function loginWithSteam(options: { createIfMissing?: boolean } = {}) {
  const payload = await requestSteamWebApiTicket();
  const response = await fetch('/api/steam-auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, createIfMissing: options.createIfMissing ?? false }),
  });
  const result = (await response.json()) as {
    success?: boolean; error?: string; code?: string;
    data?: { bearerToken: string; steamId: string; created: boolean };
  };
  if (!response.ok || !result.success || !result.data) {
    throw new SteamSessionError(result.error || 'Steam 登录失败', result.code);
  }
  writeSteamBearerToken(result.data.bearerToken, result.data.steamId);
  return result.data;
}
export async function bindCurrentAccountToSteam(): Promise<string> {
  const payload = await requestSteamWebApiTicket();
  const response = await fetch('/api/steam-auth/link', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = (await response.json()) as { success?: boolean; error?: string; data?: { steamId: string } };
  if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Steam 绑定失败');
  return result.data.steamId;
}
