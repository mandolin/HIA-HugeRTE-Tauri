# 贡献指南

感谢参与 HIA HugeRTE Tauri。本文档说明从环境准备到提交合并的约定；协作规则的完整版本见 [AGENTS.md](AGENTS.md)。

## 我想先了解项目

- 项目定位与使用方式：见 [README.md](README.md)
- 应用边界与安全设计：见 [docs/application-boundary.md](docs/application-boundary.md)
- 版本与发布纪律：见 [docs/versioning.md](docs/versioning.md)

## 开发环境

- Windows 10/11 x64；Shell 一律使用 PowerShell 7（`C:\Program Files\PowerShell\7\pwsh.exe`）。
- Node.js 与 Rust 工具链版本以 `package-lock.json` 和 `src-tauri/Cargo.lock` 锁定为准。
- 运行时需要系统 WebView2（Tauri 在 Windows 上的依赖）。

```powershell
npm install
npm run tauri:dev
```

## 提交前必须跑门禁

```powershell
npm run check
```

该命令包含 `tsc --noEmit`、Vite 构建、Vitest 单元测试、`cargo check` 与 `cargo fmt --check`。改动涉及以下范围时，请额外执行对应检查：

| 改动范围 | 额外检查 |
| --- | --- |
| Rust 命令、文件 I/O、授权模型、资源解析 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| 编辑器行为、checklist、输出规范化、字符表 | `npm test` + 用 `fixtures/sample-document.html` 手工验证打开/编辑/保存回读 |
| 用户可见界面或交互 | 在目标窗口尺寸下对主要状态（正常、脏状态、错误、拖放悬停）截图核对 |
| 打包脚本、发行物 | `npm run portable:zip` + 解压冒烟（启动、打开、保存、拖放） |

## 代码约定

- **编码**：文本文件 UTF-8 无 BOM，入库文件保持 CRLF。
- **注释**：新增或结构性修改的模块、公开 API、命令、契约、安全逻辑和非显然算法，须提供中英双语文档化注释（现阶段以 `中文：`、`English:` 段落标识）；注释与实现、测试在同一提交中更新。
- **安全边界**：打开的 HTML 文档视为不可信内容；文件访问只能经由既有的显式 Tauri 命令与授权路径模型，不放宽 capabilities，不新增文件系统/网络插件权限。
- **敏感信息**：不提交凭据、令牌、私有路径或未脱敏个人数据；提交前自查 diff。
- **构建产物**：`dist/`、`output/`、`temp/`、`src-tauri/target/` 不入库。

## 依赖与资产

新增会进入发行物的依赖、图标、字体、二进制或代码片段前，须记录来源、版本、许可证、用途、替代方案与再分发影响，并同步更新 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。默认 UI/编辑器字体只能使用通用回退或已核验的开源字体，不分发专有系统字体。

## 分支与提交

- 分支名建议：`feat/<简述>`、`fix/<简述>`、`docs/<简述>`、`test/<简述>`、`build/<简述>`、`chore/<简述>`。
- 提交信息首行使用 Conventional Commits 前缀（如 `feat:`、`fix(editor):`、`docs:`、`test:`），正文使用中文；一次提交只做一件事，重构与功能变更分开提交。
- 版本号变更须遵循 [docs/versioning.md](docs/versioning.md) 的三处版本源一致性要求，并同步 `CHANGELOG.md`。

## Pull Request

1. 确认 `npm run check` 通过；改动运行期行为时补充上表对应的额外检查。
2. PR 描述写明：改了什么、为什么、怎么验证的；界面或行为变更附验证证据。
3. 引入第三方依赖时按上文说明许可证与分发边界。

## 口径约束（重要）

本项目当前为 alpha 阶段的便携本地 HTML 编辑器：仅支持 UTF-8 的 `.htm`/`.html`，不是浏览器沙箱，不承诺任意文档脚本的安全执行，也不承诺测试契约之外的 HTML 无损往返。在 Issue、PR、文档与对外说明中，请勿使用超出上述范围的表述（如"生产级可用""无损编辑任意 HTML"）。
