# 本地字体（不随补丁分发）

Steam / Web 运行时通过 `@font-face` 使用：

- `LXGWWenKai` ← `LXGWWenKaiLite-Regular.ttf`
- `Ma Shan Zheng` ← `MaShanZheng-Regular.ttf`

请自行将合法取得的字体文件放到本目录：

```text
public/fonts/LXGWWenKaiLite-Regular.ttf
public/fonts/MaShanZheng-Regular.ttf
```

- 本地 `steam:dev`：`VITE_ASSET_BASE_URL` 为空时，浏览器请求 `/fonts/...`，由 Vite 从本目录提供。
- 正式 `steam:build`：设置 `VITE_ASSET_BASE_URL`（例如 `https://static.example.com`）后，请求变为 `{ASSET_BASE}/fonts/...`；构建产物会剔除 `dist/fonts/`，避免大字体打进客户端包。
