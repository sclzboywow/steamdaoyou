# Steam 正式服部署：Production Deployment V1

适用基线：`34efce9b78b87852e0fc4b51a58808c53d9e2267`

目标架构：

```text
Steam / Tauri
    |
    | HTTPS  steam-api.yzdoc.cn
    v
1Panel / OpenResty
    |
    +---- app-blue  127.0.0.1:3000
    |
    +---- app-green 127.0.0.1:3001
              |
              +-- PostgreSQL
              +-- Redis (AOF)
              +-- NATS JetStream
```

PostgreSQL、Redis、NATS 是长期运行的共享基础设施；蓝绿发布只替换 Bun/Hono 应用容器。

## 1. 准备配置

```bash
sudo mkdir -p /root/daoyou
sudo cp deploy/production/production.env.example /root/daoyou/.env.production
sudo chmod 600 /root/daoyou/.env.production
sudo nano /root/daoyou/.env.production
```

至少替换所有 `CHANGE_ME_*`，并确认：

- `API_DOMAIN=steam-api.yzdoc.cn`
- `BETTER_AUTH_URL=https://steam-api.yzdoc.cn`
- `PUBLIC_WEB_ORIGINS` 包含 `http://tauri.localhost`
- Steam App ID / Publisher Web API key 已填
- `DATABASE_URL`、`REDIS_URL` 中的密码与对应服务密码一致
- 密码包含 URI 保留字符时，`DATABASE_URL` / `REDIS_URL` 使用 URL 编码形式

## 2. 启动基础设施

```bash
sudo ENV_FILE=/root/daoyou/.env.production ./scripts/bootstrap-production.sh
```

此命令会：

- 创建 `daoyou-runtime` Docker 网络
- 启动 PostgreSQL / Redis / NATS JetStream
- 建立持久卷
- 创建蓝绿 upstream 文件（初始指向 blue:3000）
- 创建备份目录
- 安装每天 03:30（Asia/Shanghai）的 PostgreSQL systemd 备份任务
- 安装每 5 分钟宿主机运维快照采集
- 按配置限制 systemd journal 大小
- 若配置了真实 `OPENRESTY_LOG_DIR`，安装 OpenResty 文件日志轮转

PostgreSQL/Redis/NATS 不向公网暴露端口。

运维监控、日志轮转和旧镜像安全清理详见：

`docs/production-ops-monitoring.md`

## 3. 1Panel 域名与 HTTPS

在 1Panel 中建立 `steam-api.yzdoc.cn` 网站并申请 TLS 证书。参考：

`deploy/production/openresty/daoyou-api.conf.example`

关键要求：

- HTTP 80 跳 HTTPS
- HTTPS 反代 `daoyou_backend`
- `daoyou_backend` include：
  `/opt/1panel/www/sites/steam-api.yzdoc.cn/upstream/daoyou_backend.conf`
- 保留 WebSocket `Upgrade` / `Connection` 请求头

不要让蓝绿脚本直接改 TLS 证书；证书生命周期继续交给 1Panel。

## 4. 第一次数据库迁移

正式蓝绿发布要求迁移向后兼容。第一次初始化以及以后确认属于 expand 阶段的迁移：

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  MIGRATION_COMPATIBILITY=expand \
  ./scripts/migrate-production.sh
```

禁止在蓝绿交叠版本中直接执行：

- DROP COLUMN / DROP TABLE
- 直接 RENAME 导致旧版本字段消失
- 旧版本无法读取的破坏性类型变更

正确流程为 `expand -> 双版本兼容 -> 数据回填 -> contract`。

## 5. CI 镜像

打 Git tag 后 GitHub Actions 同时发布：

```text
<dockerhub>/daoyou-app:<full-git-sha>
<dockerhub>/daoyou-app:<git-tag>
<dockerhub>/daoyou-app:latest
```

生产发布优先使用完整 Git SHA。发布脚本默认拒绝 `:latest`。

## 6. 一键发布

普通无数据库迁移版本：

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  APP_IMAGE=<dockerhub>/daoyou-app:<full-git-sha> \
  ./scripts/release-production.sh
```

需要向后兼容 migration 的版本：

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  APP_IMAGE=<dockerhub>/daoyou-app:<full-git-sha> \
  RUN_MIGRATIONS=1 \
  MIGRATION_COMPATIBILITY=expand \
  ./scripts/release-production.sh
```

发布顺序：

1. PostgreSQL 发布前备份
2. 可选的 expand-compatible migration
3. 拉取闲置颜色的新镜像
4. `/api/ready-check` 检查 PostgreSQL + Redis + NATS + 消息基础设施
5. `nginx -t`
6. 原子切换 upstream
7. 通过公网 HTTPS 再检查 `/api/ready-check`
8. 公网检查失败时，在旧实例仍运行的窗口内自动切回
9. 成功后记录 `CURRENT_IMAGE/PREVIOUS_IMAGE`
10. 旧实例 drain 90 秒后停止

## 7. 一键回滚

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  ./scripts/rollback-production.sh
```

回滚只回滚应用镜像，不自动逆转数据库迁移。因此破坏性 schema 变更不能与蓝绿发布绑定。

## 8. 自动备份

手工立即备份：

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  ./scripts/backup-production.sh
```

检查定时任务：

```bash
systemctl status daoyou-postgres-backup.timer
systemctl list-timers daoyou-postgres-backup.timer
```

默认保留 14 天。每个备份使用 PostgreSQL custom archive，并在生成后执行 `pg_restore --list` 完整性校验和 SHA-256 校验。

Redis 已开启 AOF `everysec`，NATS JetStream 使用持久卷。当前定时灾备重点保护 PostgreSQL（玩家永久数据）；Redis/NATS 主要保存运行中状态和消息投递状态。

## 9. 生产验证

```bash
sudo ENV_FILE=/root/daoyou/.env.production \
  ./scripts/verify-production.sh
```

应同时通过：

- PostgreSQL / Redis / NATS 容器健康
- 当前 blue/green upstream 合法
- 当前应用本机 `/api/ready-check`
- `https://steam-api.yzdoc.cn/api/ready-check`

## 10. Steam 客户端

正式 Steam Build：

```text
VITE_API_BASE_URL=https://steam-api.yzdoc.cn
```

客户端永远只认域名，不认 blue/green 端口和服务器 IP。以后迁香港、日本、新加坡或更换公网 IP，只改 DNS / 反向代理，不需要因此重新发布 Steam 客户端。
