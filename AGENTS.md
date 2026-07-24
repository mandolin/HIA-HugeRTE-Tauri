# HIA HugeRTE Tauri — 智能体协作指南

## 环境

- Windows 下的每条 shell 命令都使用 PowerShell 7：`C:\Program Files\PowerShell\7\pwsh.exe`。
- 若运行器并非 PowerShell 7，显式调用 `& "C:\Program Files\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -Command '<command>'`，命令主体保持单引号。
- 修改实现前，阅读本文件、`README.md`、相关公开文档、`work-zone/docs/planning-system.md`、当前任务台账、关联计划/里程碑/ADR，并检查 Git 状态。
- 除非维护者明确授权，不执行 `git add`、`git commit`、发布、签名、注册表修改、安装器注册或破坏性 Git 命令。

## 仓库与内容边界

- 根目录是公开应用仓库，负责 Node/Rust 依赖、构建、测试、发行物和用户文档。
- `work-zone/` 是独立版本化的私有工作区，存放计划、审计、研究、任务状态和 AI 记录；它被根仓库忽略。不得放入凭据、令牌、私钥、浏览器 Cookie、受限参考源码副本或未脱敏个人数据。
- 公开的 `README.md`、`docs/`、示例、源码注释和发行材料不得提及内部周期编号、AI 过程、私有路径、审计底稿或聊天记录。
- 外部参考项目均只读，除非其维护者明确授权修改。可借鉴行为并独立编写代码/测试；未经记录的许可证决定，不复制表达性源码、注释、图标、图片或字体。
- WorkZone 内部文档使用中文；只有公开 API、面向开发者/用户的文档和源码公共契约，才按受众需要提供中英文说明。详见 `work-zone/docs/standards/internal-document-language.md`。

## 计划、任务状态与决策

- 项目缩写为 `hrt`。计划位于 `work-zone/dev/plans/`：`W-hrt-P<n>` 为项目周期，`G-*` 为子项目计划，`T-*` 为专题计划，`S-*` 为行动编排；仅当多个 W 周期需要共同蓝图与收尾时使用 `C-*`。
- 里程碑位于 `work-zone/dev/milestones/`，描述可独立验证的成熟状态，而非任务完成情况。
- 影响持久架构、Tauri 能力策略、文件关联策略、便携分发语义、格式兼容、许可证或安全边界的变更，须先在 `work-zone/docs/adr/` 形成 ADR。
- 长期或跨会话工作须在 `work-zone/dev/tasks/active/` 建立独立台账。每个可验证检查点和暂停/交接前更新；恢复时以 Git、文件和测试事实为准。
- 同一失败命令或方案不得在输入不变时重试超过两次；记录失败，改变输入或方法后再评估。

## 质量、安全与分发

- 将打开的 HTML 视为不可信本地内容。编辑器外壳、文件 I/O 与预览/渲染边界必须显式设计和测试；不要给文档内容授予任意文件系统或网络权限。
- 新增或结构性变更的模块、公开 API、命令、文件契约、配置、安全逻辑和不直观算法，应在同一 JSDoc/TSDoc 块中提供准确中文与英文说明，并以 `中文：`、`English:` 标识，直至采用规范 HIA 提取器。
- 添加会进入发行物的依赖、图标、字体、二进制或代码片段前，在私有审计中记录来源、版本、许可证、用途、替代方案与再分发影响。默认 UI/编辑器字体只能使用通用回退或已核验的开源字体，禁止分发专有系统字体。
- 每项交付相关变更都要运行相称检查并记录命令、结果、限制和下一步。候选发布包必须经过内容扫描、依赖/许可证/字体审计、文件打开/保存/拖放/文件关联人工检查和便携 ZIP 解压冒烟。

## 文档系统采纳

- 在初始化、周期启动、文档/发布准备和收尾时，扫描 `K:\Project\Github_mandolin\HIA-Documentation-Sys\work-zone\notify\`，更新 `work-zone/dev/adoption/documentation-notify-state.md`。
- 采用受支持的 HIA 文档工具链后，优先使用规范 `@lang` 和内联 `<lang>` / `<l>` 标记。不得把源码内容、凭据或私有路径发送给外部文档或 AI 提供方。
