import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './index.css';
import { resolveApiUrl } from './lib/api/url';
import { registerPreloadErrorRecovery } from './lib/appVersion';
import { readStoredLlmConfig } from './lib/llmConfig';
import { initializePwaInstallCapture } from './lib/pwaInstall';
import { distributionChannel, runtimeCapabilities } from './lib/runtime';
import { installRuntimeFonts } from './lib/runtimeFonts';
import { readSteamBearerToken } from './lib/steamSession';
import { router } from './router';

if (import.meta.env.PROD && runtimeCapabilities.webVersionNotifier) {
  registerPreloadErrorRecovery();
}
if (runtimeCapabilities.pwaInstall) {
  initializePwaInstallCapture();
}
installRuntimeFonts();

const originalFetch = window.fetch;
window.fetch = (async (input, init) => {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    init = { ...init, credentials: init?.credentials ?? 'include' };
    const headers = new Headers(init?.headers);
    headers.set('x-distribution-channel', distributionChannel);

    const bearer = readSteamBearerToken();
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);

    if (runtimeCapabilities.llmByok) {
      const cfg = readStoredLlmConfig();
      if (cfg) {
        headers.set('x-llm-provider', cfg.provider);
        headers.set('x-llm-api-key', cfg.apiKey);
        headers.set('x-llm-model', cfg.model);
      }
    }

    init = { ...init, headers };
    input = resolveApiUrl(input);
  }
  return originalFetch(input, init);
}) as typeof window.fetch;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
