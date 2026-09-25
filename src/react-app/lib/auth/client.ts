import { i18nClient } from '@better-auth/i18n/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { clientEnv } from '@app/lib/env';
import { distributionChannel, isSteamRuntime } from '@app/lib/runtime';
import { readSteamBearerToken, writeSteamBearerToken } from '@app/lib/steamSession';

export const authClient = createAuthClient({
  baseURL: clientEnv.apiBaseUrl,
  basePath: '/api/auth',
  fetchOptions: {
    credentials: 'include',
    headers: {
      'x-distribution-channel': distributionChannel,
    },
    ...(isSteamRuntime
      ? {
          auth: {
            type: 'Bearer' as const,
            token: () => readSteamBearerToken() || '',
          },
          onSuccess: (ctx: { response: Response }) => {
            const token = ctx.response.headers.get('set-auth-token');
            if (token) writeSteamBearerToken(token);
          },
        }
      : {}),
  },
  plugins: [i18nClient(), emailOTPClient()],
});
