import { rm } from 'node:fs/promises';

const required = [
  'VITE_API_BASE_URL',
  'VITE_STEAM_APP_ID',
  'VITE_PUBLIC_WEB_ORIGIN',
  'VITE_ASSET_BASE_URL',
] as const;

function requiredEnv(name: (typeof required)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`build:steam requires ${name}`);
  return value;
}

function requireHttpsUrl(name: (typeof required)[number], value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`build:steam requires a valid URL for ${name}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`build:steam requires HTTPS for ${name}`);
  }
  if (
    ['localhost', '127.0.0.1', '::1', 'tauri.localhost'].includes(url.hostname)
  ) {
    throw new Error(`build:steam refuses local host in ${name}`);
  }
}

const apiBaseUrl = requiredEnv('VITE_API_BASE_URL');
const appId = requiredEnv('VITE_STEAM_APP_ID');
const publicWebOrigin = requiredEnv('VITE_PUBLIC_WEB_ORIGIN');
const assetBaseUrl = requiredEnv('VITE_ASSET_BASE_URL');

if (!/^\d+$/.test(appId) || Number(appId) <= 0) {
  throw new Error('build:steam requires a positive numeric VITE_STEAM_APP_ID');
}
if (appId === '480') {
  throw new Error('build:steam refuses Valve SpaceWar AppID 480; use your real AppID');
}
if (process.env.VITE_STEAM_AUTH_DEV_BYPASS === 'true') {
  throw new Error('build:steam refuses VITE_STEAM_AUTH_DEV_BYPASS=true');
}

requireHttpsUrl('VITE_API_BASE_URL', apiBaseUrl);
requireHttpsUrl('VITE_PUBLIC_WEB_ORIGIN', publicWebOrigin);
requireHttpsUrl('VITE_ASSET_BASE_URL', assetBaseUrl);

const env = {
  ...process.env,
  VITE_DISTRIBUTION_CHANNEL: 'steam',
  VITE_STEAM_AUTH_DEV_BYPASS: 'false',
};
const child = Bun.spawn(['bun', 'run', 'build:client'], {
  env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
const exitCode = await child.exited;
if (exitCode !== 0) process.exit(exitCode);

// Production Steam client resolves maps/fonts from the official asset origin.
// Local steam:dev never executes this script, so local Vite still serves them.
await Promise.all([
  rm('dist/assets/maps', { recursive: true, force: true }),
  rm('dist/fonts', { recursive: true, force: true }),
]);
