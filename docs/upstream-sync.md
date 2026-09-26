# 官方上游同步基线

- 上游仓库：`ChurchTao/Daoyou`
- 上游分支：`master`
- 本地同步前：`532765eff19b9a553fd48633003aa7fbaa154d0e`
- PR #79 起点：`9126535d8748fe1613c677fd6b7b15465b668744`
- PR #79 head：`8900fd943a893e6b80e24a10eaef4f707e86234e`
- PR #79 merge：`25ce3a59be27`
- **已吸收到官方基线：`5094bdf82e1b85b7980c787554a6d74293c8d7bc`**
- 日期：2026-09-26

## 后续检查规则

以后检查官方更新时，只比较 `ChurchTao/Daoyou` 在 `5094bdf82e1b85b7980c787554a6d74293c8d7bc` **之后**的提交。

不要重新吸收：
- PR #79（百草集 / Inventory / 触屏快捷操作 / 灵气符 10 次 / 批量转移）
- PR #78（Guide V2 修复；本地此前已经具备）

## 本地必须保留

- Steam/Tauri 运行时
- Steam 登录和分发逻辑
- 声望/宗门商店境界门槛
- `skill_manual` 历史资产封存策略
- Steam Guide V2
- Steam 灵田定制
