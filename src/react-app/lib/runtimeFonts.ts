import { assetUrl } from '@app/lib/assets';

let installed = false;

const RUNTIME_FONTS = [
  {
    family: 'LXGWWenKai',
    path: '/fonts/LXGWWenKaiLite-Regular.ttf',
  },
  {
    family: 'Ma Shan Zheng',
    path: '/fonts/MaShanZheng-Regular.ttf',
  },
] as const;

export function installRuntimeFonts() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const style = document.createElement('style');
  style.dataset.daoyouRuntimeFonts = 'true';
  style.textContent = RUNTIME_FONTS.map(
    (font) => `
@font-face {
  font-family: '${font.family}';
  src: url('${assetUrl(font.path)}') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`,
  ).join('\n');
  document.head.appendChild(style);

  // Local steam:dev serves public/fonts when VITE_ASSET_BASE_URL is empty.
  // Surface 404s in the browser console so silent system-font fallback is obvious.
  if (import.meta.env.DEV) {
    for (const font of RUNTIME_FONTS) {
      const url = assetUrl(font.path);
      void fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then((response) => {
          if (response.ok) return;
          console.warn(
            `[fonts] 无法加载「${font.family}」: ${url} (${response.status}). ` +
              '本地请放入 public/fonts/ 下对应 .ttf；正式包请检查 VITE_ASSET_BASE_URL。',
          );
        })
        .catch((error) => {
          console.warn(`[fonts] 无法加载「${font.family}」: ${url}`, error);
        });
    }
  }
}
