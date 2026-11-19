/**
 * @lang zh-CN
 * 应用壳文案的 i18n 字典与取词机制（W-hrt-P15，决策①~⑥按推荐定案）。
 * 机制：**源语言键**——中文（zh-Hans）即键（缺省语言零字典成本），`en` 字典承载英文
 * 翻译；`t(key)` 按当前语言取词（zh-Hans 原样返回键，en 查字典，缺失回退键）；`tf(key,
 * params)` 在取词结果上做 `{param}` 占位替换。语言持久化在 `hia-hugerte.language`
 * （contract-freeze §5 增量键），设置面板「语言」切换：**壳文案即时重建**（菜单/工具栏/
 * Tab 条/状态栏均为可重渲函数），**编辑器语言包在重启后生效**（`language` 为 init 选项，
 * 设置项注明）。首版语言：zh-Hans（缺省）+ en；追加新语言 = 追加一个翻译字典。
 * @lang en
 * The shell copy's i18n dictionary and lookup (W-hrt-P15, decisions ①-⑥ approved as
 * recommended). Mechanism: **source-language keys** — Simplified Chinese is the key itself
 * (zero dictionary cost for the default language), with an `en` dictionary carrying English
 * translations; `t(key)` resolves by current language (zh-Hans returns the key verbatim, en
 * looks up the dictionary, missing entries fall back to the key); `tf(key, params)` applies
 * `{param}` placeholders to the resolved string. The language persists under
 * `hia-hugerte.language` (contract-freeze §5 additive key); the Settings "Language" switch
 * **rebuilds shell copy immediately** (menubar/toolbar/tab strip/status bar are re-renderable
 * functions) while the **editor language pack applies after a restart** (`language` is an init
 * option, noted in the setting). First languages: zh-Hans (default) + en; adding a language =
 * adding one translation dictionary.
 */

/** @lang zh-CN 支持的界面语言（zh-Hans 为缺省源语言；en 为首个翻译包）。 / @lang en Supported UI languages (zh-Hans is the default source language; en is the first translation pack). */
export type Language = "zh-Hans" | "en";

/** @lang zh-CN 语言持久化键（contract-freeze §5 登记的增量键）。 / @lang en The language persistence key (registered additive key in contract-freeze §5). */
export const LANGUAGE_KEY = "hia-hugerte.language";

/** @lang zh-CN 缺省语言（中文简体）。 / @lang en The default language (Simplified Chinese). */
export const DEFAULT_LANGUAGE: Language = "zh-Hans";

/** @lang zh-CN 英文翻译字典：键 = 中文源串（含 {param} 占位符），值 = 英文。 / @lang en The English translation dictionary: keys are the Chinese source strings (with {param} placeholders), values are English. */
const EN: Record<string, string> = {
  // 启动与骨架
  "无法初始化应用根节点。": "Cannot initialize the application root element.",
  "找不到必要的界面元素：{selector}": "Required UI element not found: {selector}",
  "HugeRTE 未能创建编辑器实例。": "HugeRTE failed to create the editor instance.",
  "主菜单": "Main menu",
  "文档操作": "Document actions",
  "打开的文档": "Open documents",
  "文档侧栏": "Document sidebar",
  "侧栏视图": "Sidebar views",
  "文档大纲": "Document outline",
  "状态栏": "Status bar",
  "未保存草稿": "Unsaved drafts",
  "HTML 文档编辑器": "HTML document editor",
  "HTML 源码编辑区": "HTML source editor",
  // 侧栏（资源视图）
  "资源管理": "Files",
  "刷新目录树": "Refresh the file tree",
  "向上（浏览上一级目录）": "Up (browse the parent directory)",
  "向上": "Up",
  "目录路径": "Directory path",
  "调整资源管理器宽度": "Adjust file-tree width",
  "拖动调整资源管理器宽度（聚焦后可用左右方向键微调）": "Drag to resize the file tree (focus it and use the arrow keys for fine steps)",
  "浏览：可逐级导航（文档内容引用仍限于文档目录作用域）": "Browse: navigate freely (document references remain scoped to the document directory)",
  "点行首按钮展开目录": "Use the button at the start of a row to expand a directory",
  "目录为空或不可读": "Directory is empty or unreadable",
  "（空）": "(empty)",
  "此电脑": "This PC",
  "显示同级文件夹": "Show sibling folders",
  "（无同级文件夹）": "(no sibling folders)",
  "收起目录": "Collapse directory",
  "展开目录": "Expand directory",
  "相对引用：{relativePath} · 约 {size} KB": "Relative reference: {relativePath} · about {size} KB",
  "插入相对引用": "Insert relative reference",
  "资源": "Files",
  // 侧栏（大纲视图）
  "大纲": "Outline",
  "（空标题）": "(empty heading)",
  "文档没有标题（h1–h6），无法生成大纲": "The document has no headings (h1-h6); there is nothing to outline",
  "展开此节": "Expand this section",
  "折叠此节": "Collapse this section",
  // 侧栏（搜索视图）
  "搜索": "Search",
  "在所有打开的文档中查找…": "Search all open documents…",
  "在所有打开的文档中查找": "Search all open documents",
  "输入关键字，在所有打开的文档中查找": "Type a keyword to search all open documents",
  "{hits}+ 行": "{hits}+ lines",
  "{hits} 行": "{hits} lines",
  "已定位第 {line} 行命中（源码行号）": "Jumped to the match on source line {line}",
  "已切换文档；该命中位于标签或属性中，未定位正文": "Switched documents; the match is inside a tag or attribute and was not revealed in the body",
  "仅显示前 {max} 行命中": "Showing only the first {max} matching lines",
  "未找到命中": "No matches found",
  // 菜单栏
  "文件": "File",
  "编辑": "Edit",
  "查看": "View",
  "插入": "Insert",
  "格式": "Format",
  "工具": "Tools",
  "帮助": "Help",
  "新建 Tab": "New tab",
  "打开…": "Open…",
  "保存": "Save",
  "另存为…": "Save as…",
  "最近打开…": "Recent files…",
  "清空历史…": "Clear history…",
  "撤销": "Undo",
  "重做": "Redo",
  "查找与替换…": "Find and replace…",
  "显示/隐藏目录树": "Show/hide file tree",
  "源码并排双栏": "Source side-by-side",
  "源码整区切换": "Source full-area",
  "编辑字号…": "Editor font size…",
  "全屏（编辑器）": "Fullscreen (editor)",
  "图片…": "Image…",
  "链接…": "Link…",
  "表格…": "Table…",
  "特殊字符…": "Special characters…",
  "加粗": "Bold",
  "斜体": "Italic",
  "下划线": "Underline",
  "清除格式": "Clear formatting",
  "源代码": "Source code",
  "同步滚动": "Sync scroll",
  "主题 ": "Theme ",
  "跟随系统": "Follow system",
  "主题已切换": "Theme switched",
  "字体 ": "Font ",
  "系统默认": "System default",
  "HIA 字体栈": "HIA font stack",
  "字体已切换": "Font switched",
  "界面语言已切换": "Interface language switched",
  "编辑器语言切换失败：{error}": "Editor language switch failed: {error}",
  "调整源码栏宽度": "Adjust source-pane width",
  "拖动调整源码栏宽度（聚焦后可用左右方向键微调）": "Drag to resize the source pane (focus it and use the arrow keys for fine steps)",
  "设置…": "Settings…",
  "打开方式注册…": "Open-with registration…",
  "打开 Windows 默认应用设置": "Open Windows default apps settings",
  "打开下载页": "Open the download page",
  "关于 HIA HugeRTE": "About HIA HugeRTE",
  "菜单": "Menu",
  // 工具栏
  "新建": "New",
  "新建文档 (Ctrl+N)": "New document (Ctrl+N)",
  "打开": "Open",
  "打开 HTML 文件 (Ctrl+O)": "Open an HTML file (Ctrl+O)",
  "保存当前文档 (Ctrl+S)": "Save the current document (Ctrl+S)",
  "另存为": "Save as",
  "另存为 HTML 文件": "Save as an HTML file",
  "历史": "History",
  "最近打开的文件": "Recently opened files",
  "目录树": "File tree",
  // 头部摘要与状态栏
  "{total} 个文档 · {dirty} 个未保存": "{total} documents · {dirty} unsaved",
  "1 个文档 · 1 个未保存": "1 document · 1 unsaved",
  "1 个文档": "1 document",
  "● 未保存": "● Unsaved",
  "已保存": "Saved",
  "字符 {chars} · 词 {words}": "Characters {chars} · Words {words}",
  "字符 0 · 词 0": "Characters 0 · Words 0",
  "行 {line} · 列 {column}": "Line {line} · Column {column}",
  "行 1 · 列 1": "Line 1 · Column 1",
  "已修改，尚未保存": "Modified, not saved yet",
  // Tab 条与别名
  "编辑标签页别名": "Edit the tab label",
  "{text}（已固定）": "{text} (pinned)",
  "解除固定": "Unpin",
  "固定标签页": "Pin tab",
  "关闭标签页": "Close tab",
  "▾ 更多标签（{count}）": "▾ More tabs ({count})",
  "未命名文档": "Untitled document",
  // 弃改确认
  "放弃未保存的修改？": "Discard unsaved changes?",
  "取消": "Cancel",
  "放弃修改并继续": "Discard and continue",
  "当前文档 {label} 有尚未保存的修改。继续操作将放弃这些修改，且无法撤销。": "The current document {label} has unsaved changes. Continuing will discard them, and this cannot be undone.",
  "当前文档 未命名文档 有尚未保存的修改（尚未保存到任何文件）。继续操作将放弃这些修改，且无法撤销。若需保留，请先取消并使用「保存」或「另存为」。": "The current document Untitled document has unsaved changes (nothing has been written to disk yet). Continuing will discard them, and this cannot be undone. To keep them, cancel first and use Save or Save as.",
  "清空历史": "Clear history",
  "将删除本机全部历史记录，且无法撤销。确定清空？": "This deletes all local history and cannot be undone. Clear it?",
  // 历史下拉
  "最近打开（本地记录）": "Recent files (local records)",
  "开启记录": "Resume recording",
  "不记录模式": "No-record mode",
  "已开启不记录模式（新打开的文件不再记录）": "No-record mode is on (newly opened files are no longer recorded)",
  "已恢复历史记录": "History recording resumed",
  "（不记录模式已开启）": "(no-record mode is on)",
  "暂无历史记录": "No history yet",
  "记录仅保存在本机（便携目录优先；不可写时 %APPDATA%\\HIA-HugeRTE）": "Records stay on this machine (portable folder first; %APPDATA%\\HIA-HugeRTE when not writable)",
  "已清空历史记录": "History cleared",
  // 设置面板
  "设置": "Settings",
  "打开方式": "Open with",
  "注册后本应用会出现在 Windows「打开方式」列表中。不会设为默认打开程序，也不修改系统的默认应用设置。": "Registering lists this app in the Windows \"Open with\" list. It is never set as the default opener, and the system default-app settings are not modified.",
  "已注册": "Registered",
  "未注册": "Not registered",
  "移除注册": "Remove registration",
  "注册到打开方式列表": "Register into the Open with list",
  "已注册到 Windows「打开方式」列表（未设为默认）。在系统中选择本应用时，Windows 会把文件路径传给本程序。": "Registered into the Windows \"Open with\" list (not set as default). When you pick this app in the system, Windows passes the file path to it.",
  "已注册到「打开方式」列表（可在系统设置中选择）": "Registered into the Open with list (pickable in system settings)",
  "已移除「打开方式」注册": "Open-with registration removed",
  "操作失败：{error}": "Operation failed: {error}",
  "界面与编辑器": "Interface & editor",
  "界面字号 ": "Interface size ",
  "标准": "Standard",
  "较大": "Larger",
  "大": "Large",
  "紧凑": "Compact",
  "编辑字号 ": "Editor size ",
  "菜单栏 ": "Menu bar ",
  "显示": "Full",
  "精简": "Compact",
  "隐藏": "Hidden",
  "语言 ": "Language ",
  // 中文：语言名通常按自身语言书写，但英文界面下应给非中文用户一个可读名称——译为 "Chinese"。
  //       2026-11-19 修复：原值为自身映射，英文界面下语言下拉仍显示"中文"（与主题下拉同类缺陷）。
  // English: Language names are conventionally written in their own language, but an English
  //       interface should still offer a readable name to non-Chinese users — "Chinese" here.
  //       2026-11-19 fix: the value was a self-map, so the language dropdown kept showing "中文" in
  //       the English interface (same class of defect as the theme dropdown).
  "中文": "Chinese",
  "English": "English",
  "数据与恢复": "Data & recovery",
  " 会话恢复（重启后恢复上次的标签页）": " Session restore (reopen last tabs after a restart)",
  " 自动保存草稿（崩溃后恢复未保存内容）": " Autosave drafts (recover unsaved content after a crash)",
  "会话与草稿仅保存在本机（便携目录 data/ 优先；不可写时 %APPDATA%\\HIA-HugeRTE），不上传、不联网。": "Sessions and drafts stay on this machine (portable data/ folder first; %APPDATA%\\HIA-HugeRTE when not writable) — never uploaded, never online.",
  "版本": "Version",
  "本程序不联网检查更新、不会自动下载或替换自身；有新版本时请前往下载页手动替换。": "This program never checks for updates online, downloads or replaces itself; for new versions, visit the download page manually.",
  "当前版本 —": "Current version —",
  "读取中…": "Reading…",
  "状态未知": "State unknown",
  "无法读取当前注册状态。": "Cannot read the current registration state.",
  "当前版本 {version}": "Current version {version}",
  "当前版本未知": "Current version unknown",
  // 关于窗口
  "版本 {version}": "Version {version}",
  "基于 HugeRTE 与 Tauri 的 Windows 便携 HTML 编辑器": "A Windows portable HTML editor built on HugeRTE and Tauri",
  "MIT 许可证；第三方组件与图标许可见 THIRD_PARTY_NOTICES": "MIT licence; see THIRD_PARTY_NOTICES for third-party and icon licences",
  "本地编辑：不联网检查更新，不上传文档内容": "Local editing: no online update checks, no document uploads",
  "关闭": "Close",
  // 打开方式注册与系统跳转（状态消息）
  "已在系统「默认应用」设置中选择本程序": "This app is now selectable in the system Default apps settings",
  "打开系统设置失败：{error}": "Failed to open system settings: {error}",
  "已在浏览器中打开下载页": "The download page opened in your browser",
  "打开下载页失败：{error}": "Failed to open the download page: {error}",
  // 状态消息（编辑/保存/打开/关闭）
  "已打开": "Opened",
  "打开失败：{error}": "Failed to open: {error}",
  "无法打开文件：{error}": "Cannot open the file: {error}",
  "已新建文档": "New document created",
  "已切换标签页": "Tab switched",
  "已关闭标签页": "Tab closed",
  "标签页已达上限（{max}），请先关闭部分标签页。": "Tab limit reached ({max}); close some tabs first.",
  "标签页已达上限（{max}），部分草稿未恢复。": "Tab limit reached ({max}); some drafts were not restored.",
  "保存失败：{error}": "Failed to save: {error}",
  "发生未知错误。": "An unknown error occurred.",
  // 资源树/预览
  // 大纲/搜索跳转状态
  // 会话恢复状态
  "已恢复 {restored} 个文档；{skipped} 个已失效被跳过": "Restored {restored} documents; {skipped} no longer available and skipped",
  "已恢复 {restored} 个文档": "Restored {restored} documents",
  "已打开 {opened} 个传入文件；{skipped} 个因标签页上限被跳过": "Opened {opened} passed-in files; {skipped} skipped due to the tab limit",
  "已通过系统文件入口打开 {count} 个文件": "Opened {count} files via the system file entry",
  "已通过系统文件入口打开": "Opened via the system file entry",
  "启动文件打开失败：{error}": "Failed to open startup files: {error}",
  "浏览器兼容性验证模式": "Browser compatibility verification mode",
  "编辑器初始化失败：{error}": "Editor initialization failed: {error}",
  // 草稿
  "检测到 {count} 份上次会话的未保存草稿（{list}）": "{count} unsaved draft(s) from the last session detected ({list})",
  "恢复为 Tab": "Restore as tabs",
  "全部丢弃": "Discard all",
  "已恢复未保存草稿": "Unsaved drafts restored",
  "将丢弃 {count} 份上次会话的未保存草稿，且无法撤销。确定丢弃？": "This discards {count} unsaved draft(s) from the last session and cannot be undone. Discard them?",
  "已丢弃未保存草稿": "Unsaved drafts discarded",
  "{untitled} 份未命名文档": "{untitled} untitled document(s)",
  " 等": " and more",
  // 拖放
  "释放以打开 HTML 文件": "Drop to open the HTML file"
};

/** @lang zh-CN 当前界面语言（模块级缓存；切换经 setLanguage 写入并持久化）。 / @lang en The current UI language (module-level cache; switching goes through setLanguage, which persists). */
let currentLanguage: Language = (() => {
  // 中文：localStorage 仅存在于浏览器/WebView 环境——单测（Node）等非浏览器环境回落缺省语言。
  // English: localStorage only exists in browser/WebView contexts — non-browser environments
  //          (Node unit tests) fall back to the default language.
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return stored === "en" ? "en" : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
})();

/** @lang zh-CN 读取当前界面语言。 / @lang en Read the current UI language. */
export function getLanguage(): Language {
  return currentLanguage;
}

/**
 * @lang zh-CN
 * 切换界面语言并持久化（设置面板入口）。返回 true 表示发生了变化（false = 与当前一致）。
 * @lang en
 * Switch the UI language and persist it (Settings-panel entry). Returns true when the language
 * actually changed (false = same as current).
 */
export function setLanguage(language: Language): boolean {
  if (language === currentLanguage) return false;
  currentLanguage = language;
  // 中文：持久化同样做环境守卫（单测环境下切换仍生效于当前会话，只是不落盘）。
  // English: The persistence is guarded too (in unit tests a switch still affects the current
  //          session; it just does not persist).
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // 非浏览器环境：跳过持久化 / Non-browser environment: skip persistence.
  }
  return true;
}

/**
 * @lang zh-CN
 * 取词：zh-Hans（源语言）原样返回键；en 查字典，缺失回退键（保证永不返回 undefined）。
 * @lang en
 * Resolve a string: zh-Hans (the source language) returns the key verbatim; en looks up the
 * dictionary, falling back to the key when missing (never returns undefined).
 */
export function t(key: string): string {
  if (currentLanguage === "zh-Hans") return key;
  return EN[key] ?? key;
}

/**
 * @lang zh-CN
 * 带参数取词：先取词再做 `{param}` 占位替换（params 值转字符串）。
 * @lang en
 * Parameterized lookup: resolve the string, then substitute `{param}` placeholders (param
 * values are stringified).
 */
export function tf(key: string, params?: Record<string, string | number>): string {
  let text = t(key);
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

/** @lang zh-CN 英文字典只读暴露（契约/一致性测试断言键覆盖用）。 / @lang en Read-only exposure of the English dictionary (used by contract/consistency tests asserting key coverage). */
export function enDictionary(): Readonly<Record<string, string>> {
  return EN;
}
