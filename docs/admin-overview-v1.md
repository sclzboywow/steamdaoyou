# Admin Overview V1

基线：`135b2d53c4e0b4882e798e67cdf99a9e58f24f88`

## 路由

- `/admin`：只做重定向
- `/admin/overview`：侧边栏“总览”的实际页面
- `/api/admin/overview`：单一聚合接口

`admin.yzdoc.cn` 与普通 Web 继续使用同一套 React SPA、同一套 API、同一套认证。
没有新增 admin distribution channel，也没有第二套前端工程。

## 总览只展示

- 当前在线 + 今日峰值
- 24h 活跃角色
- 今日新增账号 + 其中 Steam
- 反馈待处理 + 处理中
- 24h 内容审核不可用 + 拒绝
- 最近 300 次 LLM 成功率/失败数
- PostgreSQL / Redis / NATS / 消息基础设施状态
- 当前 APP_RELEASE

不同管理员角色根据既有 capability 自动隐藏无权限摘要。

## 不展示

- 累计注册
- 历史最高在线
- 累计角色
- 战斗/炼丹/市场等行为总量
- LLM token 与缓存细节
- 审核总次数
- CPU/内存等基础监控

这些继续留在专业页面，或在明确产生运营决策需求后再增加。

## admin.yzdoc.cn

生产环境：

```env
PUBLIC_WEB_ORIGINS=http://tauri.localhost,https://admin.yzdoc.cn
ADMIN_WEB_ORIGINS=https://admin.yzdoc.cn
```

同一份 Web build 可设置：

```env
VITE_ADMIN_WEB_ORIGIN=https://admin.yzdoc.cn
VITE_API_BASE_URL=https://steam-api.yzdoc.cn
```

若未设置 `VITE_ADMIN_WEB_ORIGIN`，前端仍会把 `admin.*` 主机名识别为管理入口。

管理域名根路径：

- 未登录 -> `/login`
- 已登录 -> `/admin/overview`

邮箱验证码、密码登录、GitHub 登录成功后也会根据当前域名回到 `/admin/overview`，普通 Web 仍进入 `/game`。

## “今日”的定义

所有总览中的“今日”以及在线峰值业务日统一按：

`Asia/Shanghai`

不再依赖 Docker/Linux 主机本地时区。
