# 预验证记录

生成日期：2026-09-26

## 固定版本

- `sclzboywow/steamdaoyou` 当前 main：`532765eff19b9a553fd48633003aa7fbaa154d0e`
- `ChurchTao/Daoyou` PR #79 base：`9126535d8748fe1613c677fd6b7b15465b668744`
- PR #79 head：`8900fd943a893e6b80e24a10eaef4f707e86234e`
- 官方最终吸收基线：`5094bdf82e1b85b7980c787554a6d74293c8d7bc`

## 文件级验证

PR #79 共 26 个文件。

其中 **24 个文件**在我们的 `532765eff19b9a553fd48633003aa7fbaa154d0e` 与官方 `9126535d8748fe1613c677fd6b7b15465b668744` 的 Git blob SHA 完全一致。

仅两处本地定制：

### `src/react-app/components/feature/items/presentation/basic.ts`

官方 PR #79 只改：
- `SeedPreviewFactsSchema` import
- `seedAdapter` 对公开种子预览的兼容

本地定制位于 `materialAdapter`：
- `skill_manual` 当前用途
- `skill_manual` 历史资产说明

两组改动不重叠，官方 hunk 所需上下文已逐行确认存在。

### `src/react-app/routes/game/spirit-field/route.tsx`

官方只增加：
- `InventoryItems.quickTouchHint`
- item slot `quickOnTouch: true`
- 选择位 `quickOnTouch`

对应 hunk 上下文已在本地 `532765eff19b9a553fd48633003aa7fbaa154d0e` 逐行确认存在，因此不会整文件覆盖本地灵田定制。

## 教学重复检查

PR #79 不包含 PR #78 的教学修复。
本地已经具备 PR #78 的 Guide V2，因此不会重复应用。

## CI / 构建说明

官方 PR #79 head `8900fd943a893e6b80e24a10eaef4f707e86234e` 没有公开 workflow run / combined status，不能声称“官方 CI 已通过”。

本包采用：
1. 应用前 `git apply --check --whitespace=error-all`
2. 应用后默认 `bun run test`
3. 应用后默认 `bun run build`

如果第 1 步失败，仓库不会被修改。
