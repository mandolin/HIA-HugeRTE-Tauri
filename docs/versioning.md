# 版本与发布规范

本文档定义 HIA HugeRTE Tauri 的版本号、变更记录与发布纪律。

## 版本号规则

- 采用语义化版本 `MAJOR.MINOR.PATCH`。当前处于 `0.x` alpha 阶段：公开 API 与文件格式行为可能在任何版本间调整，不承诺向后兼容。
- 已发布版本的修正补丁使用预发布标识 `-fix.N`（例如 `0.1.0-fix.1`），表示在同一基线上的本地修复；功能性演进递增 `MINOR`，破坏性变更递增 `MAJOR`（`1.0.0` 起另行声明兼容承诺）。
- 例外（2026-11-11 起）：`0.x` 阶段，维护者可明确指定以 `PATCH` 号发布承载既有 `MINOR` 线功能增量的快照版本（如维护者直接指定的 `0.2.1`）；该指定必须在 CHANGELOG 条目或发布说明中记录，不构成对"`MINOR` 承载功能演进"一般规则的修改。
- 版本号不得只改一处。发布前必须核对**三处版本源一致**：
  1. `package.json` 的 `version`
  2. `src-tauri/tauri.conf.json` 的 `version`
  3. `src-tauri/Cargo.toml` 的 `version`（同步更新 `Cargo.lock`）

## CHANGELOG 纪律

- 每个发布版本（含 `-fix.N` 补丁）都必须在 `CHANGELOG.md` 登记条目，写明日期与用户可见变化；不登记的版本不得发布。
- 条目面向用户与集成者描述"行为变化"，不复述内部过程。

## 发布流程

1. `npm run check` 全绿（TypeScript、Vite 构建、Vitest、`cargo check`、`cargo fmt --check`）。
2. 三处版本源一致，`CHANGELOG.md` 已登记。
3. `npm run portable:zip` 生成便携包（`output/HIA-HugeRTE-<version>-windows-x64.zip`）。
4. 发布前检查：ZIP 内容扫描（无多余产物、无凭据）、依赖/许可证/字体审计复核、解压冒烟（启动、新建、打开、保存、拖放、资源管理器"打开方式"路径参数）。
5. 记录 ZIP 的 SHA-256 校验和，打 Git tag，撰写发布说明。

## 兼容性承诺

- 仅支持 UTF-8 编码的 `.htm`/`.html` 文档；不支持 legacy 编码探测与转换。
- 不承诺测试契约之外的 HTML 无损往返；编辑器输出以 HugeRTE 行为与已登记的兼容性契约为准。
- 便携版不写注册表、不静默接管文件关联；该边界的变化属于重大变更，须在 CHANGELOG 与发布说明中显著标注。
