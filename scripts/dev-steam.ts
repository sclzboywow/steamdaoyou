import {
  loadSteamLocalEnvironment,
  warnMissingSteamLocalFonts,
} from './steam-env';

const env = loadSteamLocalEnvironment();
console.log('[steam:dev] local mock mode');
console.log(`[steam:dev] API: http://127.0.0.1:${env.PORT || '3000'}`);
console.log(`[steam:dev] Vite: http://127.0.0.1:${env.WEB_PORT || '5174'}`);
console.log(`[steam:dev] Mock SteamID: ${env.STEAM_DEV_USER_ID}`);
warnMissingSteamLocalFonts();

const api = Bun.spawn(['bun', '--watch', 'src/index.ts'], {
  env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
const tauri = Bun.spawn(['bun', 'x', 'tauri', 'dev'], {
  env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  try {
    api.kill();
  } catch {}
  try {
    tauri.kill();
  } catch {}
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const first = await Promise.race([
  api.exited.then((code) => ({ name: 'api', code })),
  tauri.exited.then((code) => ({ name: 'tauri', code })),
]);
console.log(`[steam:dev] ${first.name} exited (${first.code})`);
stop();
await Promise.allSettled([api.exited, tauri.exited]);
process.exit(first.code);
