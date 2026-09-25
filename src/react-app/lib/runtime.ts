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
