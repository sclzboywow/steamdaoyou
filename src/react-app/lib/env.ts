const clientImportMetaEnv = import.meta.env as Record<
  string,
  string | undefined
>;

function getOptionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = clientImportMetaEnv[name];
    if (value) {
      return value;
    }
  }

  return undefined;
}

export const clientEnv = {
  apiBaseUrl: getOptionalEnv('VITE_API_BASE_URL')?.replace(/\/+$/, ''),
  assetBaseUrl: getOptionalEnv('VITE_ASSET_BASE_URL')?.replace(/\/+$/, ''),
  publicWebOrigin: getOptionalEnv('VITE_PUBLIC_WEB_ORIGIN')?.replace(/\/+$/, ''),
  distributionChannel: getOptionalEnv('VITE_DISTRIBUTION_CHANNEL') ?? 'web',
  steamAppId: getOptionalEnv('VITE_STEAM_APP_ID'),
  steamWebApiIdentity:
    getOptionalEnv('VITE_STEAM_WEBAPI_IDENTITY') ?? 'wanjie-daoyou-steam',
};
