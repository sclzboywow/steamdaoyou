# Steam 运行文件

正式发布前：

1. 将 `src-tauri/target/release` 旁边放置 Steamworks SDK 对应的 `steam_api64.dll`。
2. 本地联调可把 `steam_appid.txt.example` 复制成 `steam_appid.txt` 并替换为你的真实 AppID；正式 Steam 启动时通常不需要该文件。
3. Steamworks Publisher Web API Key 只能放服务器环境变量 `STEAM_WEB_API_KEY`，绝不能打进客户端。
4. 本仓库为 GPL-3.0；Steamworks SDK 的再分发与 GPL 组合发布需要你在正式上线前确认权利链和许可证兼容性。

## 字体

字体不随分发补丁提供。本地 `steam:dev` 需要：

```text
public/fonts/LXGWWenKaiLite-Regular.ttf
public/fonts/MaShanZheng-Regular.ttf
```

缺少时启动脚本会打印警告。`VITE_ASSET_BASE_URL` 为空则请求 `/fonts/...`；正式构建将该变量设为官方静态站后，同一路径从静态服务器加载。
