# Production Ops Safety V1

基线：`8938d9f6192adc1beb57e5e2c2933fa2279b9a70`

总览“运维”区域只展示：存储、内存、日志、PostgreSQL 备份，以及 TLS 临期异常。

阈值：

- 磁盘：80% / 10 GiB 警告；90% / 5 GiB 严重
- 内存：80% 警告；90% 严重
- 日志：2 GiB 警告；5 GiB 严重
- 备份：26 小时警告；48 小时严重；最近一次执行失败直接警告
- TLS：14 天警告；7 天严重

宿主机运维信息只返回给 `super_admin` 和 `ops`。

## 权限边界

应用容器不挂 Docker socket，也不读取 `/root` 或 `/var/lib/docker`。
宿主机每 5 分钟生成 `/root/daoyou/runtime/ops-status.json`，
应用只读挂载到 `/run/daoyou/ops-status.json`。

## 日志治理

Docker 已有 `20m × 5` 轮转。

OpenResty 日志目录必须先确认真实 1Panel 宿主机路径，再填写：

```env
OPENRESTY_LOG_DIR=/真实/1panel/日志目录
```

如果 1Panel 已对同一目录配置可靠轮转：

```env
INSTALL_OPENRESTY_LOGROTATE=0
```

否则补丁会每小时检查，按每日/100MiB轮转，保留7份并压缩。

journald 默认：

```env
INSTALL_JOURNAL_LIMIT=1
JOURNAL_SYSTEM_MAX_USE=500M
JOURNAL_RUNTIME_MAX_USE=200M
```

这是宿主机级限制。

## 备份与镜像

备份脚本记录最近成功/失败状态；失败半成品删除。

成功发布后安全清理本应用旧镜像：
保留 CURRENT_IMAGE、PREVIOUS_IMAGE 和最近5个唯一版本；
不执行全局 `docker system prune -a`。

## 安装

```bash
sudo ENV_FILE=/root/daoyou/.env.production ./scripts/install-ops-monitor.sh
```

确认：

```bash
systemctl status daoyou-ops-collector.timer
cat /root/daoyou/runtime/ops-status.json
```
