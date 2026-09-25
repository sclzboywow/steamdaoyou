import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** Local Steam/Vite font files served from public/ when VITE_ASSET_BASE_URL is empty. */
export const STEAM_LOCAL_FONT_FILES = [
  'public/fonts/LXGWWenKaiLite-Regular.ttf',
  'public/fonts/MaShanZheng-Regular.ttf',
] as const;

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function readSimpleEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = stripQuotes(line.slice(index + 1).trim());
    if (key) result[key] = value;
  }
  return result;
}

export function warnMissingSteamLocalFonts(root = process.cwd()): string[] {
  const missing = STEAM_LOCAL_FONT_FILES.filter((rel) => {
    const absolute = resolve(root, rel);
    try {
      const stats = statSync(absolute);
      return !stats.isFile() || stats.size <= 0;
    } catch {
      return true;
    }
  });

  if (missing.length === 0) return missing;

  const lines = [
    '[steam:dev] 本地字体文件缺失，页面会回退到系统字体，水墨样式将不正确。',
    '[steam:dev] 请自行将合法取得的字体放入仓库（补丁不会分发字体文件）：',
    ...missing.map((rel) => `  - ${rel}`),
    '[steam:dev] 本地 VITE_ASSET_BASE_URL 为空时，浏览器会请求：',
    '  - /fonts/LXGWWenKaiLite-Regular.ttf',
    '  - /fonts/MaShanZheng-Regular.ttf',
    '[steam:dev] 正式 steam:build 仍通过 VITE_ASSET_BASE_URL 从官方静态站加载同名路径。',
  ];
  for (const line of lines) {
    console.warn(line);
  }
  return missing;
}

export function loadSteamLocalEnvironment(): Record<string, string> {
  const root = process.cwd();
  const localPath = resolve(root, 'env/local.env');
  if (!existsSync(localPath)) {
    throw new Error(
      '缺少 env/local.env。请先准备本地 PostgreSQL / Redis / NATS / Better Auth 配置。',
    );
  }
  const local = readSimpleEnvFile(localPath);
  const steam = readSimpleEnvFile(resolve(root, 'env/steam.local.env'));
  const defaults: Record<string, string> = {
    APP_ENV: 'local',
    NODE_ENV: 'development',
    PORT: local.PORT || '3000',
    WEB_PORT: '5174',
    VITE_DISTRIBUTION_CHANNEL: 'steam',
    VITE_API_BASE_URL: '',
    VITE_PUBLIC_WEB_ORIGIN: 'http://127.0.0.1:5174',
    VITE_ASSET_BASE_URL: '',
    VITE_STEAM_APP_ID: '480',
    VITE_STEAM_WEBAPI_IDENTITY: 'wanjie-daoyou-local',
    VITE_STEAM_AUTH_DEV_BYPASS: 'true',
    VITE_STEAM_DEV_USER_ID: '76561198000000000',
    VITE_STEAM_DEV_PERSONA_NAME: '本地测试道友',
    STEAM_AUTH_DEV_BYPASS: 'true',
    STEAM_APP_ID: '480',
    STEAM_WEB_API_IDENTITY: 'wanjie-daoyou-local',
    STEAM_DEV_USER_ID: '76561198000000000',
    CONTENT_SAFETY_FAIL_CLOSED: 'false',
    PUBLIC_WEB_ORIGINS:
      'http://127.0.0.1:5174,http://localhost:5174,http://tauri.localhost',
  };

  return {
    ...process.env,
    ...local,
    ...defaults,
    ...steam,
  } as Record<string, string>;
}
