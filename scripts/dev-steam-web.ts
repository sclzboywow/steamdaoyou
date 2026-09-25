const env = {
  ...process.env,
  WEB_PORT: process.env.WEB_PORT || '5174',
  VITE_DISTRIBUTION_CHANNEL: 'steam',
};

const child = Bun.spawn(['bun', 'x', 'vite'], {
  env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await child.exited);
