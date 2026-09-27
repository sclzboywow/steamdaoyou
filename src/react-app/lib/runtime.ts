export type DistributionChannel = 'web' | 'wechat' | 'steam';

const env = import.meta.env as Record<string, string | undefined>;

export const distributionChannel: DistributionChannel =
  env.VITE_DISTRIBUTION_CHANNEL === 'steam'
    ? 'steam'
    : env.VITE_DISTRIBUTION_CHANNEL === 'wechat'
      ? 'wechat'
      : 'web';

export const isSteamRuntime = distributionChannel === 'steam';
export const isWechatRuntime = distributionChannel === 'wechat';
export const isWebRuntime = distributionChannel === 'web';

const configuredAdminWebOrigin = env.VITE_ADMIN_WEB_ORIGIN
  ?.trim()
  .replace(/\/+$/, '');

function resolveRuntimeUrl(input?: string | URL): URL | null {
  if (input instanceof URL) return input;
  if (typeof input === 'string') {
    try {
      return new URL(input);
    } catch {
      return null;
    }
  }
  if (typeof window !== 'undefined') return new URL(window.location.href);
  return null;
}

export function isAdminPortalLocation(input?: string | URL): boolean {
  if (isSteamRuntime) return false;
  const url = resolveRuntimeUrl(input);
  if (!url) return false;

  if (configuredAdminWebOrigin) {
    try {
      return url.origin === new URL(configuredAdminWebOrigin).origin;
    } catch {
      // Fall through to the conventional admin.* hostname rule.
    }
  }

  return url.hostname.toLowerCase().startsWith('admin.');
}

export function getDefaultAuthenticatedPath(input?: string | URL): string {
  return isAdminPortalLocation(input) ? '/admin/overview' : '/game';
}

/** Local steam:dev only — production Steam builds keep admin UI blocked. */
export const allowSteamLocalAdmin =
  isSteamRuntime &&
  Boolean(import.meta.env.DEV) &&
  env.VITE_STEAM_AUTH_DEV_BYPASS === 'true';

export const runtimeCapabilities = {
  pwaInstall: isWebRuntime,
  githubAuth: isWebRuntime,
  githubIssues: isWebRuntime,
  llmByok: !isSteamRuntime,
  afdianCheckout: isWebRuntime,
  rewardedAds: isWechatRuntime,
  wechatOpenAbilities: isWechatRuntime,
  steamAuth: isSteamRuntime,
  steamAchievements: false,
  steamCloud: false,
  webVersionNotifier: !isSteamRuntime,
} as const;
