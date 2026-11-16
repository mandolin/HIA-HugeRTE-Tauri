import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import hugerte, { type Editor } from "hugerte";
import "hugerte/icons/default";
import "hugerte/models/dom";
import "hugerte/plugins/advlist";
import "hugerte/plugins/autolink";
import "hugerte/plugins/charmap";
import "hugerte/plugins/code";
import "hugerte/plugins/fullscreen";
import "hugerte/plugins/image";
import "hugerte/plugins/link";
import "hugerte/plugins/lists";
import "hugerte/plugins/media";
import "hugerte/plugins/searchreplace";
import "hugerte/plugins/wordcount";
import "hugerte/plugins/table";
import "hugerte/themes/silver";
import "hugerte/skins/content/default/content";
import "hugerte/skins/ui/oxide/skin";
import { buildDiscardConfirmMessage, createNewDocument, documentFromPayload, ensureHtmlExtension, getDocumentLabel, splitDocumentParts, type DocumentPayload, type DocumentState } from "./document";
import { appendDocumentTab, createUntitledTab, closeTab, MAX_TABS, overflowStartIndex, summarizeTabs, type TabState } from "./tabs";
import {
  buildDefaultCharacterMap,
  HUGERTE_COMPATIBILITY_CONTENT_STYLE,
  HUGERTE_FONT_FAMILY_FORMATS,
  HUGERTE_FONT_SIZE_FORMATS,
  HUGERTE_COMPATIBILITY_PLUGINS,
  HUGERTE_COMPATIBILITY_TOOLBAR
} from "./editor/hugerte-compatibility-config";
import { registerCompatibilityChecklistPlugin } from "./editor/hugerte-compatibility";
import { createIcon, type IconName } from "./ui/icons";
import { scanContentLineHits } from "./ui/sidebar-search";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("无法初始化应用根节点。");

app.innerHTML = `
  <main class="application-shell">
    <!-- 中文：Banner（方案二定案，2026-11-16）——品牌 + 文档摘要，中央为未来模块预留位（综合搜索/命令框等），
         右上仅设置齿轮。 @lang en Banner (option B, decided 2026-11-16) — brand + document summary;
         the centre is reserved for future modules (combined search / command box); only the Settings gear on the right. -->
    <header class="app-header">
      <div class="app-brand"><span class="app-brand__mark" aria-hidden="true">H</span><div><h1>HIA HugeRTE</h1><p id="document-path">未命名文档</p></div></div>
      <div id="banner-reserved" class="app-banner__reserved" aria-hidden="true"></div>
      <button id="settings-button" type="button" class="app-header__gear" title="设置" aria-label="设置"></button>
    </header>
    <nav id="menubar" class="menubar" role="menubar" aria-label="主菜单"></nav>
    <div id="toolbar" class="app-toolbar" role="toolbar" aria-label="文档操作">
      <div id="toolbar-buttons" class="app-toolbar__buttons"></div>
      <span id="document-status" class="app-toolbar__status" role="status">准备就绪</span>
    </div>
    <div id="tabbar" class="tabbar" role="tablist" aria-label="打开的文档"></div>
    <section class="editor-container">
      <div id="workbench" class="workbench">
        <aside id="explorer" class="explorer" aria-label="文档侧栏" hidden>
          <!-- 中文：侧栏三态入口条（W-hrt-P14 F2，方案 B 定案：图标 + 文字）。按钮由 renderSidebarModeStrip()
               用 Tabler 图标构建；文字按可用宽度省略、图标恒可见（定案规则）。 -->
          <!-- English: The sidebar three-mode entry strip (W-hrt-P14 F2, decided option B: icon + text).
               Buttons are built by renderSidebarModeStrip() with Tabler icons; text ellipsizes by
               available width while icons stay visible (the decided rules). -->
          <div id="explorer-modes" class="explorer__modes" role="tablist" aria-label="侧栏视图"></div>
          <div class="explorer__panes">
            <div id="explorer-pane-files" class="explorer__pane" data-pane="files">
              <div class="explorer__head"><span>资源管理 <span id="explorer-scope" class="explorer__scope"></span></span><button id="explorer-refresh" type="button" title="刷新目录树" class="explorer__refresh">⟳</button></div>
              <div class="explorer__breadcrumb-row">
                <button id="explorer-up" type="button" title="向上（浏览上一级目录）" class="explorer__up" aria-label="向上">↑</button>
                <nav id="explorer-breadcrumb" class="explorer__breadcrumb" aria-label="目录路径"></nav>
              </div>
              <div id="explorer-tree" class="tree" role="tree"></div>
              <div id="explorer-preview" class="explorer__preview" hidden></div>
            </div>
            <div id="explorer-pane-outline" class="explorer__pane explorer__pane--stack" data-pane="outline" hidden>
              <div id="explorer-outline" class="outline" role="tree" aria-label="文档大纲"></div>
            </div>
            <div id="explorer-pane-search" class="explorer__pane explorer__pane--stack" data-pane="search" hidden>
              <div class="explorer__search-bar">
                <input id="explorer-search-input" class="explorer__search-input" type="search" placeholder="在所有打开的文档中查找…" aria-label="在所有打开的文档中查找" />
              </div>
              <div id="explorer-search-results" class="explorer__search-results"></div>
            </div>
          </div>
        </aside>
        <div id="explorer-resizer" class="explorer__resizer" role="separator" aria-orientation="vertical" aria-label="调整资源管理器宽度" title="拖动调整资源管理器宽度（聚焦后可用左右方向键微调）" tabindex="0" hidden></div>
        <div id="editor-pane" class="editor-pane"><textarea id="hugerte-editor" aria-label="HTML 文档编辑器"></textarea></div>
        <!-- 中文：源码视图（W-hrt-P14 F1，评审 #4/#5 定案）：并排双栏（右置源码栏 + 可拖分隔条 +
             同步滚动设置项）与整区切换共用同一面板——整区时编辑窗格隐藏、源码栏吃满剩余宽度；
             第三形态（模态对话框）沿用 HugeRTE code 插件，不在此结构内。 -->
        <!-- English: The source view (W-hrt-P14 F1, decided by review items #4/#5): the side-by-side
             form (source pane on the right + draggable separator + sync-scroll setting) and the
             full-area switch share this pane — in full mode the editor pane hides and the source
             pane fills the row; the third form (modal dialog) stays HugeRTE's code plugin. -->
        <div id="source-resizer" class="source-resizer" role="separator" aria-orientation="vertical" aria-label="调整源码栏宽度" title="拖动调整源码栏宽度（聚焦后可用左右方向键微调）" tabindex="0" hidden></div>
        <div id="source-pane" class="source-pane" aria-label="源码视图" hidden>
          <div class="source-pane__head">
            <span class="source-pane__title">源代码</span>
            <label id="source-sync-label" class="source-pane__sync" for="source-sync-scroll"><input id="source-sync-scroll" type="checkbox" /> 同步滚动</label>
          </div>
          <textarea id="source-editor" class="source-editor" spellcheck="false" aria-label="HTML 源码编辑区"></textarea>
        </div>
      </div>
      <div id="drop-indicator" class="drop-indicator" aria-hidden="true">释放以打开 HTML 文件</div>
    </section>
    <!-- 中文：应用级状态栏（W-hrt-P14 F4，原型稿 1）：保存状态 / 字符·词数 / 行列 / 编码格式。
         取代 HugeRTE 内置状态栏（statusbar:false）——整合后一行承载全部持久指示；
         瞬时操作消息仍在工具栏右端（#document-status）。 -->
    <!-- English: The application status bar (W-hrt-P14 F4, prototype draft 1): save state /
         character-word count / cursor line-column / encoding. It replaces HugeRTE's built-in
         status bar (statusbar:false) so one row carries all persistent indicators; transient
         operation messages stay at the toolbar's right end (#document-status). -->
    <footer id="statusbar" class="statusbar" role="status" aria-label="状态栏">
      <span id="status-save" class="statusbar__item">已保存</span>
      <span id="status-count" class="statusbar__item">字符 0 · 词 0</span>
      <span id="status-cursor" class="statusbar__item">行 1 · 列 1</span>
      <span class="statusbar__item statusbar__item--end">UTF-8</span>
    </footer>
    <div id="confirm-scrim" class="confirm-scrim" role="presentation">
      <div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">放弃未保存的修改？</h2>
        <p id="confirm-message"></p>
        <div class="confirm-actions">
          <button id="confirm-cancel" type="button" class="btn-ghost">取消</button>
          <button id="confirm-discard" type="button" class="btn-danger">放弃修改并继续</button>
        </div>
      </div>
    </div>
  </main>
`;

const documentPath = requiredElement<HTMLParagraphElement>("#document-path");
const documentStatus = requiredElement<HTMLSpanElement>("#document-status");
const editorTarget = requiredElement<HTMLTextAreaElement>("#hugerte-editor");
const dropIndicator = requiredElement<HTMLDivElement>("#drop-indicator");
const toolbarButtons = requiredElement<HTMLDivElement>("#toolbar-buttons");
/** @lang zh-CN 编辑字号选择器——位于设置面板「编辑器外观」区（`W-hrt-P12` 后独立选项行取消，尺寸移入设置）。 / @lang en Editor font-size selector — lives in the settings panel's editor-appearance section (the standalone options row was removed in `W-hrt-P12`, its controls moved into Settings). */
let fontSize: HTMLSelectElement;
const tabbar = requiredElement<HTMLDivElement>("#tabbar");
/** @lang zh-CN 应用级状态栏三块动态指示（保存状态/字符词数/行列；编码为静态文本）。 / @lang en The application status bar's three dynamic indicators (save state / character-word count / cursor; encoding is static). */
const statusbarSave = requiredElement<HTMLSpanElement>("#status-save");
const statusbarCount = requiredElement<HTMLSpanElement>("#status-count");
const statusbarCursor = requiredElement<HTMLSpanElement>("#status-cursor");
const explorerPanel = requiredElement<HTMLElement>("#explorer");
const explorerTree = requiredElement<HTMLDivElement>("#explorer-tree");
const explorerScope = requiredElement<HTMLSpanElement>("#explorer-scope");
const explorerPreview = requiredElement<HTMLDivElement>("#explorer-preview");
const explorerBreadcrumb = requiredElement<HTMLElement>("#explorer-breadcrumb");
const explorerUpButton = requiredElement<HTMLButtonElement>("#explorer-up");
const explorerResizer = requiredElement<HTMLDivElement>("#explorer-resizer");
/** @lang zh-CN 侧栏三态的容器与面板引用（模式条 + 三个视图面板 + 大纲/搜索控件）。 / @lang en References for the sidebar's three modes (mode strip, the three view panes, outline/search controls). */
const explorerModes = requiredElement<HTMLElement>("#explorer-modes");
const explorerPaneFiles = requiredElement<HTMLElement>("#explorer-pane-files");
const explorerPaneOutline = requiredElement<HTMLElement>("#explorer-pane-outline");
const explorerPaneSearch = requiredElement<HTMLElement>("#explorer-pane-search");
const explorerOutline = requiredElement<HTMLDivElement>("#explorer-outline");
const explorerSearchInput = requiredElement<HTMLInputElement>("#explorer-search-input");
const explorerSearchResults = requiredElement<HTMLDivElement>("#explorer-search-results");
/** @lang zh-CN 源码视图三形态的容器与控件引用（分隔条 / 源码面板 / 源码编辑区 / 同步滚动开关；编辑窗格的整区隐藏由 CSS `data-source-view` 承担，无需 JS 引用）。 / @lang en References for the source view's three forms (separator / source pane / source textarea / sync-scroll toggle; the editor pane's full-mode hiding is handled by the CSS `data-source-view`, no JS reference needed). */
const sourceResizer = requiredElement<HTMLDivElement>("#source-resizer");
const sourcePane = requiredElement<HTMLElement>("#source-pane");
const sourceTextarea = requiredElement<HTMLTextAreaElement>("#source-editor");
const sourceSyncCheckbox = requiredElement<HTMLInputElement>("#source-sync-scroll");
const sourceSyncLabel = requiredElement<HTMLLabelElement>("#source-sync-label");
const settingsButton = requiredElement<HTMLButtonElement>("#settings-button");
const menubarElement = requiredElement<HTMLElement>("#menubar");
const toolbarElement = requiredElement<HTMLElement>("#toolbar");
const workbench = requiredElement<HTMLElement>("#workbench");
const confirmScrim = requiredElement<HTMLDivElement>("#confirm-scrim");
const confirmMessage = requiredElement<HTMLParagraphElement>("#confirm-message");
const confirmCancelButton = requiredElement<HTMLButtonElement>("#confirm-cancel");
const confirmDiscardButton = requiredElement<HTMLButtonElement>("#confirm-discard");
let editor: Editor | null = null;
let tabs: TabState[] = [createUntitledTab()];
let activeIndex = 0;
let isReplacingContent = false;

/** @lang zh-CN 当前活动标签页的文档状态（只读视图；变更走 replaceActiveDocument 等。） / @lang en The active tab's document state (read-only view; mutations go through replaceActiveDocument etc.). */
function state(): DocumentState { return tabs[activeIndex].document; }

function replaceActiveDocument(next: DocumentState): void {
  tabs = tabs.map((tab, index) => (index === activeIndex ? { ...tab, document: next } : tab));
}

interface SaveResult { path: string; }

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`找不到必要的界面元素：${selector}`);
  return element;
}

function setStatus(message: string): void { documentStatus.textContent = message; }

/** @lang zh-CN 界面字号缩放比例的持久化键（`W-hrt-P12`；仅影响外壳，不影响编辑器正文）。 / @lang en Persistence key for the interface font scale (`W-hrt-P12`; shell only, never the editor body). */
const UI_FONT_SCALE_KEY = "hia-hugerte.ui-font-scale";

/**
 * @lang zh-CN
 * 应用界面字号缩放：写根元素内联变量 `--app-ui-font-scale`，外壳各处尺寸由 em 派生故整体缩放；
 * 编辑器正文（HugeRTE iframe）不受影响——它由「编辑字号」单独控制（维护者 2026-11-16 澄清）。
 * 非法值回落到标准比例（1）。
 * @lang en
 * Apply the interface font scale: writes the root element's inline `--app-ui-font-scale`; shell sizes
 * derive from em so the whole chrome scales. The editor body (HugeRTE iframe) is unaffected — it is
 * controlled separately by "editor font size" (maintainer clarification 2026-11-16). Invalid values
 * fall back to the standard scale (1).
 */
function applyUiFontScale(scale: string): void {
  const numeric = Number(scale);
  const safeScale = Number.isFinite(numeric) && numeric >= 0.75 && numeric <= 1.5 ? numeric : 1;
  document.documentElement.style.setProperty("--app-ui-font-scale", String(safeScale));
  localStorage.setItem(UI_FONT_SCALE_KEY, String(safeScale));
}

/**
 * @lang zh-CN
 * 「关于」窗口（维护者 2026-11-16 要求：与多数 Windows 程序一致，弹出小窗展示）。内容：程序名、
 * 版本、技术底座与许可、隐私边界一句话。复用确认模态的遮罩/卡片视觉语言，独立 DOM 不与确认流程
 * 互斥；Esc / 「关闭」/ 点击遮罩关闭，焦点回到触发元素。
 * @lang en
 * The About window (maintainer request 2026-11-16: a small dialog like most Windows programs). Shows
 * the product name, version, technical base and licence, plus a one-line privacy boundary. Reuses the
 * confirm modal's scrim/card visual language but has its own DOM so it never conflicts with the
 * confirm flow; closes on Esc / "Close" / scrim click, restoring focus to the trigger.
 */
async function showAboutDialog(): Promise<void> {
  /** @lang zh-CN 版本号来自 Rust 编译期常量（零网络）；取不到时显示占位。 / @lang en The version comes from Rust's compile-time constant (zero network); a placeholder shows if unavailable. */
  let version = "—";
  try {
    const info = await invoke<AppVersionInfoPayload>("app_version_info");
    version = info.version;
  } catch {
    version = "—";
  }
  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const scrim = document.createElement("div");
  scrim.className = "confirm-scrim confirm-scrim--active about-scrim";
  scrim.setAttribute("role", "presentation");
  const card = document.createElement("div");
  card.className = "confirm-card about-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "about-title");
  const title = document.createElement("h2");
  title.id = "about-title";
  title.textContent = "HIA HugeRTE";
  const lines = document.createElement("div");
  lines.className = "about-card__lines";
  for (const line of [
    `版本 ${version}`,
    "基于 HugeRTE 与 Tauri 的 Windows 便携 HTML 编辑器",
    "MIT 许可证；第三方组件与图标许可见 THIRD_PARTY_NOTICES",
    "本地编辑：不联网检查更新，不上传文档内容"
  ]) {
    const row = document.createElement("p");
    row.textContent = line;
    lines.appendChild(row);
  }
  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-primary";
  close.textContent = "关闭";
  actions.appendChild(close);
  card.append(title, lines, actions);
  scrim.appendChild(card);
  document.body.appendChild(scrim);
  /** @lang zh-CN 关闭并恢复焦点（唯一出口，避免监听器残留）。 / @lang en Close and restore focus (single exit, no listener leaks). */
  const dismiss = (): void => {
    scrim.remove();
    window.removeEventListener("keydown", onKeyDown, true);
    previousActive?.focus();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
  };
  close.addEventListener("click", dismiss);
  scrim.addEventListener("mousedown", (event) => { if (event.target === scrim) dismiss(); });
  window.addEventListener("keydown", onKeyDown, true);
  close.focus();
}

/** @lang zh-CN 应用级菜单项定义：点击动作或分隔线（原型稿 2「文件」菜单定案，其余菜单为提案）。 / @lang en Application menu item: a click action or a separator (the File menu is decided per prototype draft 2; the others are proposals). */
interface AppMenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  /** 中文：true 时该项在菜单中渲染为分隔线（label/action 忽略）。 / English: When true the entry renders as a separator (label/action ignored). */
  separator?: boolean;
}

/** @lang zh-CN 应用级菜单定义（标签 + 菜单项）。 / @lang en Application menu definition (label + items). */
interface AppMenu { label: string; items: () => AppMenuItem[]; }

/** @lang zh-CN 统一的菜单下拉关闭：走面板自带的关闭器（摘监听 + 移除节点），无面板时为空操作。 / @lang en Unified dropdown close: delegates to the panel's own closer (detaches listeners and removes the node); a no-op when no panel is open. */
function closeAppMenu(): void {
  const openPanel = document.querySelector<HTMLElement & { __close?: () => void }>(".app-menu[data-owner]");
  if (!openPanel) return;
  if (openPanel.__close) openPanel.__close();
  else openPanel.remove();
}

/**
 * @lang zh-CN
 * 应用级菜单栏（经典 Windows 外壳，2026-11-16 定案方案二）：文件/编辑/查看/插入/格式/工具/帮助。
 * 菜单内容——「文件」按定案稿实现（新建 Tab/打开/保存/另存为/清空历史 + 快捷键）；其余菜单在
 * 本次实现中给出**保守提案**（仅收录已有能力，不凭空发明功能），待维护者逐项确认后调整。
 * 交互：点击展开、点击外部或 Esc 关闭、点击项即执行并关闭；键盘可达（Tab 聚焦各菜单按钮，Enter 展开）。
 * @lang en
 * Application menu bar (classic Windows shell, option B decided 2026-11-16): File / Edit / View /
 * Insert / Format / Tools / Help. The File menu follows the decided draft (new tab / open / save /
 * save-as / clear history + shortcuts); the other menus contain **conservative proposals** in this
 * pass (only existing capabilities — nothing invented) pending item-by-item confirmation. Behaviour:
 * click to open, outside click or Esc closes, activating an item runs it and closes; keyboard
 * reachable (Tab moves across the menu buttons, Enter opens).
 */
/**
 * @lang zh-CN
 * 菜单栏三态模式（W-hrt-P14 F3，原型稿 5 + 评审 #5 定案「精简可行」）：`full` = 七菜单常显
 * （默认），`compact` = 折叠为「☰ 菜单」单入口（分组下拉），`hidden` = 整行隐藏。
 * 隐藏行以 0 高占位保持外壳栅格行数对齐（2026-11-16 行数错配教训——display:none 会让后续
 * 子元素前移、弹性行落错）。模式持久化到 localStorage。
 * @lang en
 * Menubar modes (W-hrt-P14 F3, prototype draft 5 + review #5 "compact is feasible"): `full` =
 * the seven menus always visible (default), `compact` = folded into a single "☰ Menu" entry
 * (grouped dropdown), `hidden` = the row hidden. The hidden row keeps a zero-height placeholder
 * for shell grid row alignment (the 2026-11-16 row-misalignment lesson — display:none would shift
 * subsequent children and misplace the flexible row). The mode persists to localStorage.
 */
type MenubarMode = "full" | "compact" | "hidden";

/** @lang zh-CN 菜单栏模式持久化键。 / @lang en Persistence key for the menubar mode. */
const MENUBAR_MODE_KEY = "hia-hugerte.menubar-mode";

/** @lang zh-CN 当前菜单栏模式（持久化；非法值回落 full）。 / @lang en The current menubar mode (persisted; invalid values fall back to full). */
let menubarMode: MenubarMode = (() => {
  const stored = localStorage.getItem(MENUBAR_MODE_KEY);
  return stored === "compact" || stored === "hidden" || stored === "full" ? stored : "full";
})();

/** @lang zh-CN 用户切换菜单栏模式（设置面板入口）：持久化并重渲，先关闭可能开着的外点关闭器。 / @lang en Switch the menubar mode by user action (settings-panel entry): persist and re-render, closing any open dropdown closer first. */
function setMenubarMode(mode: MenubarMode): void {
  if (mode === menubarMode) return;
  menubarMode = mode;
  localStorage.setItem(MENUBAR_MODE_KEY, mode);
  closeAppMenu();
  renderAppMenubar();
}

/**
 * @lang zh-CN
 * 应用级菜单定义（文件按定案稿，其余为保守提案；「编辑/插入/格式」为空提案占位——对应能力
 * 由编辑器内工具栏/HugeRTE 菜单承担）。独立函数供完整态按钮与精简态下拉共用（W-hrt-P14 F3）。
 * @lang en
 * Application menu definitions (File per the decided draft; the others are conservative proposals;
 * "Edit/Insert/Format" are empty proposal placeholders — those capabilities live in the in-editor
 * toolbar / HugeRTE menus). A standalone function shared by the full-mode buttons and the
 * compact-mode dropdown (W-hrt-P14 F3).
 */
function buildAppMenus(): AppMenu[] {
  return [
    {
      label: "文件",
      items: () => [
        { label: "新建 Tab", shortcut: "Ctrl+N", action: () => void createDocument() },
        { label: "打开…", shortcut: "Ctrl+O", action: () => void openWithDialog() },
        { label: "保存", shortcut: "Ctrl+S", action: () => void saveDocument(false) },
        { label: "另存为…", action: () => void saveDocument(true) },
        { separator: true, label: "", action: () => undefined },
        { label: "最近打开…", action: () => void toggleHistoryMenu() },
        { label: "清空历史…", action: () => void clearHistoryFromMenu() }
      ]
    },
    {
      label: "编辑",
      items: () => [
        { label: "撤销", shortcut: "Ctrl+Z", action: () => execEditorCommand("Undo") },
        { label: "重做", shortcut: "Ctrl+Y", action: () => execEditorCommand("Redo") },
        { separator: true, label: "", action: () => undefined },
        { label: "查找与替换…", shortcut: "Ctrl+F", action: () => execEditorCommand("SearchReplace") }
      ]
    },
    {
      label: "查看",
      items: () => [
        { label: "显示/隐藏目录树", action: () => toggleExplorerFromMenu() },
        // 中文：源码视图入口（W-hrt-P14 F1）——当前形态加 ✓ 前缀；再次点击同形态即退回模态（可视化）。
        //       第三形态（源代码对话框）保留在「格式 → 源代码」。
        // English: Source view entries (W-hrt-P14 F1) — the active form carries a ✓ prefix; clicking
        //          the active form again returns to the modal (visual) form. The third form (source
        //          dialog) remains under "Format → Source code".
        { label: sourceViewMode === "split" ? "✓ 源码并排双栏" : "源码并排双栏", action: () => void setSourceViewMode(sourceViewMode === "split" ? "modal" : "split") },
        { label: sourceViewMode === "full" ? "✓ 源码整区切换" : "源码整区切换", action: () => void setSourceViewMode(sourceViewMode === "full" ? "modal" : "full") },
        { separator: true, label: "", action: () => undefined },
        { label: "编辑字号…", action: () => void toggleSettingsPanel() },
        { separator: true, label: "", action: () => undefined },
        { label: "全屏（编辑器）", action: () => execEditorCommand("mceFullScreen") }
      ]
    },
    {
      label: "插入",
      items: () => [
        { label: "图片…", action: () => execEditorCommand("mceImage") },
        { label: "链接…", action: () => execEditorCommand("mceLink") },
        { label: "表格…", action: () => execEditorCommand("mceInsertTable") },
        { label: "特殊字符…", action: () => execEditorCommand("mceShowCharmap") }
      ]
    },
    {
      label: "格式",
      items: () => [
        { label: "加粗", action: () => execEditorCommand("Bold") },
        { label: "斜体", action: () => execEditorCommand("Italic") },
        { label: "下划线", action: () => execEditorCommand("Underline") },
        { separator: true, label: "", action: () => undefined },
        { label: "清除格式", action: () => execEditorCommand("RemoveFormat") },
        { label: "源代码", action: () => execEditorCommand("mceCodeEditor") }
      ]
    },
    {
      label: "工具",
      items: () => [
        { label: "设置…", action: () => void toggleSettingsPanel() },
        { label: "打开方式注册…", action: () => void toggleSettingsPanel() },
        { separator: true, label: "", action: () => undefined },
        { label: "打开 Windows 默认应用设置", action: () => void openDefaultAppsSettingsFromMenu() }
      ]
    },
    {
      label: "帮助",
      items: () => [
        { label: "打开下载页", action: () => void openReleasesPageFromMenu() },
        { label: "关于 HIA HugeRTE", action: () => void showAboutDialog() }
      ]
    }
  ];
}

/**
 * @lang zh-CN
 * 渲染菜单栏（W-hrt-P14 F3 三态）：`full` 渲染七个菜单按钮（点击展开/悬停切换/再次点击收起，
 * 行为同既有）；`compact` 渲染单个「☰ 菜单」按钮（点击弹出分组下拉）；`hidden` 清空内容并
 * 由 CSS 保留 0 高占位（栅格对齐，见 MenubarMode 说明）。
 * @lang en
 * Render the menubar (W-hrt-P14 F3, three modes): `full` renders the seven menu buttons (click to
 * open / hover to switch / click again to collapse, unchanged); `compact` renders a single
 * "☰ Menu" button (click opens a grouped dropdown); `hidden` empties the row while CSS keeps the
 * zero-height placeholder (grid alignment, see the MenubarMode notes).
 */
function renderAppMenubar(): void {
  closeAppMenu();
  menubarElement.textContent = "";
  menubarElement.dataset.mode = menubarMode;
  if (menubarMode === "hidden") return;
  if (menubarMode === "compact") {
    renderCompactMenubar();
    return;
  }
  for (const menu of buildAppMenus()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menubar__item";
    button.setAttribute("role", "menuitem");
    button.textContent = menu.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      // 中文：再次点击同一菜单即收起（与 Windows 菜单行为一致）。
      // English: Clicking the same menu again collapses it (matching Windows behaviour).
      const openOwner = document.querySelector(".app-menu[data-owner]");
      if (openOwner?.getAttribute("data-owner") === menu.label) { closeAppMenu(); return; }
      closeAppMenu();
      openAppMenu(menu, button);
    });
    // 中文：悬停切换（维护者 2026-11-16 反馈，经典 Windows 菜单行为）——**已有菜单展开时**，
    //       鼠标移到相邻菜单上即自动切换到该菜单的下拉；菜单未展开时悬停不做任何事（不抢焦点、
    //       不误开菜单）。用 `mouseenter` 而非 `mouseover`：每个菜单按钮只触发一次，避免子元素冒泡抖动。
    // English: Hover switching (maintainer feedback 2026-11-16; classic Windows menu behaviour) —
    //       **while a menu is already open**, moving the pointer onto an adjacent menu switches to that
    //       menu's dropdown automatically; with nothing open, hovering does nothing (no focus steal, no
    //       accidental opening). `mouseenter` (not `mouseover`) fires once per button, avoiding jitter
    //       from child-element bubbling.
    button.addEventListener("mouseenter", () => {
      const openOwner = document.querySelector<HTMLElement>(".app-menu[data-owner]");
      if (!openOwner || openOwner.getAttribute("data-owner") === menu.label) return;
      // 中文：关闭旧下拉、打开新下拉，并把焦点留在菜单栏（便于继续用键盘）。
      // English: Close the old dropdown, open the new one, and keep focus on the menu bar (so keyboard
      //          navigation can continue).
      closeAppMenu();
      openAppMenu(menu, button, { focusFirstItem: false });
    });
    menubarElement.appendChild(button);
  }
}

/** @lang zh-CN 向菜单面板追加菜单项（分隔线/快捷键渲染共用；完整态与精简态同构）。 / @lang en Append menu entries to a panel (separator/shortcut rendering shared; identical for full and compact modes). */
function appendMenuItems(panel: HTMLElement, items: AppMenuItem[]): void {
  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement("div");
      separator.className = "app-menu__sep";
      panel.appendChild(separator);
      continue;
    }
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "app-menu__item";
    entry.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.textContent = item.label;
    entry.appendChild(label);
    if (item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "app-menu__shortcut";
      shortcut.textContent = item.shortcut;
      entry.appendChild(shortcut);
    }
    entry.addEventListener("click", () => { panel.remove(); item.action(); });
    panel.appendChild(entry);
  }
}

/** @lang zh-CN 挂接菜单面板的定位与关闭：fixed 定位锚定按钮下方、外点/Esc 关闭（捕获级，关闭自移除）、关闭器挂面板供 `closeAppMenu()` 统一调用（任何关闭路径都摘监听）、首项聚焦可选（悬停切换不抢焦点）。 / @lang en Wire a menu panel's positioning and closing: fixed anchoring under the button, outside-click/Esc close (capture phase, self-removing), the closer attached to the panel for the shared `closeAppMenu()` (every close path detaches listeners), optional first-item focus (hover switching never steals focus). */
function wireAppMenuPanel(panel: HTMLElement, anchor: HTMLElement, options: { focusFirstItem?: boolean } = {}): void {
  const rect = anchor.getBoundingClientRect();
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.top = `${Math.round(rect.bottom + 2)}px`;
  document.body.appendChild(panel);
  const closeOnOutside = (event: MouseEvent): void => {
    if (!panel.contains(event.target as Node)) closeMenu();
  };
  const closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
  };
  const closeMenu = (): void => {
    panel.remove();
    document.removeEventListener("mousedown", closeOnOutside, true);
    document.removeEventListener("keydown", closeOnEscape, true);
    if (activeFloaterCloser === closeMenu) activeFloaterCloser = null;
  };
  (panel as HTMLElement & { __close?: () => void }).__close = closeMenu;
  document.addEventListener("mousedown", closeOnOutside, true);
  document.addEventListener("keydown", closeOnEscape, true);
  activeFloaterCloser = closeMenu;
  if (options.focusFirstItem !== false) {
    panel.querySelector<HTMLButtonElement>(".app-menu__item")?.focus();
  }
}

/** @lang zh-CN 在给定菜单按钮下方打开下拉（定位用 fixed，随滚动不漂移）。 / @lang en Open a dropdown under the given menu button (fixed positioning; does not drift on scroll). */
function openAppMenu(menu: AppMenu, anchor: HTMLElement, options: { focusFirstItem?: boolean } = {}): void {
  const panel = document.createElement("div");
  panel.className = "app-menu";
  panel.setAttribute("role", "menu");
  panel.setAttribute("data-owner", menu.label);
  appendMenuItems(panel, menu.items());
  wireAppMenuPanel(panel, anchor, options);
}

/** @lang zh-CN 渲染精简态菜单栏（W-hrt-P14 F3）：单个「☰ 菜单」按钮（图标+文字），点击弹出分组下拉；再次点击收起（与完整态菜单按钮一致）。 / @lang en Render the compact menubar (W-hrt-P14 F3): a single "☰ Menu" button (icon + label) opening a grouped dropdown; clicking again collapses it (same as the full-mode menu buttons). */
function renderCompactMenubar(): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menubar__item menubar__compact";
  button.setAttribute("aria-haspopup", "menu");
  button.appendChild(createIcon("menu-2"));
  const label = document.createElement("span");
  label.textContent = "菜单";
  button.appendChild(label);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const openOwner = document.querySelector(".app-menu[data-owner]");
    if (openOwner?.getAttribute("data-owner") === "compact") { closeAppMenu(); return; }
    closeAppMenu();
    openCompactMenu(button);
  });
  menubarElement.appendChild(button);
}

/**
 * @lang zh-CN
 * 精简态下拉（W-hrt-P14 F3，评审 #5 定案「折叠为 ☰ 菜单」）：单个面板按七个菜单分组展示全部
 * 项（组头只读、项可点击执行并关闭）——与 VS Code 汉堡菜单同构，全部能力保持可达。
 * @lang en
 * The compact dropdown (W-hrt-P14 F3, review #5 "fold into ☰ Menu"): a single panel lists every
 * entry grouped by the seven menus (group headers read-only, entries run and close) — structurally
 * the same as VS Code's hamburger menu, keeping every capability reachable.
 */
function openCompactMenu(anchor: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "app-menu app-menu--grouped";
  panel.setAttribute("role", "menu");
  panel.setAttribute("data-owner", "compact");
  for (const menu of buildAppMenus()) {
    const group = document.createElement("div");
    group.className = "app-menu__group";
    group.textContent = menu.label;
    panel.appendChild(group);
    appendMenuItems(panel, menu.items());
  }
  wireAppMenuPanel(panel, anchor, {});
}

/** @lang zh-CN 执行编辑器命令（菜单转发的统一入口；编辑器未就绪时静默忽略）。 / @lang en Run an editor command (single funnel for menu forwarding; silently ignored when the editor is not ready). */
function execEditorCommand(command: string): void {
  editor?.execCommand(command);
}

/** @lang zh-CN 菜单「显示/隐藏目录树」：翻转显隐意愿并持久化（与工具栏按钮同一状态源）。 / @lang en Menu "show/hide tree": flips and persists the visibility intent (same state source as the toolbar button). */
function toggleExplorerFromMenu(): void {
  explorerHiddenByUser = !explorerHiddenByUser;
  localStorage.setItem("hia-hugerte.explorer-hidden", explorerHiddenByUser ? "1" : "0");
  updateExplorerVisibility();
  renderAppToolbar();
}

/** @lang zh-CN 菜单「清空历史」：复用专用确认（与历史下拉同一路径）。 / @lang en Menu "clear history": reuses the dedicated confirmation (same path as the history dropdown). */
async function clearHistoryFromMenu(): Promise<void> {
  const confirmed = await confirmClearHistory();
  if (!confirmed) return;
  await invoke("recent_files_clear").catch(() => undefined);
  setStatus("已清空历史记录");
}

/** @lang zh-CN 菜单「打开 Windows 默认应用设置」。 / @lang en Menu "open Windows default apps settings". */
async function openDefaultAppsSettingsFromMenu(): Promise<void> {
  try {
    await invoke("open_default_apps_settings");
    setStatus("已在系统「默认应用」设置中选择本程序");
  } catch (error) {
    setStatus(`打开系统设置失败：${formatError(error)}`);
  }
}

/** @lang zh-CN 菜单「打开下载页」。 / @lang en Menu "open download page". */
async function openReleasesPageFromMenu(): Promise<void> {
  try {
    await invoke<string>("open_releases_page");
    setStatus("已在浏览器中打开下载页");
  } catch (error) {
    setStatus(`打开下载页失败：${formatError(error)}`);
  }
}

/**
 * @lang zh-CN
 * 应用级工具栏（方案二定案）：新建/打开/保存/另存为/历史 ｜ 目录树（带 Tabler 图标，`src/ui/icons.ts`）。
 * 按钮语义由 `title` + 可见文字承担（图标仅视觉提示）；目录树按钮反映当前显隐状态（`aria-pressed`）。
 * 每次重绘以同步状态（如目录树显隐变化后）。
 * @lang en
 * Application toolbar (option B): new / open / save / save-as / history | tree (with Tabler icons from
 * `src/ui/icons.ts`). Button semantics come from `title` plus visible text (icons are visual hints);
 * the tree button reflects the current visibility via `aria-pressed`. It re-renders to stay in sync
 * with state (e.g. after the tree is toggled elsewhere).
 */
function renderAppToolbar(): void {
  toolbarButtons.textContent = "";
  /** @lang zh-CN 工具栏按钮定义（图标 + 文字 + 点击行为）。 / @lang en Toolbar button definition (icon + label + click handler). */
  const buttons: Array<{ icon: Parameters<typeof createIcon>[0]; label: string; title: string; onClick: () => void; pressed?: boolean }> = [
    { icon: "file-plus", label: "新建", title: "新建文档 (Ctrl+N)", onClick: () => void createDocument() },
    { icon: "folder-open", label: "打开", title: "打开 HTML 文件 (Ctrl+O)", onClick: () => void openWithDialog() },
    { icon: "device-floppy", label: "保存", title: "保存当前文档 (Ctrl+S)", onClick: () => void saveDocument(false) },
    { icon: "file-download", label: "另存为", title: "另存为 HTML 文件", onClick: () => void saveDocument(true) },
    { icon: "history", label: "历史", title: "最近打开的文件", onClick: () => void toggleHistoryMenu() },
    { icon: "layout-sidebar-left-collapse", label: "目录树", title: "显示/隐藏目录树", onClick: () => toggleExplorerFromMenu(), pressed: !explorerHiddenByUser }
  ];
  buttons.forEach((definition, index) => {
    // 中文：第 6 个按钮（目录树）前插入分隔线——与原型稿一致。
    // English: Insert a separator before the sixth button (tree) — matching the prototype.
    if (index === 5) {
      const separator = document.createElement("span");
      separator.className = "app-toolbar__sep";
      toolbarButtons.appendChild(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-toolbar__btn";
    button.title = definition.title;
    // 中文：数据标记供浮层判定"点击入口按钮不触发外点关闭"（如历史下拉）。
    // English: A data marker lets floaters exempt "click on its entry button" from outside-close
    //          (e.g. the history dropdown).
    if (definition.label === "历史") button.dataset.entry = "history";
    if (definition.pressed !== undefined) button.setAttribute("aria-pressed", String(definition.pressed));
    button.appendChild(createIcon(definition.pressed === false ? "layout-sidebar-left-expand" : definition.icon));
    const label = document.createElement("span");
    label.textContent = definition.label;
    button.appendChild(label);
    button.addEventListener("click", definition.onClick);
    toolbarButtons.appendChild(button);
  });
}

/**
 * @lang zh-CN
 * 刷新头部与 Tab 条：头部显示「N 个文档 · M 个未保存 + 活动文档名」摘要（ADR-0005 第 5 条），
 * Tab 条按 tabs/activeIndex 重绘（脏 ●、关闭 ✕、活动高亮、溢出收纳）。窗口标题跟随活动文档。
 * @lang en
 * Refresh the header and tab strip: the header shows the "N documents · M unsaved" summary plus
 * the active document name (ADR-0005 §5), and the strip re-renders from tabs/activeIndex
 * (dirty ●, close ✕, active highlight, overflow collapse). The window title follows the active doc.
 */
function refreshDocumentHeader(): void {
  const summary = summarizeTabs(tabs);
  const label = getDocumentLabel(state().path);
  const summaryText = summary.total > 1 ? `${summary.total} 个文档 · ${summary.dirty} 个未保存` : (summary.dirty > 0 ? "1 个文档 · 1 个未保存" : "1 个文档");
  documentPath.textContent = `${summaryText}：${summary.dirty > 0 && state().dirty ? "● " : ""}${label}`;
  document.title = state().dirty ? `● ${label} — HIA HugeRTE` : `${label} — HIA HugeRTE`;
  // 中文：状态栏「保存状态」跟随活动 Tab 的脏标记（W-hrt-P14 F4）。
  // English: The status bar's save state follows the active tab's dirty flag (W-hrt-P14 F4).
  statusbarSave.textContent = state().dirty ? "● 未保存" : "已保存";
  statusbarSave.classList.toggle("statusbar__save--dirty", state().dirty);
  renderTabStrip();
}

/** @lang zh-CN 重绘 Tab 条；空 Tab 列表不会出现（closeTab 保证至少一片）。 / @lang en Re-render the tab strip; the list never empties (closeTab guarantees at least one tab). */
function renderTabStrip(): void {
  tabbar.textContent = "";
  const overflowFrom = overflowStartIndex(tabs, activeIndex) ?? tabs.length;
  tabs.forEach((tab, index) => {
    if (index < overflowFrom && index !== activeIndex && overflowFrom < tabs.length) return;
    const chip = document.createElement("div");
    chip.className = `tab${index === activeIndex ? " tab--active" : ""}`;
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-selected", String(index === activeIndex));
    chip.tabIndex = 0;
    if (tab.document.dirty) {
      const dot = document.createElement("span");
      dot.className = "tab__dirty";
      dot.textContent = "●";
      chip.appendChild(dot);
    }
    const name = document.createElement("span");
    name.className = "tab__name";
    name.textContent = getDocumentLabel(tab.document.path);
    chip.appendChild(name);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab__close";
    close.textContent = "✕";
    close.title = "关闭标签页";
    close.addEventListener("click", (event) => { event.stopPropagation(); void closeTabByState(tab.id); });
    chip.appendChild(close);
    chip.addEventListener("click", () => void switchToTab(index));
    chip.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void switchToTab(index); } });
    tabbar.appendChild(chip);
  });
  if (overflowFrom < tabs.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "tabbar__overflow";
    more.textContent = `▾ 更多标签（${tabs.length}）`;
    more.addEventListener("click", () => {
      // 中文：溢出菜单 = 依次列出被收纳的 Tab，点击即切换（原型稿 1 的「更多标签」行为）。
      // English: The overflow menu lists collapsed tabs in order; clicking one switches to it.
      const menu = document.createElement("div");
      menu.className = "tab-overflow-menu";
      tabs.forEach((tab, index) => {
        if (index >= overflowFrom && index !== activeIndex) {
          const item = document.createElement("button");
          item.type = "button";
          item.textContent = `${tab.document.dirty ? "● " : ""}${getDocumentLabel(tab.document.path)}`;
          item.addEventListener("click", () => { menu.remove(); void switchToTab(index); });
          menu.appendChild(item);
        }
      });
      menu.addEventListener("click", (event) => { if (event.target === menu) menu.remove(); });
      document.body.appendChild(menu);
    });
    tabbar.appendChild(more);
  }
}

function readEditorContent(): string {
  // 中文：编辑器未就绪（初始化前）时 textarea 持有原始完整文本，直接返回。
  // English: Before the editor is ready, the textarea holds the raw full text — return it as is.
  if (!editor) return editorTarget.value;
  restoreOriginalAssets();
  editor.save();
  // 中文：编辑器只承载 body（缺陷修复 2026-11-17，ADR-0006）——按前缀/后缀不变量重组完整文档，
  //       使保存/快照/源码视图始终拿到整页文本（doctype/head 不再丢失）。
  // English: The editor carries only the body (defect fix 2026-11-17, ADR-0006) — reassemble the
  //       full document via the prefix/suffix invariant so saving/snapshots/the source view always
  //       observe the whole page (doctype/head no longer lost).
  return state().documentPrefix + editor.getContent() + state().documentSuffix;
}

const ASSET_URL_SCHEME = /^(https?:|data:|asset:|blob:)/i;

/**
 * 中文：把 HTML 字符串中的相对资源引用在内存中映射为可显示的 data URI，便于
 * Tauri 的 `tauri://localhost` WebView 显示本地图片；绝不改写磁盘上的源文件。
 * 每个被改写的图片用 `data-original-src` 记录原始相对路径，供保存时还原。
 */
async function rewriteRelativeAssetsInHtml(html: string, baseDir: string | null): Promise<string> {
  if (!baseDir) return html;
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"));
  await Promise.all(
    images.map(async (image) => {
      if (image.hasAttribute("data-original-src")) return;
      const src = image.getAttribute("src") ?? "";
      let isRelative = false;
      try {
        new URL(src);
      } catch {
        isRelative = true;
      }
      if (!isRelative || src.startsWith("/") || ASSET_URL_SCHEME.test(src)) return;
      try {
        const dataUri = await invoke<string | null>("resolve_document_asset", { baseDir, relativePath: src });
        if (dataUri) {
          image.setAttribute("data-original-src", src);
          image.setAttribute("src", dataUri);
        }
      } catch {
        // 解析失败时保留原引用，不阻断编辑与显示。
      }
    })
  );
  // 中文：返回 body 内层 HTML——调用方（applyDocumentToEditor / 源码回写）注入编辑器的正是
  //       body 段；编辑器不承载 doctype/head，故不返回 outerHTML（缺陷修复 2026-11-17，ADR-0006）。
  // English: Return the body's inner HTML — the callers (applyDocumentToEditor / source apply-back)
  //       inject exactly the body section into the editor; the editor never carries doctype/head,
  //       so outerHTML is no longer returned (defect fix 2026-11-17, ADR-0006).
  return document.body?.innerHTML ?? html;
}

/** 中文：保存前把内存中改写的显示 URL 还原为原始相对路径，确保磁盘文件不被改动。 */
function restoreOriginalAssets(): void {
  if (!editor) return;
  const images = Array.from(editor.getBody().querySelectorAll<HTMLImageElement>("img[data-original-src]"));
  for (const image of images) {
    const original = image.getAttribute("data-original-src");
    if (original) image.setAttribute("src", original);
    image.removeAttribute("data-original-src");
  }
}

/**
 * 中文：将文档状态应用到编辑器。注入前先把相对资源引用在内存中改写为 data URI，
 * 使 WebView 能显示被打开 HTML 文件所在目录的本地图片。
 */
async function applyDocumentToEditor(documentState: DocumentState): Promise<void> {
  if (!editor) {
    editorTarget.value = documentState.content;
    return;
  }
  // 中文：按前缀/后缀不变量切出 body 段注入编辑器（ADR-0006）——编辑器只承载 body，
  //       doctype/head 由 DocumentState 缓存，往返时重组。
  // English: Slice out the body section per the prefix/suffix invariant and inject it into the
  //       editor (ADR-0006) — the editor carries only the body while doctype/head live in the
  //       DocumentState caches and are reassembled on round-trips.
  const bodyContent = documentState.content.slice(documentState.documentPrefix.length, documentState.content.length - documentState.documentSuffix.length);
  const displayContent = await rewriteRelativeAssetsInHtml(bodyContent, documentState.baseDir);
  editor.setContent(displayContent);
  editor.undoManager.clear();
  editor.setDirty(false);
  // 中文：文档内容整体换入（切 Tab/保存/替换）后同步侧栏大纲与搜索——两函数内部按当前模式
  //       判定可见性，不可见时零开销。
  // English: After a wholesale content swap (tab switch/save/replace), refresh the sidebar
  //       outline and search — both check the current mode's visibility internally, costing
  //       nothing while hidden.
  refreshOutlineIfVisible();
  refreshSearchIfVisible();
}

function applyEditorFontSize(): void {
  // 中文：字号选择器现在只存在于设置面板内（按需创建）；未打开面板时使用持久化值。
  // English: The size selector now only exists inside the settings panel (created on demand); when the
  //          panel has never opened, fall back to the persisted value.
  const selectedSize = fontSize?.value ?? localStorage.getItem("hia-hugerte.editor-font-size") ?? "16px";
  localStorage.setItem("hia-hugerte.editor-font-size", selectedSize);
  editor?.getBody().style.setProperty("font-size", selectedSize);
}

/** @lang zh-CN 行列计数的「另起一行」元素集合（近似渲染行：块级开标签与 <br>/<hr> 各计一行；ul/ol/table/tr 等容器不计，由其子块计）。 / @lang en Line-break elements for cursor metrics (approximate rendered lines: block open tags and <br>/<hr> each add one; containers like ul/ol/table/tr are skipped and counted via their child blocks). */
const CURSOR_LINE_ELEMENTS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "LI", "DT", "DD", "BLOCKQUOTE", "PRE", "FIGURE", "FIGCAPTION", "TD", "TH", "BR", "HR"]);

/**
 * @lang zh-CN
 * 计算活动 Tab 的光标行列并写入状态栏（W-hrt-P14 F4，近似语义）：沿 body 文档序走查到 caret
 * 边界，块级开标签与 `<br>`/`<hr>` 各起一行；列为当前行内已累计字符数（caret 在文本节点时
 * 加上偏移）。已知近似：嵌套容器（ul/ol/table）按子块计数，表格等复杂布局与渲染行可能略有
 * 出入；v1 取「文档文本行」语义——与 F1 源码视图的 HTML 源码行号是**不同坐标系**。
 * @lang en
 * Compute the active tab's cursor line-column into the status bar (W-hrt-P14 F4, approximate
 * semantics): walk the body in document order to the caret boundary; block open tags and
 * `<br>`/`<hr>` each start a line; the column is the character count within the current line (plus
 * the offset when the caret sits in a text node). Known approximation: nested containers
 * (ul/ol/table) count via their child blocks, so complex layouts like tables may deviate slightly
 * from rendered lines; v1 uses "document text line" semantics — a **different coordinate system**
 * from the F1 source view's HTML-source line numbers.
 */
function updateStatusCursor(): void {
  if (!editor) return;
  const body = editor.getBody();
  const selectionRange = editor.selection.getRng();
  if (!body || !selectionRange) return;
  const ownerDocument = body.ownerDocument ?? document;
  const startContainer = selectionRange.startContainer;
  // 中文：caret 边界——文本节点即该节点本身；元素容器取偏移处的子节点（offset 等于子节点数时
  //       为 null，走查到底即视作文档末尾位置）。
  // English: The caret boundary — the text node itself; for an element container take the child at
  //       the offset (null when the offset equals the child count: the walk runs to the document
  //       end, i.e. the final position).
  const boundary = startContainer.nodeType === Node.TEXT_NODE
    ? startContainer
    : (startContainer.childNodes[selectionRange.startOffset] ?? null);
  const walker = ownerDocument.createTreeWalker(body, NodeFilter.SHOW_ALL);
  let line = 1;
  let column = 1;
  // 中文：首个块元素即第 1 行的开端，不再额外计一行（实测 off-by-one 修正：`<p>…</p>` 单段
  //       文档的 caret 应为 行1 而非 行2）。
  // English: The first block element OPENS line 1 rather than adding one (measured off-by-one fix:
  //       a single-`<p>` document must report line 1, not line 2).
  let firstNodeVisited = false;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node === boundary) {
      if (node.nodeType === Node.TEXT_NODE) column += selectionRange.startOffset;
      break;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      column += (node.nodeValue ?? "").length;
      firstNodeVisited = true;
      continue;
    }
    const tagName = (node as Element).tagName;
    if (CURSOR_LINE_ELEMENTS.has(tagName)) {
      if (firstNodeVisited) {
        line += 1;
        column = 1;
      }
      firstNodeVisited = true;
    }
  }
  statusbarCursor.textContent = `行 ${line} · 列 ${column}`;
}

async function initializeEditor(): Promise<void> {
  // 中文：字号选择器现在延迟到设置面板创建；编辑器初始化直接沿用持久化值（由 applyEditorFontSize 读取）。
  // English: The size selector is now created lazily inside the settings panel; editor init simply
  //          reuses the persisted value (read by applyEditorFontSize).
  registerCompatibilityChecklistPlugin();
  const instances = await hugerte.init({
    target: editorTarget, height: "100%", menubar: false, promotion: false, branding: false, resize: false, convert_urls: false,
    // 中文：contextmenu_never_use_native（维护者 2026-11-12 反馈）——编辑 iframe 内永不弹出 WebView2
    //       原生右键菜单；HugeRTE 自带的上下文菜单（默认作用于链接/图片/表格等元素）正常弹出。
    //       外壳区域的默认菜单由下方 document 级拦截负责。
    // English: contextmenu_never_use_native (maintainer feedback 2026-11-12) — the WebView2 native
    //       context menu never appears inside the editor iframe; HugeRTE's own context menu (by
    //       default active on links/images/tables) still pops up. The shell area's default menu is
    //       handled by the document-level interception below.
    contextmenu_never_use_native: true,
    skin_url: "default", content_css: "default",
    // 中文：关闭 HugeRTE 内置状态栏（W-hrt-P14 F4）——其职责（字数统计）由应用级状态栏
    //       (#statusbar) 整合承担；wordcount 插件仍在运行并派发 wordCountUpdate。
    // English: Disable HugeRTE's built-in status bar (W-hrt-P14 F4) — its duty (word count) is
    //       taken over by the application status bar (#statusbar); the wordcount plugin keeps
    //       running and dispatching wordCountUpdate.
    statusbar: false,
    object_resizing: "table",
    table_grid: true,
    table_resize_bars: true,
    mobile: { table_grid: true, object_resizing: "table", resize: false },
    contextmenu: "link image table",
    font_size_formats: HUGERTE_FONT_SIZE_FORMATS,
    font_family_formats: HUGERTE_FONT_FAMILY_FORMATS,
    charmap: buildDefaultCharacterMap(),
    plugins: HUGERTE_COMPATIBILITY_PLUGINS,
    toolbar: HUGERTE_COMPATIBILITY_TOOLBAR,
    content_style: HUGERTE_COMPATIBILITY_CONTENT_STYLE,
    setup(instance) {
      instance.on("Change Input Undo Redo", () => {
        if (isReplacingContent) return;
        // 中文：编辑事件只作用于活动 Tab；编辑器只承载 body，故按前缀/后缀不变量重组完整文档
        //       后写回快照（缺陷修复 2026-11-17，ADR-0006——此前直接存 getContent() 的 body 片段，
        //       保存会丢失 doctype/head）。
        // English: Edit events affect only the active tab; the editor carries only the body, so
        //       reassemble the full document via the prefix/suffix invariant before writing the
        //       snapshot (defect fix 2026-11-17, ADR-0006 — storing the bare getContent() fragment
        //       previously lost doctype/head at save time).
        const currentDocument = state();
        replaceActiveDocument({ ...currentDocument, content: currentDocument.documentPrefix + instance.getContent() + currentDocument.documentSuffix, dirty: true });
        refreshDocumentHeader();
        // 中文：大纲/搜索随内容实时刷新（各自内部判断当前模式是否可见，不可见时零开销）；
        //       源码视图开启时镜像到源码框（源码框聚焦中则跳过，防 caret 冲突）。
        // English: Outline/search refresh live with the content (each internally checks whether
        //       its mode is visible; zero cost while hidden); with the source view active the text
        //       mirrors into the textarea (skipped while the textarea is focused, avoiding caret
        //       conflicts).
        refreshOutlineIfVisible();
        refreshSearchIfVisible();
        refreshSourceTextFromEditor();
        setStatus("已修改，尚未保存");
      });
    }
  });
  editor = instances[0] ?? null;
  if (!editor) throw new Error("HugeRTE 未能创建编辑器实例。");
  // 中文：编辑 iframe 内的 mousedown 转发给活动浮层关闭器——iframe 是独立文档，外壳级外点监听
  //       收不到里面的点击；用户点击编辑区时浮动面板（历史/设置/面包屑下拉）必须关闭
  //       （2026-11-14 外点关闭修复的 iframe 缺口）。
  // English: Forward mousedowns inside the editor iframe to the active-floater closer — the iframe
  //       is its own document and shell-level outside listeners never see clicks there; floating
  //       surfaces (history/settings/crumb dropdown) must close when the user clicks the editor
  //       (the iframe gap in the 2026-11-14 outside-click fix).
  document.querySelector<HTMLIFrameElement>("#hugerte-editor_ifr")?.contentDocument
    ?.addEventListener("mousedown", () => { activeFloaterCloser?.(); });
  // 中文：编辑器滚动 → 源码框比例同步（capture 级监听：滚动事件不冒泡，capture 才能收到
  //       body/html 元素上的滚动）。W-hrt-P14 F1，评审 #4 定案为设置项（默认开）。
  // English: Editor scroll → proportional source-textarea sync (capture-level listener: scroll
  //       events do not bubble, so capture is required to see body/html scrolling). W-hrt-P14 F1;
  //       review #4 decided it is a setting (on by default).
  editor.getDoc()?.addEventListener("scroll", syncScrollFromEditorToSource, true);
  // 中文：字数统计接入应用级状态栏（W-hrt-P14 F4）——wordcount 插件派发的 wordCountUpdate
  //       携带 words/characters；词数语义：每个 CJK 字符计为一个词，字符数含空格。
  // English: Word counts feed the application status bar (W-hrt-P14 F4) — the wordcount plugin's
  //       wordCountUpdate event carries words/characters; semantics: each CJK character counts as
  //       one word, and the character count includes spaces.
  editor.on("wordCountUpdate", (event: { wordCount: { words: number; characters: number } }) => {
    statusbarCount.textContent = `字符 ${event.wordCount.characters} · 词 ${event.wordCount.words}`;
  });
  // 中文：光标行列接入状态栏（W-hrt-P14 F4）——NodeChange 覆盖选区/节点变化，keyup/click 覆盖
  //       同节点内移动，SetContent 覆盖内容整体换入后的初始定位。
  // English: Cursor line-column feeds the status bar (W-hrt-P14 F4) — NodeChange covers selection/
  //       node changes, keyup/click cover movement inside one node, SetContent covers the initial
  //       position after wholesale content swaps.
  editor.on("NodeChange keyup click focus SetContent", updateStatusCursor);
  await replaceDocument(tabs[activeIndex].document);
  applyEditorFontSize();
}

/**
 * @lang zh-CN
 * 替换活动 Tab 的文档（新建/打开/确认丢弃后的落点）：先快照当前编辑内容到活动 Tab，
 * 再整体换入 nextState（isReplacingContent 防止 Change 事件误标脏），刷新头部。
 * @lang en
 * Replace the active tab's document (destination of new/open/confirmed discard): snapshot the
 * current editor content into the tab first, then swap in nextState wholesale (isReplacingContent
 * prevents stray Change events from flagging dirty), and refresh the header.
 */
async function replaceDocument(nextState: DocumentState): Promise<void> {
  isReplacingContent = true;
  replaceActiveDocument(nextState);
  await applyDocumentToEditor(nextState);
  isReplacingContent = false;
  refreshDocumentHeader();
  // 中文：文档整体换入（新建/打开）后强制镜像源码框（即使聚焦也刷新，防旧文本回写进新文档）。
  // English: After a wholesale document swap (new/open), force the source-textarea mirror (even
  //       while focused, so the previous text cannot be written back into the new document).
  refreshSourceTextFromEditor(true);
  resetExplorerFor(nextState);
  await renderExplorerTree();
}

/**
 * @lang zh-CN
 * 文档切换时复位资源树：浏览目录回到新文档所在目录、清空展开与选中。浏览目录在无文档
 * （baseDir 为空）时留空，侧栏随之隐藏。
 * @lang en
 * Reset the explorer on document change: the browsing directory returns to the new document's
 * directory, with expansion and selection cleared. With no document (empty baseDir) the browsing
 * directory stays empty and the sidebar hides.
 */
function resetExplorerFor(documentState: DocumentState): void {
  // 中文：baseDir 是 Rust canonicalize 的结果（带 `\\?\` 前缀），先归一化再用于面包屑与路径拼接。
  // English: baseDir is Rust's canonicalized result (with the `\\?\` prefix); normalize it before
  //       it feeds the breadcrumb and path joining.
  explorerRootPath = documentState.baseDir ? normalizeWindowsPath(documentState.baseDir) : "";
  expandedDirs.clear();
  if (explorerRootPath) expandedDirs.add(explorerRootPath);
  selectedTreePath = null;
}

/**
 * @lang zh-CN
 * 切换到指定 Tab（ADR-0005 第 2 条：单实例内容交换）：先经 readEditorContent 把出栈 Tab
 * 的资源引用还原并快照内容，再载入目标 Tab 内容并按其 baseDir 重新内联资源；undo 栈清空
 * 是记录在案的取舍。index 非法或即活动 Tab 时为空操作。
 * @lang en
 * Switch to the given tab (ADR-0005 §2, single-instance content swap): first snapshot the
 * outgoing tab via readEditorContent (which restores asset refs), then load the target tab's
 * content and re-inline assets per its baseDir; clearing the undo stack is a recorded trade-off.
 * Invalid index or the active tab is a no-op.
 */
async function switchToTab(index: number): Promise<void> {
  if (index < 0 || index >= tabs.length || index === activeIndex) return;
  // 中文：源码视图开着先落盘源码编辑——下方快照读的是编辑器内容，不 flush 会读到过期文本。
  // English: With the source view open, flush source edits first — the snapshot below reads the
  //       editor's content, which would be stale without the flush.
  await flushSourceEdits();
  isReplacingContent = true;
  if (editor) {
    const content = readEditorContent();
    replaceActiveDocument({ ...state(), content });
  }
  activeIndex = index;
  await applyDocumentToEditor(state());
  isReplacingContent = false;
  refreshDocumentHeader();
  applyEditorFontSize();
  // 中文：换 Tab 后强制镜像源码框（见 replaceDocument 同款理由）。
  // English: After a tab switch, force the source-textarea mirror (same rationale as in
  //       replaceDocument).
  refreshSourceTextFromEditor(true);
  resetExplorerFor(state());
  await renderExplorerTree();
  setStatus("已切换标签页");
}

/**
 * @lang zh-CN
 * 关闭 Tab：脏 Tab 先过确认模态；随后交由 closeTab 规约计算新数组与活动索引，
 * 若关闭的正是活动 Tab 则交换编辑器内容到新的活动 Tab。未确认（取消）时不动。
 * @lang en
 * Close a tab: dirty tabs pass through the confirm modal first; the closeTab reducer then
 * computes the new array and active index, and if the closed tab was active the editor swaps
 * to the new active tab. No changes when the user cancels.
 */
async function closeTabByState(id: string): Promise<void> {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;
  // 中文：脏确认前先落盘源码编辑——防抖未落的内容也要计入"未保存修改"并参与确认。
  // English: Flush source edits before the dirty check — debounced-but-unapplied text must count
  //       as unsaved work and join the confirmation.
  await flushSourceEdits();
  if (tabs[index].document.dirty && !(await confirmDiscardChanges())) return;
  if (index === activeIndex && editor) {
    const content = readEditorContent();
    replaceActiveDocument({ ...state(), content });
  }
  const reduced = closeTab(tabs, id, activeIndex);
  if (!reduced) return;
  tabs = reduced.tabs;
  activeIndex = reduced.activeIndex;
  await applyDocumentToEditor(state());
  refreshDocumentHeader();
  applyEditorFontSize();
  // 中文：换入新活动 Tab 后强制镜像源码框（见 replaceDocument 同款理由）。
  // English: After the new active tab loads, force the source-textarea mirror (same rationale as
  //       in replaceDocument).
  refreshSourceTextFromEditor(true);
  setStatus(tabs.length > 1 ? "已关闭标签页" : "已新建文档");
}

/**
 * @lang zh-CN
 * 显示「放弃未保存修改」的确认模态并等待用户选择。实现 DEF-1 方案 B：替代发行构建中
 * 不可用的 `window.confirm`。键盘语义：Esc/取消按钮 = 保留文档（返回 false，安全默认）；
 * 「放弃修改并继续」= 返回 true。模态打开时默认焦点落在「取消」，使误触回车不会丢数据；
 * 关闭后焦点回落到触发按钮以保持键盘连续性。
 * @lang en
 * Show the discard-changes confirmation modal and await the user's choice. Implements DEF-1
 * option B: replaces `window.confirm`, which is unavailable in release builds. Keyboard
 * semantics: Esc or the Cancel button keeps the document (returns false, the safe default);
 * "Discard and continue" returns true. Default focus sits on Cancel while the modal is open so
 * an accidental Enter cannot lose data; focus returns to the invoking button on close to keep
 * keyboard flow continuous.
 */
function confirmDiscardChanges(): Promise<boolean> {
  if (!state().dirty) return Promise.resolve(true);
  return showConfirmModal(buildDiscardConfirmMessage(state().path));
}

/**
 * @lang zh-CN
 * 打开文档载荷（对话框/路径/启动参数共同落点，ADR-0005 第 3 条）：活动 Tab 脏时先确认；
 * 随后开新 Tab 并切换过去——单文档时代的"替换当前文档"语义升级为"新开标签页"。
 * @lang en
 * Open a document payload (common destination of dialog/path/startup-arg, ADR-0005 §3): confirm
 * when the active tab is dirty, then append a tab and switch to it — the single-document
 * "replace current" semantics became "open in a new tab".
 */
async function openPayload(payload: DocumentPayload): Promise<void> {
  // 中文：快照前先落盘源码编辑（与 switchToTab 同款闸口）。
  // English: Flush source edits before the snapshot (same gate as switchToTab).
  await flushSourceEdits();
  if (!(await confirmDiscardChanges())) return;
  if (editor) {
    const content = readEditorContent();
    replaceActiveDocument({ ...state(), content });
  }
  const appended = appendDocumentTab(tabs, documentFromPayload(payload));
  if (!appended) { setStatus(`标签页已达上限（${MAX_TABS}），请先关闭部分标签页。`); return; }
  tabs = appended;
  await switchToTab(tabs.length - 1);
  if (!historyDisabled && payload.path) void invoke("recent_files_record", { path: payload.path }).catch(() => undefined);
  setStatus("已打开");
}

async function openWithDialog(): Promise<void> {
  try {
    const payload = await invoke<DocumentPayload | null>("open_document_dialog");
    if (payload) await openPayload(payload);
  } catch (error) { setStatus(`打开失败：${formatError(error)}`); }
}

async function openFromPath(path: string): Promise<void> {
  try { await openPayload(await invoke<DocumentPayload>("open_document_path", { path })); }
  catch (error) { setStatus(`无法打开文件：${formatError(error)}`); }
}

/**
 * @lang zh-CN
 * 新建文档（ADR-0005 第 3 条）：不再要求确认当前文档（新文档进新 Tab，不覆盖任何内容）；
 * 达到上限时提示。
 * @lang en
 * New document (ADR-0005 §3): no longer requires confirming the current document (the new doc
 * lives in its own tab and overwrites nothing); shows a notice when the cap is reached.
 */
async function createDocument(): Promise<void> {
  const appended = appendDocumentTab(tabs, createNewDocument());
  if (!appended) { setStatus(`标签页已达上限（${MAX_TABS}），请先关闭部分标签页。`); return; }
    tabs = appended;
    await switchToTab(tabs.length - 1);
    setStatus("已新建文档");
}

/**
 * @lang zh-CN
 * 「历史 ▾」下拉（设计基线稿 3 / ADR-0004）：列出最近打开（失效路径灰显标"文件不存在"，
 * 点击提示重新定位）、底部为实际存储位置说明、「不记录模式」开关与「清空历史」（复用 DEF-1
 * 确认模态——不可逆操作）。点击其他区域或再次点击按钮关闭。
 * @lang en
 * The "History ▾" dropdown (draft 3 / ADR-0004): lists recent files (missing ones dimmed with
 * a "file missing" tag; clicking offers relocation), a footer note with the real storage
 * location, the no-record toggle, and "clear history" (reusing the DEF-1 confirm modal — an
 * irreversible action). Clicking elsewhere or the button again closes it.
 */
async function toggleHistoryMenu(): Promise<void> {
  const existing = document.querySelector(".history-menu");
  if (existing) {
    // 中文：经关闭器移除（顺带清掉编辑 iframe 缺口注册的引用与外点监听）。
    // English: Remove via the closer (which also clears the iframe-gap registration and the outside listener).
    activeFloaterCloser?.();
    return;
  }
  if (isTauriRuntimeCheck()) {
    const menu = document.createElement("div");
    menu.className = "history-menu";
    const head = document.createElement("div");
    head.className = "history-menu__head";
    const title = document.createElement("span");
    title.textContent = "最近打开（本地记录）";
    const actions = document.createElement("span");
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "清空历史";
    clear.addEventListener("click", async () => {
      // 中文：清空不可逆——先经专用确认模态（复用 DEF-1 模态壳），确认后再执行并关闭菜单。
      // English: Clearing is irreversible — go through the dedicated confirm modal (DEF-1 shell
      //       reuse) first, then clear and close the menu.
      menu.remove();
      const confirmed = await confirmClearHistory();
      if (confirmed) {
        await invoke("recent_files_clear").catch(() => undefined);
        setStatus("已清空历史记录");
      }
    });
    const toggleLabel = document.createElement("button");
    toggleLabel.type = "button";
    toggleLabel.textContent = historyDisabled ? "开启记录" : "不记录模式";
    toggleLabel.addEventListener("click", () => {
      historyDisabled = !historyDisabled;
      localStorage.setItem("hia-hugerte.history-disabled", historyDisabled ? "1" : "0");
      menu.remove();
      setStatus(historyDisabled ? "已开启不记录模式（新打开的文件不再记录）" : "已恢复历史记录");
    });
    actions.append(clear, toggleLabel);
    head.append(title, actions);
    menu.appendChild(head);
    let entries: RecentFileEntryPayload[] = [];
    try { entries = await invoke<RecentFileEntryPayload[]>("recent_files_load"); } catch { entries = []; }
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-item";
      empty.textContent = historyDisabled ? "（不记录模式已开启）" : "暂无历史记录";
      menu.appendChild(empty);
    }
    for (const entry of entries) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "history-item";
      const pathSpan = document.createElement("span");
      pathSpan.className = "history-item__path";
      pathSpan.textContent = entry.path;
      pathSpan.title = entry.path;
      const meta = document.createElement("span");
      meta.className = "history-item__meta";
      meta.textContent = formatOpenedAt(entry.openedAt);
      row.append(pathSpan, meta);
      row.addEventListener("click", () => { menu.remove(); void openFromPath(entry.path); });
      menu.appendChild(row);
      // 中文：失效检测在打开时自然发生（openFromPath 报错并显示状态）；灰显需同步探测，首版
      //       以 Rust 读取结果为准——避免逐条 stat 的成本，保持菜单打开迅速。
      // English: Missing files surface naturally on open (openFromPath shows the error); dimming
      //       would need per-entry stat probes — skipped in v1 to keep the menu instant.
    }
    const footer = document.createElement("div");
    footer.className = "history-menu__foot";
    footer.textContent = "记录仅保存在本机（便携目录优先；不可写时 %APPDATA%\\HIA-HugeRTE）";
    menu.appendChild(footer);
    menu.addEventListener("click", (event) => { if (event.target === menu) menu.remove(); });
    document.body.appendChild(menu);
    // 中文：锚定到工具栏「历史」按钮下方（`W-hrt-P12` 后入口在工具栏，CSS 的固定 top/right 不再适用）。
    // English: Anchor under the toolbar's History button (after `W-hrt-P12` the entry lives in the
    //          toolbar, so the CSS fixed top/right no longer applies).
    const historyEntry = toolbarElement.querySelector<HTMLElement>('[data-entry="history"]');
    if (historyEntry) {
      const entryRect = historyEntry.getBoundingClientRect();
      menu.style.left = `${Math.round(entryRect.left)}px`;
      menu.style.right = "auto";
      menu.style.top = `${Math.round(entryRect.bottom + 2)}px`;
    }
    // 中文：外点关闭（2026-11-14 维护者反馈修复——此前只有再点入口才会消失）。mousedown 捕获级
    //       监听：目标不在菜单内且不在入口按钮上（入口自身的切换由 click 处理，避免"关了又开"）
    //       即关闭。菜单经其他路径移除后，本监听会在下一次外点时自清理（对已脱离节点 no-op）。
    // English: Close on outside click (fix for maintainer feedback 2026-11-14 — previously only
    //       re-clicking the entry closed it). A capture-phase mousedown listener closes the menu when
    //       the target is neither inside the menu nor on the entry button (the entry's own toggle is
    //       handled by click, avoiding a close-then-reopen race). If the menu is removed via another
    //       path, the listener self-cleans on the next outside mousedown (no-op on the detached node).
    const closeHistoryOnOutside = (event: MouseEvent): void => {
      const target = event.target as Node;
      // 中文：入口判定作用在工具栏「历史」按钮上（`W-hrt-P12` 后入口从 Banner 移入工具栏）。
      // English: The entry check targets the toolbar's History button (after `W-hrt-P12` the entry
      //          moved from the Banner into the toolbar).
      const entry = toolbarElement.querySelector<HTMLElement>('[data-entry="history"]');
      if (!menu.contains(target) && !entry?.contains(target)) {
        closeHistoryMenu();
      }
    };
    // 中文：关闭器 = 移除菜单 + 清外点监听 + 注销活动浮层引用。
    // English: The closer = remove the menu + detach the outside listener + unregister the active floater.
    const closeHistoryMenu = (): void => {
      menu.remove();
      document.removeEventListener("mousedown", closeHistoryOnOutside, true);
      if (activeFloaterCloser === closeHistoryMenu) activeFloaterCloser = null;
    };
    document.addEventListener("mousedown", closeHistoryOnOutside, true);
    activeFloaterCloser = closeHistoryMenu;
  }
}

/** @lang zh-CN 运行时判定（拖放节同款）；历史按钮在浏览器验证模式下隐藏。 / @lang en Runtime check (same as the drop section); the history button hides in browser verification mode. */
function isTauriRuntimeCheck(): boolean { return "__TAURI_INTERNALS__" in window; }

/** @lang zh-CN 状态载荷（Rust `AssociationStatus`）。 / @lang en The status payload (Rust `AssociationStatus`). */
interface AssociationStatusPayload { registered: boolean; currentExe: string; }

/** @lang zh-CN 版本信息载荷（Rust `AppVersionInfo`；版本为编译期常量，运行期不变）。 / @lang en Version info payload (Rust `AppVersionInfo`; the version is a compile-time constant and never changes at runtime). */
interface AppVersionInfoPayload { version: string; releasesUrl: string; }

/**
 * @lang zh-CN
 * 设置面数据的会话级缓存（维护者 2026-11-14 定案：首次打开查询，后续直接读缓存，消除每次开面板
 * 拉起 `reg.exe` 的卡顿）。`null` = 本次会话尚未查询。注册/移除操作成功后用返回值回写，保证面板
 * 内操作即时反映。已知取舍：会话期间若在应用外手工改动注册表，面板要重启才会刷新——ADR 红线
 * （不写 `UserChoice`、不设默认）不受影响，故可接受。
 * @lang en
 * Session-level caches for the settings surface (maintainer decision 2026-11-14: query on first
 * open, read from cache afterwards, removing the per-open `reg.exe` spawn stutter). `null` means not
 * yet queried this session. Register/remove write their results back so in-panel actions reflect
 * immediately. Accepted trade-off: registry changes made outside the app only show after a restart —
 * the ADR red lines (no `UserChoice`, no default takeover) are unaffected, so this is acceptable.
 */
let associationCache: AssociationStatusPayload | null = null;
let versionInfoCache: AppVersionInfoPayload | null = null;

/**
 * @lang zh-CN
 * 当前活动浮层（历史下拉/设置面板/面包屑下拉）的关闭器。编辑 iframe 是独立文档，外壳级
 * mousedown 监听收不到 iframe 内的点击——iframe 侧的 mousedown 调用本关闭器，让浮动面板在
 * "点击编辑区"时关闭（2026-11-14 外点关闭修复的 iframe 缺口）。
 * @lang en
 * Closer for the currently active floater (history dropdown / settings panel / crumb dropdown). The
 * editor iframe is its own document, so shell-level mousedown listeners never see clicks inside it —
 * the iframe side calls this closer on mousedown, closing floating surfaces when the user clicks the
 * editor (the iframe gap in the 2026-11-14 outside-click fix).
 */
let activeFloaterCloser: (() => void) | null = null;

/**
 * @lang zh-CN
 * 「设置 ▾」面板（设计基线稿 v1，2026-11-13 维护者确认）：`打开方式` 区展示注册状态并提供显式
 * 注册/移除（ADR-0001 2026-11-12 修订条目 1：每用户、可撤销、不写 `UserChoice`、不设默认），
 * 另提供「打开 Windows 默认应用设置」引导；`版本` 区显示当前版本与「打开下载页」（零网络形态，
 * 修订条目 2：只提示不下载）。点击其他区域或再次点击入口关闭；操作期间按钮禁用防重入。
 * 数据经**会话级缓存**（维护者 2026-11-14 定案）：首次打开查询 `open_with_status`/`app_version_info`
 * 并写缓存，后续打开直接渲染缓存（消除每次拉起 `reg.exe` 的卡顿）；注册/移除成功后回写缓存。
 * 已知取舍：应用外改动注册表需重启应用才会在面板刷新。
 * @lang en
 * The "Settings ▾" panel (baseline draft v1, confirmed by the maintainer 2026-11-13): the
 * `Open with` section shows the registration state with explicit register/remove actions
 * (ADR-0001 2026-11-12 revision item 1: per-user, reversible, never writes `UserChoice`, never sets
 * a default) plus a "open Windows default apps settings" helper; the `Version` section shows the
 * current version and "open download page" (zero-network form, revision item 2: notify only, never
 * download). Clicking elsewhere or the entry again closes it; buttons disable during an operation to
 * prevent re-entry.
 */
async function toggleSettingsPanel(): Promise<void> {
  const existing = document.querySelector(".settings-panel");
  if (existing) {
    // 中文：经关闭器移除（与历史下拉同法）。
    // English: Remove via the closer (same as the history dropdown).
    activeFloaterCloser?.();
    return;
  }
  if (!isTauriRuntimeCheck()) return;

  /** @lang zh-CN 面板容器（与历史下拉同层的轻量浮层）。 / @lang en Panel container (lightweight popover on the same layer as the history dropdown). */
  const panel = document.createElement("div");
  panel.className = "settings-panel";

  /** @lang zh-CN 头部：标题 + 版本号（版本号来自 Rust 的编译期常量）。 / @lang en Header: title plus the version from Rust's compile-time constant. */
  const head = document.createElement("div");
  head.className = "settings-panel__head";
  const headTitle = document.createElement("span");
  headTitle.textContent = "设置";
  const headVersion = document.createElement("span");
  headVersion.className = "settings-panel__version";
  headVersion.textContent = "";
  head.append(headTitle, headVersion);
  panel.appendChild(head);

  // 中文：打开方式区——状态点 + 主按钮；状态来自 open_with_status（只读查询）。
  // English: The Open with section — state dot plus primary button; state from open_with_status.
  const assocSection = document.createElement("div");
  assocSection.className = "settings-panel__section";
  const assocTitle = document.createElement("div");
  assocTitle.className = "settings-panel__title";
  assocTitle.textContent = "打开方式";
  const assocNote = document.createElement("div");
  assocNote.className = "settings-panel__note";
  assocNote.textContent = "注册后本应用会出现在 Windows「打开方式」列表中。不会设为默认打开程序，也不修改系统的默认应用设置。";
  const assocRow = document.createElement("div");
  assocRow.className = "settings-panel__row";
  const assocState = document.createElement("span");
  assocState.className = "settings-panel__state";
  const assocAction = document.createElement("button");
  assocAction.type = "button";
  assocAction.className = "settings-panel__action";
  const assocHelper = document.createElement("button");
  assocHelper.type = "button";
  assocHelper.className = "settings-panel__quiet";
  assocHelper.textContent = "打开 Windows 默认应用设置";
  assocHelper.addEventListener("click", async () => {
    // 中文：引导用户在系统界面自行选择默认程序（本应用不设默认）。打开系统「默认应用」页。
    // English: Guide the user to pick a default in the system UI (this app never sets one). Opens the
    //       Windows "Default apps" settings page.
    try {
      await invoke("open_default_apps_settings");
      setStatus("已在系统「默认应用」设置中选择本程序");
    } catch (error) {
      setStatus(`打开系统设置失败：${formatError(error)}`);
    }
  });
  const assocPath = document.createElement("div");
  assocPath.className = "settings-panel__path";
  assocRow.append(assocState, assocAction, assocHelper);
  assocSection.append(assocTitle, assocNote, assocRow, assocPath);
  panel.appendChild(assocSection);

  /**
   * @lang zh-CN
   * 渲染关联状态：已注册显示绿点 + 「移除注册」+ 实际 exe 路径；未注册显示灰点 + 「注册到打开方式列表」。
   * @lang en
   * Render the association state: registered shows a green dot, "remove registration" and the actual
   * executable path; unregistered shows a grey dot and "register into the Open with list".
   */
  const renderAssociation = (registered: boolean, currentExe: string): void => {
    assocState.textContent = "";
    const dot = document.createElement("span");
    dot.className = `settings-panel__dot${registered ? " settings-panel__dot--on" : ""}`;
    assocState.append(dot, document.createTextNode(registered ? "已注册" : "未注册"));
    assocAction.textContent = registered ? "移除注册" : "注册到打开方式列表";
    assocAction.dataset.action = registered ? "unregister" : "register";
    // 中文：加载占位阶段会临时隐藏主按钮，渲染即恢复可见。
    // English: The loading placeholder temporarily hides the primary button; rendering restores it.
    assocAction.hidden = false;
    assocPath.textContent = registered && currentExe ? currentExe : "";
    assocPath.hidden = !(registered && currentExe);
    assocNote.textContent = registered
      ? "已注册到 Windows「打开方式」列表（未设为默认）。在系统中选择本应用时，Windows 会把文件路径传给本程序。"
      : "注册后本应用会出现在 Windows「打开方式」列表中。不会设为默认打开程序，也不修改系统的默认应用设置。";
  };

  /** @lang zh-CN 状态载荷（Rust `AssociationStatus`；见模块级缓存说明）。 / @lang en The status payload (Rust `AssociationStatus`; see the module-level cache note). */
  // （类型已上移到模块级，供缓存变量使用。 / Type moved to module level for the cache variables.）

  assocAction.addEventListener("click", async () => {
    const command = assocAction.dataset.action === "unregister" ? "open_with_unregister" : "open_with_register";
    assocAction.disabled = true;
    try {
      const result = await invoke<AssociationStatusPayload>(command);
      // 中文：操作结果回写缓存——面板下次打开直接呈现最新状态。
      // English: Write the operation result back to the cache — the next panel open shows it directly.
      associationCache = result;
      renderAssociation(result.registered, result.currentExe);
      setStatus(result.registered ? "已注册到「打开方式」列表（可在系统设置中选择）" : "已移除「打开方式」注册");
    } catch (error) {
      // 中文：失败保留在面板内提示，不关闭面板（便于用户重试或查看原因）。
      // English: Keep the failure visible inside the panel and do not close it (so the user can retry
      //       or read the reason).
      assocNote.textContent = `操作失败：${formatError(error)}`;
    } finally {
      assocAction.disabled = false;
    }
  });
  panel.appendChild(assocSection);

  // 中文：编辑器外观区——**界面字号**（外壳：菜单/工具栏/面板）与**编辑字号**（编辑器正文）分开。
  //       维护者 2026-11-16 澄清：界面字号不得改动编辑器内文字。两者各自持久化。
  // English: Editor appearance — **interface font size** (shell: menu/toolbar/panels) and **editor font
  //          size** (editor body) are separate. Maintainer clarification 2026-11-16: the interface size
  //          must never change the editor's text. Each persists independently.
  const appearanceSection = document.createElement("div");
  appearanceSection.className = "settings-panel__section";
  const appearanceTitle = document.createElement("div");
  appearanceTitle.className = "settings-panel__title";
  appearanceTitle.textContent = "界面与编辑器";
  const appearanceRow = document.createElement("div");
  appearanceRow.className = "settings-panel__row";

  // 中文：界面字号——写根内联变量，仅缩放外壳（em 派生），不影响 iframe 内正文。
  // English: Interface size — writes the root inline variable; scales only the shell (em-derived) and
  //          never the iframe content.
  const uiSizeLabel = document.createElement("label");
  uiSizeLabel.className = "settings-panel__state";
  uiSizeLabel.textContent = "界面字号 ";
  const uiSizeSelect = document.createElement("select");
  for (const [value, text] of [["1", "标准"], ["1.125", "较大"], ["1.25", "大"], ["0.9", "紧凑"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    uiSizeSelect.appendChild(option);
  }
  uiSizeSelect.value = localStorage.getItem(UI_FONT_SCALE_KEY) ?? "1";
  uiSizeSelect.addEventListener("change", () => applyUiFontScale(uiSizeSelect.value));
  uiSizeLabel.appendChild(uiSizeSelect);

  // 中文：编辑字号——只作用于编辑器正文（HugeRTE iframe body）。
  // English: Editor size — applies only to the editor body (HugeRTE iframe body).
  const fontSizeLabel = document.createElement("label");
  fontSizeLabel.className = "settings-panel__state";
  fontSizeLabel.textContent = "编辑字号 ";
  fontSize = document.createElement("select");
  fontSize.id = "editor-font-size";
  for (const size of ["14px", "16px", "18px", "20px"]) {
    const option = document.createElement("option");
    option.value = size;
    option.textContent = size.replace("px", "");
    fontSize.appendChild(option);
  }
  const savedSize = localStorage.getItem("hia-hugerte.editor-font-size");
  fontSize.value = savedSize && Array.from(fontSize.options).some((o) => o.value === savedSize) ? savedSize : "16px";
  fontSize.addEventListener("change", applyEditorFontSize);
  fontSizeLabel.appendChild(fontSize);

  // 中文：菜单栏三态（W-hrt-P14 F3）——显示/精简/隐藏；隐藏行保留 0 高占位（外壳栅格对齐）。
  // English: Menubar three modes (W-hrt-P14 F3) — full/compact/hidden; the hidden row keeps a
  //          zero-height placeholder (shell grid alignment).
  const menubarLabel = document.createElement("label");
  menubarLabel.className = "settings-panel__state";
  menubarLabel.textContent = "菜单栏 ";
  const menubarSelect = document.createElement("select");
  for (const [value, text] of [["full", "显示"], ["compact", "精简"], ["hidden", "隐藏"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    menubarSelect.appendChild(option);
  }
  menubarSelect.value = menubarMode;
  menubarSelect.addEventListener("change", () => setMenubarMode(menubarSelect.value as MenubarMode));
  menubarLabel.appendChild(menubarSelect);
  appearanceRow.append(uiSizeLabel, fontSizeLabel, menubarLabel);
  appearanceSection.append(appearanceTitle, appearanceRow);
  panel.appendChild(appearanceSection);

  // 中文：版本区——当前版本 + 「打开下载页」（零网络：不在应用内请求远端）。
  // English: Version section — current version plus "open download page" (zero network: nothing is
  // requested from inside the app).
  const versionSection = document.createElement("div");
  versionSection.className = "settings-panel__section";
  const versionTitle = document.createElement("div");
  versionTitle.className = "settings-panel__title";
  versionTitle.textContent = "版本";
  const versionNote = document.createElement("div");
  versionNote.className = "settings-panel__note";
  versionNote.textContent = "本程序不联网检查更新、不会自动下载或替换自身；有新版本时请前往下载页手动替换。";
  const versionRow = document.createElement("div");
  versionRow.className = "settings-panel__row";
  const versionState = document.createElement("span");
  versionState.className = "settings-panel__state";
  versionState.textContent = "当前版本 —";
  const versionAction = document.createElement("button");
  versionAction.type = "button";
  versionAction.className = "settings-panel__action";
  versionAction.textContent = "打开下载页";
  versionAction.addEventListener("click", async () => {
    versionAction.disabled = true;
    try {
      await invoke<string>("open_releases_page");
      setStatus("已在浏览器中打开下载页");
    } catch (error) {
      setStatus(`打开下载页失败：${formatError(error)}`);
    } finally {
      versionAction.disabled = false;
    }
  });
  versionRow.append(versionState, versionAction);
  versionSection.append(versionTitle, versionNote, versionRow);
  panel.appendChild(versionSection);

  // 中文：点击面板外或再次点入口关闭（与历史下拉一致）。
  // English: Close on click outside or on the entry again (same as the history dropdown).
  panel.addEventListener("click", (event) => { if (event.target === panel) panel.remove(); });
  document.body.appendChild(panel);
  // 中文：外点关闭（2026-11-14 维护者反馈，与历史下拉同法）——mousedown 捕获级监听，目标不在
  //       面板内且不在入口按钮上即关闭；其他路径移除面板后监听自清理。
  // English: Close on outside click (maintainer feedback 2026-11-14, same as the history dropdown) —
  //       a capture-phase mousedown listener closes the panel when the target is neither inside the
  //       panel nor on the entry button; the listener self-cleans after other removal paths.
  const closeSettingsOnOutside = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !settingsButton.contains(target)) {
      closeSettingsPanel();
    }
  };
  // 中文：关闭器 = 移除面板 + 清外点监听 + 注销活动浮层引用。
  // English: The closer = remove the panel + detach the outside listener + unregister the active floater.
  const closeSettingsPanel = (): void => {
    panel.remove();
    document.removeEventListener("mousedown", closeSettingsOnOutside, true);
    if (activeFloaterCloser === closeSettingsPanel) activeFloaterCloser = null;
  };
  document.addEventListener("mousedown", closeSettingsOnOutside, true);
  activeFloaterCloser = closeSettingsPanel;

  // 中文：数据加载改走会话缓存（维护者 2026-11-14 定案）——有缓存直接渲染（零延迟）；无缓存
  //       （本会话首次打开）才各做一次查询并写入缓存。加载中的占位文案避免出现空白按钮。
  // English: Data loading now goes through the session cache (maintainer decision 2026-11-14) — with
  //       a cache the panel renders immediately (zero delay); without one (first open this session)
  //       a single query per value runs and populates the cache. Loading placeholders avoid empty
  //       buttons mid-load.
  if (associationCache) {
    renderAssociation(associationCache.registered, associationCache.currentExe);
  } else {
    assocState.textContent = "读取中…";
    assocAction.hidden = true;
    try {
      const status = await invoke<AssociationStatusPayload>("open_with_status");
      associationCache = status;
      renderAssociation(status.registered, status.currentExe);
    } catch {
      assocState.textContent = "状态未知";
      assocNote.textContent = "无法读取当前注册状态。";
    }
  }
  if (versionInfoCache) {
    headVersion.textContent = `v${versionInfoCache.version}`;
    versionState.textContent = `当前版本 ${versionInfoCache.version}`;
  } else {
    try {
      const info = await invoke<AppVersionInfoPayload>("app_version_info");
      versionInfoCache = info;
      headVersion.textContent = `v${info.version}`;
      versionState.textContent = `当前版本 ${info.version}`;
    } catch {
      versionState.textContent = "当前版本未知";
    }
  }
}

/** @lang zh-CN 专用确认：清空历史（复用模态壳，文案与确认按钮文案按清空场景临时替换并复原）。 / @lang en Dedicated confirm: clear history (reuses the modal shell; swaps and restores the confirm-button copy for the clear scenario). */
function confirmClearHistory(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const originalText = confirmDiscardButton.textContent;
    confirmDiscardButton.textContent = "清空历史";
    void showConfirmModal("将删除本机全部历史记录，且无法撤销。确定清空？").then((result) => {
      confirmDiscardButton.textContent = originalText;
      resolve(result);
    });
  });
}

/** @lang zh-CN 模态壳：显示给定文案并等待选择（Esc/取消=false，「确认」=true）。 / @lang en Modal shell: shows the given copy and awaits a choice (Esc/Cancel=false, confirm=true). */
function showConfirmModal(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let decided = false;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const finish = (discarded: boolean) => {
      if (decided) return;
      decided = true;
      confirmScrim.classList.remove("confirm-scrim--active");
      window.removeEventListener("keydown", onKeyDown, true);
      previousActive?.focus();
      resolve(discarded);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
    };
    confirmMessage.textContent = message;
    confirmScrim.classList.add("confirm-scrim--active");
    window.addEventListener("keydown", onKeyDown, true);
    confirmCancelButton.focus();
    confirmCancelButton.addEventListener("click", () => finish(false), { once: true });
    confirmDiscardButton.addEventListener("click", () => finish(true), { once: true });
  });
}

/** @lang zh-CN 把 RFC3339 时间戳转成菜单里的相对/日期短文案。 / @lang en Render an RFC3339 stamp as the menu's short relative/date text. */
function formatOpenedAt(stamp: string): string {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMinutes = Math.round((now - date.getTime()) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffMinutes < 60 * 24) return `${Math.round(diffMinutes / 60)} 小时前`;
  return date.toISOString().slice(0, 10);
}

async function saveDocument(forceSaveAs: boolean): Promise<void> {
  try {
    // 中文：源码视图开着先落盘源码编辑——保存必须读到源码框的最新文本，而不是上一次回写的内容。
    // English: With the source view open, flush source edits first — saving must observe the
    //       textarea's latest text, not the previous apply-back's content.
    await flushSourceEdits();
    restoreOriginalAssets();
    const content = readEditorContent();
    if (forceSaveAs || !state().path) {
      const result = await invoke<SaveResult | null>("save_document_as", { content, suggestedName: ensureHtmlExtension(getDocumentLabel(state().path)) });
      if (!result) return;
      // 中文：整体展开既有状态——丢字段（如 documentPrefix/Suffix）会破坏重组不变量。
      // English: Spread the existing state wholesale — dropping fields (e.g. documentPrefix/Suffix)
      //       would break the reassembly invariant.
      replaceActiveDocument({ ...state(), content, path: result.path, dirty: false });
    } else {
      await invoke("save_document", { path: state().path, content });
      replaceActiveDocument({ ...state(), content, dirty: false });
    }
    await applyDocumentToEditor(state());
    refreshDocumentHeader();
    setStatus("已保存");
  } catch (error) { setStatus(`保存失败：${formatError(error)}`); }
}

function formatError(error: unknown): string { return typeof error === "string" ? error : "发生未知错误。"; }

/** @lang zh-CN 目录树条目的 Rust 序列化形态（list_directory_tree 返回，camelCase）。 / @lang en Rust shape of a tree entry (from list_directory_tree, camelCase). */
interface TreeEntryPayload { name: string; isDir: boolean; size: number; isSupportedAsset: boolean; }

/** @lang zh-CN 历史记录条目（recent_files_load 返回；path 为打开时刻的完整路径）。 / @lang en A recent-file entry (from recent_files_load; path is the full path at open time). */
interface RecentFileEntryPayload { path: string; openedAt: string; }

/** @lang zh-CN 「不记录模式」开关（ADR-0004 第 3 条）：开启后不写新记录也不删除旧记录。 / @lang EN "No-record mode" (ADR-0004 §3): when on, neither new records are written nor old ones removed. */
let historyDisabled = localStorage.getItem("hia-hugerte.history-disabled") === "1";

/** @lang zh-CN 已展开文件夹的**绝对路径**集合（文档切换或浏览目录变化时重置为当前根）。 / @lang en Set of expanded folders by **absolute path** (reset to the current root when the document or browsing directory changes). */
const expandedDirs = new Set<string>();

/**
 * @lang zh-CN
 * 资源树当前浏览目录（绝对路径），初始为打开文档所在目录。面包屑与「向上」按钮直接修改它，
 * 与 Windows 资源管理器一致（ADR-0003 修订版）。
 * @lang en
 * The explorer's current browsing directory (absolute path), initially the opened document's
 * directory. The breadcrumb and Up button modify it directly, matching Windows Explorer
 * (ADR-0003 revised).
 */
let explorerRootPath = "";

/**
 * @lang zh-CN
 * 用户对目录树的显隐选择（维护者 2026-11-10 需求：右上切换按钮）。持久化到 localStorage
 * 落实 ADR-0003 第 6 条「折叠状态记入用户数据」——与历史「不记录模式」同一机制，随
 * WebView2 用户数据目录持久化；仅表达用户意愿，「有无文档」仍由浏览目录决定。
 * @lang en
 * The user's show/hide choice for the tree (maintainer request 2026-11-10: the top-right toggle).
 * Persisted to localStorage to honour ADR-0003 §6 "collapse state goes into user data" — the same
 * mechanism as the history no-record switch, persisted via the WebView2 user-data folder. It only
 * carries user intent; whether a document exists is still decided by the browsing directory.
 */
let explorerHiddenByUser = localStorage.getItem("hia-hugerte.explorer-hidden") === "1";

/** @lang zh-CN 侧栏宽度边界与默认值（px）：170 保证「向上」按钮与面包屑可读；520 之外编辑区已不可用。 / @lang en Sidebar width bounds and default (px): 170 keeps the Up button and breadcrumb readable; beyond 520 the editor is unusable. */
const EXPLORER_MIN_WIDTH = 170;
const EXPLORER_MAX_WIDTH = 520;
const EXPLORER_DEFAULT_WIDTH = 260;

/** @lang zh-CN 拖拽中的会话状态：pointerId、起点横坐标与起始宽度（pointer capture 下移动事件持续到达）。 / @lang en In-drag session state: pointerId, start X and start width (move events keep arriving under pointer capture). */
let explorerResizeDrag: { pointerId: number; startX: number; startWidth: number } | null = null;

/** @lang zh-CN 持久化的侧栏宽度（非法或缺失时回退默认 260）。 / @lang en The persisted sidebar width (falls back to the 260 default when missing or invalid). */
const storedExplorerWidth = Number(localStorage.getItem("hia-hugerte.explorer-width"));
let explorerWidth = Number.isFinite(storedExplorerWidth) && storedExplorerWidth >= EXPLORER_MIN_WIDTH ? storedExplorerWidth : EXPLORER_DEFAULT_WIDTH;

/**
 * @lang zh-CN
 * 把侧栏宽度夹进合法区间：固定 [170, 520] 再叠加动态上限「工作台宽 − 280」，保证编辑区
 * 始终保留约 280px；窗口极窄时下限优先（侧栏不会被夹成 0）。
 * @lang en
 * Clamp the sidebar width into its legal range: the fixed [170, 520] plus the dynamic cap
 * "workbench width − 280" so the editor always keeps roughly 280px; on very narrow windows the
 * floor wins (the sidebar never collapses to zero).
 */
function clampExplorerWidth(width: number): number {
  const dynamicMax = Math.max(EXPLORER_MIN_WIDTH, Math.min(EXPLORER_MAX_WIDTH, workbench.clientWidth - 280));
  return Math.min(dynamicMax, Math.max(EXPLORER_MIN_WIDTH, Math.round(width)));
}

/**
 * @lang zh-CN
 * 把当前宽度应用到侧栏布局并同步分隔条 separator 的 ARIA 值域；持久化由拖拽/键盘调整结束时
 * 统一写入 localStorage，避免拖拽期间每个 move 事件都落盘。
 * @lang en
 * Apply the current width to the sidebar layout and sync the resizer separator's ARIA range;
 * persistence is written once when a drag/keyboard adjustment ends, not on every move event.
 */
function applyExplorerWidth(): void {
  explorerPanel.style.flex = `0 0 ${explorerWidth}px`;
  explorerResizer.setAttribute("aria-valuemin", String(EXPLORER_MIN_WIDTH));
  explorerResizer.setAttribute("aria-valuemax", String(EXPLORER_MAX_WIDTH));
  explorerResizer.setAttribute("aria-valuenow", String(explorerWidth));
}

/**
 * @lang zh-CN
 * 同步「侧栏 / 分隔条 / 右上切换按钮」三者的显隐一致状态：浏览目录为空（无文档）时侧栏与
 * 分隔条隐藏、按钮禁用；用户手动隐藏优先于「有文档即显示」。按钮文案表达它将执行的动作。
 * @lang en
 * Keep the sidebar, resizer and top-right toggle mutually consistent: with an empty browsing
 * directory (no document) the sidebar and resizer hide and the button disables; a manual hide
 * outweighs "show when a document is open". The button label states the action it will perform.
 */
function updateExplorerVisibility(): void {
  const shouldShow = explorerRootPath !== "" && !explorerHiddenByUser;
  explorerPanel.hidden = !shouldShow;
  explorerResizer.hidden = !shouldShow;
  // 中文：显隐状态变化后同步工具栏的「目录树」按钮（图标形态 + aria-pressed）。
  // English: After the visibility changes, keep the toolbar's tree button in sync (icon shape +
  //          aria-pressed).
  renderAppToolbar();
}

/**
 * @lang zh-CN
 * 渲染资源树（ADR-0003 修订版 + 设计基线 v1.3）：模型为**绝对路径导航**，与 Windows 资源
 * 管理器一致。树以当前浏览目录为根，子行懒加载；目录行首是真实展开/收缩按钮（键盘可达），
 * 文件行单击选中、双击打开。面包屑与「向上」按钮直接改浏览目录；无文档时不显示侧栏。
 * @lang en
 * Render the explorer tree (ADR-0003 revised + design baseline v1.3): the model is **absolute
 * path navigation**, matching Windows Explorer. The tree is rooted at the current browsing
 * directory with lazily loaded children; directory rows carry a real expand/collapse button
 * (keyboard-reachable), files select on click and open on double click. The breadcrumb and the
 * Up button change the browsing directory directly; the sidebar hides when no document is open.
 */
async function renderExplorerTree(): Promise<void> {
  explorerTree.textContent = "";
  explorerPreview.hidden = true;
  const baseDir = state().baseDir;
  if (!baseDir) {
    updateExplorerVisibility();
    return;
  }
  updateExplorerVisibility();
  explorerScope.textContent = "浏览：可逐级导航（文档内容引用仍限于文档目录作用域）";
  renderBreadcrumb();
  const rootRow = buildTreeRow(
    { name: pathLeafName(explorerRootPath), isDir: true, size: 0, isSupportedAsset: false },
    explorerRootPath,
    expandedDirs.has(explorerRootPath)
  );
  rootRow.classList.add("tree__row--active");
  explorerTree.appendChild(rootRow);
  if (!expandedDirs.has(explorerRootPath)) {
    const hint = document.createElement("div");
    hint.className = "tree__empty";
    hint.textContent = "点行首按钮展开目录";
    explorerTree.appendChild(hint);
    return;
  }
  await appendTreeChildren(explorerTree, explorerRootPath, 1);
}

/** @lang zh-CN 取路径末段名（盘符根回退为盘符本身，如 "C:\" → "C:"）。 / @lang en Last path segment (drive roots fall back to the drive itself, e.g. "C:\" → "C:"). */
function pathLeafName(absolutePath: string): string {
  const trimmed = absolutePath.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : absolutePath;
}

/**
 * @lang zh-CN
 * 计算从 `fromDir` 到 `targetPath` 的相对引用路径（以反斜杠分隔、`..` 逐级上溯），
 * 供"插入相对引用"使用；两者不在同一盘符时退回绝对路径（无法用相对引用表达）。
 * @lang en
 * Compute the relative reference path from `fromDir` to `targetPath` (backslash-separated,
 * `..` per level) for "insert reference"; when they are on different drives it falls back to the
 * absolute path (no relative form exists).
 */
function relativePathFrom(fromDir: string, targetPath: string): string {
  const splitParts = (value: string) => value.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  const fromParts = splitParts(fromDir);
  const targetParts = splitParts(targetPath);
  // 中文：首段是盘符；不同盘符直接返回绝对路径。
  // English: The first segment is the drive; different drives return the absolute path.
  if (fromParts[0]?.toLowerCase() !== targetParts[0]?.toLowerCase()) return targetPath;
  let common = 0;
  while (common < fromParts.length && common < targetParts.length - 1 && fromParts[common].toLowerCase() === targetParts[common].toLowerCase()) {
    common += 1;
  }
  const ups = fromParts.length - common;
  const rest = targetParts.slice(common);
  return [...Array(ups).fill(".."), ...rest].join("/") || ".";
}

/**
 * @lang zh-CN
 * 归一化 Windows 路径：去掉 canonicalize 产生的 `\\?\` 扩展长度前缀与多余的尾部分隔符。
 * 该前缀是 Rust 侧内部形态，仅对文件系统 API 有意义；面包屑与路径拼接需要常规 `C:\...` 形式。
 * @lang en
 * Normalize a Windows path: strip the `\\?\` extended-length prefix produced by canonicalize and
 * trailing separators. That prefix is an internal Rust-side shape meaningful only to filesystem
 * APIs; breadcrumb rendering and path joining need the ordinary `C:\...` form.
 */
function normalizeWindowsPath(value: string): string {
  let normalized = value.replace(/^\\\\\?\\/, "");
  // 中文：UNC 的扩展形式（\\?\UNC\server\share）还原为 \\server\share。
  // English: Restore the UNC extended form (\\?\UNC\server\share) to \\server\share.
  if (/^UNC\\/i.test(normalized)) normalized = `\\\\${normalized.slice(4)}`;
  return normalized.replace(/[\\/]+$/, "");
}

/** @lang zh-CN 取父目录路径；已在盘符根时返回 null（向上按钮据此禁用）。 / @lang en Parent path, or null at a drive root (the Up button disables on null). */
function parentPath(absolutePath: string): string | null {
  const trimmed = absolutePath.replace(/[\\/]+$/, "");
  // 中文：盘符根（C: 或 C:\）没有可上的父级。
  // English: A drive root (C: or C:\) has no parent to ascend to.
  if (/^[A-Za-z]:$/.test(trimmed)) return null;
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (index < 0) return null;
  const parent = trimmed.slice(0, index);
  return parent === "" ? null : parent.endsWith(":") ? `${parent}\\` : parent;
}

/**
 * @lang zh-CN
 * 把绝对路径拆成面包屑段：`🖥 › C: › Users › admin › …`，每段携带其完整路径。
 * @lang en
 * Split an absolute path into breadcrumb segments: `🖥 › C: › Users › admin › …`, each carrying
 * its full path.
 */
function splitBreadcrumb(absolutePath: string): Array<{ name: string; path: string }> {
  const normalized = absolutePath.replace(/[\\/]+$/, "");
  const driveMatch = normalized.match(/^([A-Za-z]:)(.*)$/);
  if (!driveMatch) return [{ name: absolutePath, path: absolutePath }];
  const segments: Array<{ name: string; path: string }> = [{ name: driveMatch[1], path: `${driveMatch[1]}\\` }];
  let current = driveMatch[1];
  for (const part of driveMatch[2].split(/[\\/]/).filter(Boolean)) {
    current = `${current}\\${part}`;
    segments.push({ name: part, path: current });
  }
  return segments;
}

/**
 * @lang zh-CN
 * 渲染仿 Win11 资源管理器面包屑（维护者 2026-11-10 需求）：每段**可点击**（该段即变成浏览目录），
 * 并带**下拉箭头**——点击箭头列出该段的同级文件夹（Win11 行为）以便横向跳转；当前浏览目录段
 * 为选中态且不带下拉。同时维护「向上」按钮：到达盘符根时禁用。
 * @lang en
 * Render the Win11-Explorer-style breadcrumb (maintainer request 2026-11-10): every segment is
 * **clickable** (it becomes the browsing directory) and carries a **dropdown arrow** — clicking
 * the arrow lists that segment's sibling folders (Win11 behaviour) for lateral jumps; the current
 * browsing segment is marked current and has no dropdown. The Up button disables at a drive root.
 */
function renderBreadcrumb(): void {
  explorerBreadcrumb.textContent = "";
  const device = document.createElement("span");
  device.className = "explorer__crumb-device";
  // 中文：设备段用文字"此电脑"（对齐中文版 Win11；emoji 🖥 在中文系统字体栈下会渲染成方块）。
  // English: The device segment shows "此电脑" (matching Chinese Windows 11; the 🖥 emoji renders as a
  //       tofu box under the CJK system font stack).
  device.textContent = "此电脑";
  explorerBreadcrumb.appendChild(device);
  const segments = splitBreadcrumb(explorerRootPath);
  segments.forEach((segment) => {
    const isCurrent = segment.path.replace(/[\\/]+$/, "") === explorerRootPath.replace(/[\\/]+$/, "");
    const item = document.createElement("span");
    item.className = `explorer__crumb-item${isCurrent ? " explorer__crumb-item--current" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "explorer__crumb";
    button.textContent = segment.name;
    button.title = segment.path;
    button.addEventListener("click", () => { void setExplorerRoot(segment.path); });
    item.appendChild(button);
    if (!isCurrent) {
      // 中文：下拉箭头——列出该段所在目录的兄弟文件夹（Win11 的下拉行为）。
      // English: The dropdown arrow lists sibling folders of that segment's parent (Win11 behaviour).
      const caret = document.createElement("button");
      caret.type = "button";
      caret.className = "explorer__crumb-caret";
      caret.textContent = "▾";
      caret.title = "显示同级文件夹";
      caret.addEventListener("click", (event) => { event.stopPropagation(); void openCrumbDropdown(caret, segment.path); });
      item.appendChild(caret);
    }
    explorerBreadcrumb.appendChild(item);
  });
  explorerUpButton.disabled = parentPath(explorerRootPath) === null;
  // 中文：地址栏内容可能超宽——渲染后把当前段（最右）滚入视野，对齐 Win11 导航后的定位行为。
  // English: The bar can overflow — after rendering, scroll the current (rightmost) segment into
  //       view, matching Win11's post-navigation positioning.
  explorerBreadcrumb.scrollLeft = explorerBreadcrumb.scrollWidth;
}

/**
 * @lang zh-CN
 * 面包屑段的下拉：列出该段父目录下的所有文件夹（Win11 用下拉做横向跳转）。点击条目即把该
 * 文件夹设为浏览目录；点击其他地方或再次点击箭头关闭。
 * @lang en
 * Breadcrumb-segment dropdown: lists every folder under that segment's parent (Win11 uses the
 * dropdown for lateral jumps). Clicking an entry makes it the browsing directory; clicking
 * elsewhere or the arrow again closes it.
 */
async function openCrumbDropdown(anchor: HTMLElement, segmentPath: string): Promise<void> {
  document.querySelector(".explorer__dropdown")?.remove();
  const parent = parentPath(segmentPath) ?? segmentPath;
  let entries: TreeEntryPayload[] = [];
  try {
    entries = await invoke<TreeEntryPayload[]>("list_directory_tree", { absolutePath: parent });
  } catch {
    entries = [];
  }
  const folders = entries.filter((entry) => entry.isDir);
  const menu = document.createElement("div");
  menu.className = "explorer__dropdown";
  if (folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "explorer__dropdown-empty";
    empty.textContent = "（无同级文件夹）";
    menu.appendChild(empty);
  }
  for (const folder of folders) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "explorer__dropdown-item" + (folder.name === pathLeafName(segmentPath) ? " explorer__dropdown-item--active" : "");
    item.textContent = `📁 ${folder.name}`;
    item.addEventListener("click", () => {
      menu.remove();
      const next = parent.endsWith("\\") ? `${parent}${folder.name}` : `${parent}\\${folder.name}`;
      void setExplorerRoot(next);
    });
    menu.appendChild(item);
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  document.body.appendChild(menu);
  // 中文：点击别处关闭（一次性监听，避免累积）；同时注册为活动浮层——编辑 iframe 内的点击
  //       经 activeFloaterCloser 关闭本下拉（iframe 缺口同法修补）。
  // English: Close on outside click (one-shot listener, no accumulation); also registered as the
  //       active floater so a click inside the editor iframe closes this dropdown via
  //       activeFloaterCloser (same iframe-gap remedy).
  const close = (event: MouseEvent) => {
    if (!menu.contains(event.target as Node)) {
      menu.remove();
      document.removeEventListener("mousedown", close, true);
      if (activeFloaterCloser === closeCrumbDropdownMenu) activeFloaterCloser = null;
    }
  };
  const closeCrumbDropdownMenu = (): void => {
    menu.remove();
    document.removeEventListener("mousedown", close, true);
    if (activeFloaterCloser === closeCrumbDropdownMenu) activeFloaterCloser = null;
  };
  setTimeout(() => {
    document.addEventListener("mousedown", close, true);
    activeFloaterCloser = closeCrumbDropdownMenu;
  }, 0);
}

/**
 * @lang zh-CN
 * 切换浏览目录（绝对路径）：重置展开集合与选中项后重绘。目标是已存在的目录才会生效
 * （Rust 侧同样校验，这里提前避免无谓重绘）。
 * @lang en
 * Switch the browsing directory (absolute path): reset expansion and selection, then re-render.
 * Only existing directories take effect (Rust validates too; this avoids pointless re-renders).
 */
async function setExplorerRoot(absolutePath: string): Promise<void> {
  if (absolutePath === explorerRootPath) return;
  expandedDirs.clear();
  expandedDirs.add(absolutePath);
  explorerRootPath = absolutePath;
  selectedTreePath = null;
  await renderExplorerTree();
}

/**
 * @lang zh-CN
 * 向容器追加某目录一层的子行（懒加载一层；子目录再次展开时再取）。读取失败显示空态文案。
 * @lang en
 * Append one level of child rows for a directory (lazy per level; subdirectories fetch on
 * expand). Read failures render the empty-state text.
 */
async function appendTreeChildren(container: HTMLElement, directoryPath: string, indent: number): Promise<void> {
  let entries: TreeEntryPayload[] = [];
  try {
    entries = await invoke<TreeEntryPayload[]>("list_directory_tree", { absolutePath: directoryPath });
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tree__empty";
    empty.textContent = indent === 1 ? "目录为空或不可读" : "（空）";
    container.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    // 中文：子行一律用绝对路径标识——与浏览目录模型一致，双击打开、展开状态与预览都无需再换算。
    // English: Child rows are identified by absolute path — consistent with the browsing-directory
    //       model, so open-on-double-click, expansion and preview need no further conversion.
    const childPath = directoryPath.endsWith("\\") ? `${directoryPath}${entry.name}` : `${directoryPath}\\${entry.name}`;
    const row = buildTreeRow(entry, childPath, expandedDirs.has(childPath));
    row.classList.add(`tree__indent-${Math.min(indent, 3)}`);
    container.appendChild(row);
    if (entry.isDir && expandedDirs.has(childPath)) {
      await appendTreeChildren(container, childPath, indent + 1);
    }
  }
}

/**
 * @lang zh-CN
 * 构造单行（交互语义，维护者 2026-11-10 定案）：**单击 = 高亮选中**（tree__row--selected，
 * 目录与文件皆可；文件同时弹资源预览），**双击 = 直接打开**该文件为新 Tab（openFromPath，
 * 含脏确认与历史记录）；键盘 Enter = 选中态下的"打开"（无障碍等价双击）。
 * 目录行行首仍有真实展开/收缩按钮（不与选中冲突）。
 * @lang en
 * Build one row (interaction semantics, maintainer 2026-11-10): **single click = select/highlight**
 * (tree__row--selected, both dirs and files; files also show the asset preview), **double click =
 * open the file in a new tab** (openFromPath, which runs the dirty confirm and records history);
 * keyboard Enter opens the selected row (accessible double-click equivalent). Directory rows keep
 * their real expand/collapse button, independent of selection.
 */
function buildTreeRow(entry: TreeEntryPayload, entryPath: string, expanded: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `tree__row${entry.isSupportedAsset ? " tree__row--asset" : ""}`;
  row.dataset.path = entryPath;
  if (selectedTreePath === entryPath) row.classList.add("tree__row--selected");
  row.setAttribute("role", "treeitem");
  row.tabIndex = 0;
  if (entry.isDir) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree__caret";
    toggle.textContent = expanded ? "▾" : "▸";
    toggle.title = expanded ? "收起目录" : "展开目录";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", (event) => { event.stopPropagation(); void toggleExpandDir(entryPath); });
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "tree__caret";
    row.appendChild(spacer);
  }
  const icon = document.createElement("span");
  icon.textContent = entry.isDir ? "📁" : entry.isSupportedAsset ? "🖼" : "📄";
  row.appendChild(icon);
  const name = document.createElement("span");
  name.textContent = entry.name;
  row.appendChild(name);
  // 中文：单击选中（重绘使高亮稳定持久，不靠 :hover）；双击打开——click 与 dblclick 并存时
  //       单击会先触发一次，属预期行为（先高亮再打开）。
  // English: Single click selects (re-render keeps the highlight stable, not :hover-dependent);
  //       double click opens — with both handlers the first click of a double click fires once,
  //       which is the expected select-then-open flow.
  row.addEventListener("click", () => {
    selectedTreePath = entryPath;
    if (entry.isSupportedAsset) void showAssetPreview(entryPath);
    else explorerPreview.hidden = true;
    renderTreeSelection();
  });
  row.addEventListener("dblclick", () => {
    if (entry.isDir) { void toggleExpandDir(entryPath); return; }
    // 中文：双击文件 = 以绝对路径打开为新 Tab（openFromPath 内含脏确认与历史记录）。
    // English: Double-click a file opens it in a new tab by absolute path (openFromPath runs the
    //       dirty confirm and records history).
    void openFromPath(entryPath);
  });
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectedTreePath = entryPath;
      renderTreeSelection();
      if (!entry.isDir) void openFromPath(entryPath);
    }
  });
  return row;
}

/** @lang zh-CN 树内当前选中项的绝对路径（会话内状态；文档切换或浏览目录变化时清空）。 / @lang en Absolute path of the selected tree entry (session state; cleared when the document or browsing directory changes). */
let selectedTreePath: string | null = null;

/**
 * @lang zh-CN
 * 只更新选中高亮（不整树重绘，避免双击时因重绘吞掉第二次 click 的体验波动）：
 * 按 `data-path` 精确匹配清除旧选中、点亮新选中。
 * @lang en
 * Update only the selection highlight (no full re-render, so the second click of a double click
 * is not swallowed by a repaint): clear and light rows by exact `data-path` match.
 */
function renderTreeSelection(): void {
  explorerTree.querySelectorAll(".tree__row--selected").forEach((row) => row.classList.remove("tree__row--selected"));
  if (selectedTreePath === null) return;
  explorerTree.querySelector(`.tree__row[data-path="${CSS.escape(selectedTreePath)}"]`)?.classList.add("tree__row--selected");
}

/**
 * @lang zh-CN
 * 把树内相对路径解析为绝对路径（树的相对基准 = 文档目录，与资源解析不同——资源允许
 * ../，树的根就是文档目录，双击打开需要完整路径供 open_document_path 校验）。
 * @lang en
 * Resolve a tree-relative path to an absolute one (the tree's base is the document directory,
 * unlike asset resolution which allows ../; opening needs the full path for open_document_path
 * validation).
 */
/**
 * @lang zh-CN
 * 展开/收缩一个目录：更新集合后整树重绘（数据量小，重绘简单可靠且保持展开状态）。
 * @lang en
 * Expand or collapse one directory: update the set and re-render the whole tree (small data;
 * re-render is simple, reliable and preserves expansion state).
 */
async function toggleExpandDir(entryPath: string): Promise<void> {
  if (expandedDirs.has(entryPath)) expandedDirs.delete(entryPath);
  else expandedDirs.add(entryPath);
  await renderExplorerTree();
}

/**
 * @lang zh-CN
 * 资源预览卡（绝对路径入参）：显示名称、**相对活动文档目录的引用路径**与大小；「插入相对
 * 引用」把该相对路径插入编辑器（convert_urls:false 契约下由 HugeRTE 原样保留）。
 * 注意：预览读取走 `resolve_document_asset`，仍受文档目录作用域约束——作用域外的资源
 * 可在树中看到但预览为空（ADR-0003 修订版第 4 条）。
 * @lang en
 * Asset preview card (absolute path input): name, the **path relative to the active document's
 * directory**, and size; "insert reference" places that relative path into the editor (kept
 * verbatim under the convert_urls:false contract). Note: the preview read goes through
 * `resolve_document_asset` and stays bound by the document-directory scope — assets outside it
 * are visible in the tree but preview empty (ADR-0003 revised, §4).
 */
async function showAssetPreview(absolutePath: string): Promise<void> {
  const baseDir = state().baseDir;
  if (!baseDir) return;
  const relativePath = relativePathFrom(baseDir, absolutePath);
  try {
    const dataUri = await invoke<string | null>("resolve_document_asset", { baseDir, relativePath });
    if (!dataUri) return;
    const size = Math.round((dataUri.length - dataUri.indexOf(",") - 1) * 3 / 4 / 1024);
    explorerPreview.hidden = false;
    explorerPreview.textContent = "";
    const title = document.createElement("b");
    title.textContent = pathLeafName(absolutePath);
    const ref = document.createElement("div");
    ref.className = "explorer__ref";
    ref.textContent = `相对引用：${relativePath} · 约 ${size} KB`;
    const insert = document.createElement("button");
    insert.type = "button";
    insert.textContent = "插入相对引用";
    insert.addEventListener("click", () => {
      editor?.insertContent(`<img src="${relativePath}" alt="">`);
      editor?.nodeChanged();
    });
    explorerPreview.append(title, ref, insert);
  } catch {
    explorerPreview.hidden = true;
  }
}

/**
 * @lang zh-CN
 * 侧栏三态模式（W-hrt-P14 F2，调研报告 §4「一栏多态」结论 + 维护者 2026-11-16 定案）：
 * `files` = 既有资源树（文件浏览），`outline` = 文档大纲（标题层级），`search` = 搜索结果
 * （跨已打开 Tab）。当前版本无多语言机制，文字为中文；英文文案取最短词的适配规则
 * （`Files / Outline / Search`）已随方案 B 定案登记，待多语言周期启用。
 * @lang en
 * Sidebar modes (W-hrt-P14 F2, per the survey §4 "one column, multiple states" conclusion and
 * the maintainer's 2026-11-16 decision): `files` = the existing explorer tree, `outline` = the
 * document heading outline, `search` = results across all open tabs. The current build has no
 * i18n so labels are Chinese; the shortest-word English adaptation (`Files / Outline / Search`)
 * is already registered with the option-B decision and awaits the i18n cycle.
 */
type SidebarMode = "files" | "outline" | "search";

/** @lang zh-CN 侧栏模式持久化键（与目录树显隐、侧栏宽度同一 localStorage 机制）。 / @lang en Persistence key for the sidebar mode (same localStorage mechanism as tree visibility and sidebar width). */
const SIDEBAR_MODE_KEY = "hia-hugerte.sidebar-mode";

/** @lang zh-CN 模式条定义：图标 + 文字（方案 B 定案稿④：文案取最短词；title/aria-label 恒为全称）。 / @lang en Mode-strip definitions: icon + label (option-B final draft §4: shortest words; title/aria-label always carry the full word). */
const SIDEBAR_MODE_DEFS: ReadonlyArray<{ mode: SidebarMode; icon: IconName; label: string }> = [
  { mode: "files", icon: "folders", label: "资源" },
  { mode: "outline", icon: "list", label: "大纲" },
  { mode: "search", icon: "search", label: "搜索" }
];

/**
 * @lang zh-CN
 * 当前侧栏模式：从 localStorage 读取并在非法值时回落 `files`。持久化让"下次启动还在上次的
 * 视图"（与侧栏宽度/显隐同一用户数据机制，ADR-0003 第 6 条精神）。
 * @lang en
 * The current sidebar mode: read from localStorage with `files` as the fallback for invalid
 * values. Persisting means the next launch reopens the last view (same user-data mechanism as
 * the sidebar width/visibility, in the spirit of ADR-0003 §6).
 */
let sidebarMode: SidebarMode = (() => {
  const stored = localStorage.getItem(SIDEBAR_MODE_KEY);
  return stored === "outline" || stored === "search" || stored === "files" ? stored : "files";
})();

/**
 * @lang zh-CN
 * 渲染侧栏模式条（方案 B 定案形态：`图标(flex:none) + 文字(min-width:0 省略)`、不换行）。
 * 语义用 `role=tablist/tab` + `aria-selected`；文字仅在视觉上可能被省略，`title` 恒为全称。
 * @lang en
 * Render the sidebar mode strip (option-B final form: `icon (flex:none) + label (min-width:0,
 * ellipsis)`, no wrapping). Semantics via `role=tablist/tab` + `aria-selected`; the label may be
 * visually ellipsized but `title` always carries the full word.
 */
function renderSidebarModeStrip(): void {
  explorerModes.textContent = "";
  for (const definition of SIDEBAR_MODE_DEFS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "explorer__mode";
    button.dataset.mode = definition.mode;
    button.setAttribute("role", "tab");
    button.title = definition.label;
    button.setAttribute("aria-label", definition.label);
    button.setAttribute("aria-selected", String(definition.mode === sidebarMode));
    if (definition.mode === sidebarMode) button.classList.add("explorer__mode--active");
    button.appendChild(createIcon(definition.icon));
    const label = document.createElement("span");
    label.className = "explorer__mode-text";
    label.textContent = definition.label;
    button.appendChild(label);
    explorerModes.appendChild(button);
  }
}

/**
 * @lang zh-CN
 * 应用当前侧栏模式到 DOM：切换三个面板的 `hidden`、同步模式条选中态；`outline`/`search`
 * 模式在进入时各重渲染一次（保证内容与当前文档一致）。不写 localStorage（写入只发生在
 * setSidebarMode 的用户切换路径，启动恢复不覆写已存值）。
 * @lang en
 * Apply the current sidebar mode to the DOM: toggle the three panes' `hidden`, sync the strip's
 * selected states; the `outline`/`search` modes re-render once on entry (keeping their content
 * consistent with the current document). No localStorage write — persisting happens only in the
 * user-initiated setSidebarMode path, so startup restore never overwrites the stored value.
 */
function applySidebarMode(): void {
  explorerPaneFiles.hidden = sidebarMode !== "files";
  explorerPaneOutline.hidden = sidebarMode !== "outline";
  explorerPaneSearch.hidden = sidebarMode !== "search";
  for (const button of explorerModes.querySelectorAll<HTMLButtonElement>(".explorer__mode")) {
    const active = button.dataset.mode === sidebarMode;
    button.classList.toggle("explorer__mode--active", active);
    button.setAttribute("aria-selected", String(active));
  }
  if (sidebarMode === "outline") renderDocumentOutline();
  if (sidebarMode === "search") runSidebarSearch();
}

/**
 * @lang zh-CN
 * 用户切换侧栏模式（模式条点击）：持久化意愿后应用；重复点击同一模式为空操作（避免无谓
 * 重渲染打断搜索输入焦点）。
 * @lang en
 * Switch the sidebar mode by user action (mode-strip click): persist the choice, then apply;
 * re-clicking the active mode is a no-op (avoids pointless re-renders disturbing search input
 * focus).
 */
function setSidebarMode(mode: SidebarMode): void {
  if (mode === sidebarMode) return;
  sidebarMode = mode;
  localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  applySidebarMode();
}

/** @lang zh-CN 大纲折叠集合：以**编辑器 body 内的活节点**为键（WeakSet）——输入时未改动的标题节点保持折叠状态，文档切换后旧节点被回收、状态自然失效。 / @lang en Outline collapse set keyed by the **live nodes in the editor body** (WeakSet) — untouched heading nodes keep their collapsed state while typing; after a document switch the old nodes are garbage-collected and their state expires naturally. */
const outlineCollapsedNodes = new WeakSet<Element>();

/** @lang zh-CN 大纲条目的中间形态：层级（1–6）、标题文本与对应的活节点（跳转用；编辑器未就绪时为 null，仅展示）。 / @lang en The intermediate outline entry: level (1–6), heading text and its live node (for jumping; null when the editor is not ready — display only). */
interface OutlineEntry { level: number; text: string; node: Element | null; }

/**
 * @lang zh-CN
 * 收集活动文档的标题大纲：优先取**编辑器 body 内的活节点**（`h1`–`h6`，文档序，跳转与折叠
 * 状态都以同一节点对象为锚）；编辑器未就绪时回退为解析 `state().content`（只展示、不可跳转）。
 * 空标题显示占位文案。依赖"Change/Input/Undo/Redo 后 state().content 与 body 同步"的既有事实。
 * @lang en
 * Collect the active document's heading outline: prefer the **live nodes in the editor body**
 * (`h1`–`h6` in document order — jumps and collapse state anchor to the same node objects);
 * when the editor is not ready, fall back to parsing `state().content` (display only, no jump).
 * Empty headings show placeholder text. Relies on the existing invariant that state().content
 * and the body stay in sync after Change/Input/Undo/Redo.
 */
function collectOutlineEntries(): OutlineEntry[] {
  if (editor) {
    return Array.from(editor.getBody().querySelectorAll("h1,h2,h3,h4,h5,h6"), (node) => ({
      level: Number(node.tagName.charAt(1)),
      text: (node.textContent ?? "").trim() || "（空标题）",
      node
    }));
  }
  // 中文：浏览器验证早期（编辑器尚未挂载）的兜底路径——解析静态内容，仅保证大纲可见。
  // English: Fallback for the early browser-verification phase (editor not mounted yet) — parse
  //          the static content so the outline is still visible.
  const parsed = new DOMParser().parseFromString(state().content, "text/html");
  return Array.from(parsed.querySelectorAll("h1,h2,h3,h4,h5,h6"), (node) => ({
    level: Number(node.tagName.charAt(1)),
    text: (node.textContent ?? "").trim() || "（空标题）",
    node: null
  }));
}

/**
 * @lang zh-CN
 * 渲染文档大纲（维护者 2026-11-16 定案：需要层级参考线与可折叠）：
 * - 每行按标题层级缩进（CSS 变量 `--outline-level` 驱动缩进与参考线）；
 * - 有下级标题的行渲染真实折叠按钮（`aria-expanded`），折叠状态存于 WeakSet；
 * - 单击行跳转编辑器内对应标题（caret 置于标题开头并滚动到视野）；
 * - 折叠父级时其所有后代行隐藏（按"最近的更小层级祖先"链推导）。
 * @lang en
 * Render the document outline (maintainer decision 2026-11-16: needs hierarchy guides and
 * collapsibility):
 * - rows indent by heading level (CSS variable `--outline-level` drives indent and guides);
 * - rows with deeper headings render a real collapse button (`aria-expanded`); collapsed state
 *   lives in the WeakSet;
 * - clicking a row jumps to that heading in the editor (caret at the heading start, scrolled
 *   into view);
 * - a collapsed parent hides all its descendant rows (derived along the "nearest smaller-level
 *   ancestor" chain).
 */
function renderDocumentOutline(): void {
  explorerOutline.textContent = "";
  const entries = collectOutlineEntries();
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "outline__empty";
    empty.textContent = "文档没有标题（h1–h6），无法生成大纲";
    explorerOutline.appendChild(empty);
    return;
  }
  // 中文：折叠可见性推导——每项的"最近更小层级前项"是其父级；父级隐藏或折叠则本项隐藏。
  //       标题数量级小（典型 < 100），O(n²) 回看足够且无额外数据结构。
  // English: Collapsed-visibility derivation — for each entry the nearest previous entry with a
  //          smaller level is its parent; a hidden or collapsed parent hides this entry. Heading
  //          counts are small (typically < 100), so the O(n²) look-back suffices without extra
  //          data structures.
  const hiddenFlags: boolean[] = new Array(entries.length).fill(false);
  for (let index = 1; index < entries.length; index += 1) {
    let parentIndex = -1;
    for (let lookback = index - 1; lookback >= 0; lookback -= 1) {
      if (entries[lookback].level < entries[index].level) { parentIndex = lookback; break; }
    }
    // 中文：父级节点取局部变量——TS 对可变索引的属性收窄不跨表达式，局部化后 WeakSet.has 才可类型安全。
    // English: Extract the parent node into a local — TS does not carry property narrowing across
    //          expressions on a mutable index; the local makes WeakSet.has type-safe.
    const parentNode = parentIndex >= 0 ? entries[parentIndex].node : null;
    hiddenFlags[index] = parentIndex >= 0 && (hiddenFlags[parentIndex] || (parentNode !== null && outlineCollapsedNodes.has(parentNode)));
  }
  entries.forEach((entry, index) => {
    if (hiddenFlags[index]) return;
    // 中文：有下级 = 紧随其后的条目层级更深（大纲的直接子级），据此渲染折叠按钮或占位。
    // English: Has children = the immediately following entry is deeper (a direct child in the
    //          outline), which decides between a collapse button and a spacer.
    const hasChildren = index + 1 < entries.length && entries[index + 1].level > entry.level;
    const collapsed = entry.node !== null && outlineCollapsedNodes.has(entry.node);
    const row = document.createElement("div");
    row.className = "outline__row";
    row.style.setProperty("--outline-level", String(entry.level));
    row.setAttribute("role", "treeitem");
    row.tabIndex = 0;
    if (hasChildren) {
      const caret = document.createElement("button");
      caret.type = "button";
      caret.className = "outline__caret";
      caret.textContent = collapsed ? "▸" : "▾";
      caret.title = collapsed ? "展开此节" : "折叠此节";
      caret.setAttribute("aria-expanded", String(!collapsed));
      caret.addEventListener("click", (event) => {
        event.stopPropagation();
        if (entry.node === null) return;
        if (outlineCollapsedNodes.has(entry.node)) outlineCollapsedNodes.delete(entry.node);
        else outlineCollapsedNodes.add(entry.node);
        renderDocumentOutline();
      });
      row.appendChild(caret);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "outline__caret";
      row.appendChild(spacer);
    }
    const label = document.createElement("span");
    label.className = "outline__text";
    label.textContent = entry.text;
    label.title = entry.text;
    row.appendChild(label);
    const jump = (): void => { if (entry.node) jumpToHeading(entry.node); };
    row.addEventListener("click", jump);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); jump(); }
    });
    explorerOutline.appendChild(row);
  });
}

/**
 * @lang zh-CN
 * 跳转到编辑器内的标题节点：直接把 Range 设在标题元素内部起点（`(node, 0)`）——caret 落在
 * 标题**内部**，继续输入会写进标题（实测教训：`select(node)`/`select(node, false)` 的折叠点
 * 落在父级的标题之前，输入会插到标题外）。随后滚动该标题进入视野并聚焦编辑器。
 * @lang en
 * Jump to a heading node in the editor: place the Range directly at the heading element's
 * internal start (`(node, 0)`) so the caret sits **inside** the heading and typing continues
 * within it (measured lesson: the collapse points of `select(node)` / `select(node, false)` land
 * in the parent before the node, so typing would insert outside the heading). Then scroll the
 * heading into view and focus the editor.
 */
function jumpToHeading(node: Element): void {
  if (!editor) return;
  editor.focus();
  const ownerDocument = node.ownerDocument ?? document;
  const range = ownerDocument.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  editor.selection.setRng(range);
  editor.selection.scrollIntoView();
}

/** @lang zh-CN 大纲模式可见时重渲染（编辑事件与文档切换的统一刷新入口；不可见时零开销）。 / @lang en Re-render when the outline mode is visible (the unified refresh entry for edit events and document switches; zero cost while hidden). */
function refreshOutlineIfVisible(): void {
  if (sidebarMode === "outline") renderDocumentOutline();
}

/** @lang zh-CN 搜索面板的单文件命中行上限（超出以"仅显示前 N 行命中"提示，避免长文档刷爆面板）。 / @lang en Per-file hit-row cap for the search panel (excess shows a "first N rows" notice so a long document cannot flood the panel). */
const SEARCH_MAX_HITS_PER_FILE = 20;

/**
 * @lang zh-CN
 * 渲染侧栏搜索结果（维护者 2026-11-16 定案：范围为**所有已打开 Tab**；全局搜索另列后期）。
 * 对每个 Tab 的 `document.content` 做纯扫描（`scanContentLineHits`，行号 = HTML 源码行，与
 * F1 源码视图同坐标系），按文件分组展示：组头为文件名 + 命中行数；命中行展示"行号 + 上下文
 * 片段（命中高亮）"。单击命中行：切换到该 Tab 并尝试把命中定位到编辑器正文（caret + 滚动）；
 * 命中不在正文文本（标签/属性）时仅切换并说明。活动 Tab 的 content 由编辑事件实时同步，
 * 后台 Tab 的 content 在切离时快照，二者均可直接扫描。
 * @lang en
 * Render the sidebar search results (maintainer decision 2026-11-16: scope = **all open tabs**;
 * a global search stays deferred). Each tab's `document.content` is scanned purely
 * (`scanContentLineHits`; line numbers = HTML source lines, the same coordinate system as the
 * F1 source view) and grouped by file: the group head shows the file name plus hit count, and
 * each hit row shows "line number + context snippet (match highlighted)". Clicking a hit row
 * switches to that tab and tries to reveal the match in the editor body (caret + scroll); when
 * the match lives in tags/attributes rather than body text, the tab switches with an
 * explanatory status. The active tab's content is synced live by edit events and background
 * tabs snapshot theirs on switch-away, so both are directly scannable.
 */
function runSidebarSearch(): void {
  explorerSearchResults.textContent = "";
  const query = explorerSearchInput.value;
  // 中文：空查询显示引导文案（不显示"未找到"，避免误解为搜索无果）。
  // English: A blank query shows the guidance text (not "no results", which would imply a real
  //          search came up empty).
  if (query.trim().length === 0) {
    const hint = document.createElement("div");
    hint.className = "explorer__search-empty";
    hint.textContent = "输入关键字，在所有打开的文档中查找";
    explorerSearchResults.appendChild(hint);
    return;
  }
  let groupsWithHits = 0;
  tabs.forEach((tab, index) => {
    const scan = scanContentLineHits(tab.document.content, query, SEARCH_MAX_HITS_PER_FILE);
    if (scan.hits.length === 0) return;
    groupsWithHits += 1;
    const group = document.createElement("div");
    group.className = "explorer__search-group";
    const head = document.createElement("div");
    head.className = "explorer__search-group-head";
    const name = document.createElement("span");
    name.className = "explorer__search-group-name";
    name.textContent = `${index === activeIndex ? "● " : ""}${getDocumentLabel(tab.document.path)}`;
    name.title = getDocumentLabel(tab.document.path);
    const count = document.createElement("span");
    count.className = "explorer__search-group-count";
    count.textContent = scan.truncated ? `${scan.hits.length}+ 行` : `${scan.hits.length} 行`;
    head.append(name, count);
    group.appendChild(head);
    for (const hit of scan.hits) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "explorer__search-hit";
      const lineBadge = document.createElement("span");
      lineBadge.className = "explorer__search-line";
      lineBadge.textContent = String(hit.line);
      const snippet = document.createElement("span");
      snippet.className = "explorer__search-snippet";
      // 中文：片段用 textContent/mark 三段拼装——不拼 HTML，杜绝把文档内容当标记注入。
      // English: The snippet assembles three text-bearing parts (textContent/mark) — no HTML
      //          concatenation, so document content can never be injected as markup.
      if (hit.before) snippet.appendChild(document.createTextNode(hit.before));
      const mark = document.createElement("mark");
      mark.textContent = hit.match;
      snippet.appendChild(mark);
      if (hit.after) snippet.appendChild(document.createTextNode(hit.after));
      row.append(lineBadge, snippet);
      row.addEventListener("click", () => {
        // 中文：跳转 = 切换 Tab + 正文定位；先切 Tab（异步换内容），再找正文文本命中。
        // English: Jump = switch tab + reveal in body; switch first (async content swap), then
        //          look for the match inside the body text.
        void switchToTab(index).then(() => {
          const revealed = revealFirstTextMatch(query);
          setStatus(revealed ? `已定位第 ${hit.line} 行命中（源码行号）` : "已切换文档；该命中位于标签或属性中，未定位正文");
        });
      });
      group.appendChild(row);
    }
    if (scan.truncated) {
      const more = document.createElement("div");
      more.className = "explorer__search-more";
      more.textContent = `仅显示前 ${SEARCH_MAX_HITS_PER_FILE} 行命中`;
      group.appendChild(more);
    }
    explorerSearchResults.appendChild(group);
  });
  if (groupsWithHits === 0) {
    const empty = document.createElement("div");
    empty.className = "explorer__search-empty";
    empty.textContent = "未找到命中";
    explorerSearchResults.appendChild(empty);
  }
}

/**
 * @lang zh-CN
 * 在编辑器正文中查找查询的首个文本命中并定位：遍历 body 的文本节点（大小写不敏感），
 * 命中后聚焦编辑器、用原生 Range 选中文本并滚动到视野。仅匹配**正文文本**——标签名/属性值
 * 中的命中定位不到（调用方据此给出说明性状态）。
 * @lang en
 * Find the first text hit of the query in the editor body and reveal it: walk the body's text
 * nodes (case-insensitive); on a hit, focus the editor, select the text with a native Range and
 * scroll it into view. Only **body text** matches — hits inside tag names/attribute values
 * cannot be revealed (the caller explains that in the status line).
 */
function revealFirstTextMatch(query: string): boolean {
  if (!editor) return false;
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  const body = editor.getBody();
  const ownerDocument = body.ownerDocument ?? document;
  const walker = ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const lowerQuery = trimmed.toLowerCase();
  for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
    const text = current.nodeValue ?? "";
    const at = text.toLowerCase().indexOf(lowerQuery);
    if (at < 0) continue;
    // 中文：先聚焦再设选区（聚焦可能重置选区），最后滚动——顺序保证定位稳定。
    // English: Focus first, then set the selection (focusing may reset it), scroll last — the
    //          order keeps the reveal stable.
    editor.focus();
    const range = ownerDocument.createRange();
    range.setStart(current, at);
    range.setEnd(current, at + trimmed.length);
    editor.selection.setRng(range);
    editor.selection.scrollIntoView();
    return true;
  }
  return false;
}

/** @lang zh-CN 搜索模式可见时重扫（编辑事件与文档切换的统一刷新入口；保留输入框内容与焦点）。 / @lang en Re-scan when the search mode is visible (the unified refresh entry for edit events and document switches; keeps the input's value and focus). */
function refreshSearchIfVisible(): void {
  if (sidebarMode === "search") runSidebarSearch();
}

/**
 * @lang zh-CN
 * 源码视图三形态（W-hrt-P14 F1，原型 v1 稿 4/稿 5 + 评审 #4/#5 定案）：`modal` = HugeRTE
 * code 插件的模态对话框（现状默认），`split` = 并排双栏（左可视化右源码、分隔条可拖、
 * 同步滚动为设置项默认开），`full` = 整区切换（源码占满编辑区，可视化窗格隐藏）。
 * 模式持久化到 localStorage（与侧栏模式同一机制）。
 * @lang en
 * Source view forms (W-hrt-P14 F1, prototype v1 drafts 4/5 + review decisions #4/#5): `modal` =
 * HugeRTE code plugin's modal dialog (the current default), `split` = side by side (visual left,
 * source right, draggable separator, sync scroll as a setting on by default), `full` = full-area
 * switch (source fills the editor region, visual pane hidden). The mode persists to localStorage
 * (same mechanism as the sidebar mode).
 */
type SourceViewMode = "modal" | "split" | "full";

/** @lang zh-CN 源码视图模式持久化键。 / @lang en Persistence key for the source view mode. */
const SOURCE_VIEW_KEY = "hia-hugerte.source-view";
/** @lang zh-CN 源码栏宽度持久化键。 / @lang en Persistence key for the source pane width. */
const SOURCE_WIDTH_KEY = "hia-hugerte.source-width";
/** @lang zh-CN 同步滚动设置持久化键（评审 #4：设置项，默认开）。 / @lang en Persistence key for the sync-scroll setting (review #4: a setting, on by default). */
const SOURCE_SYNC_SCROLL_KEY = "hia-hugerte.source-sync-scroll";

/** @lang zh-CN 源码栏宽度边界与默认值（px）：220 保证源码可读；再为可视化窗格保留至少 320px。 / @lang en Source pane width bounds and default (px): 220 keeps the source readable; at least 320px stays reserved for the visual pane. */
const SOURCE_MIN_WIDTH = 220;
const SOURCE_DEFAULT_WIDTH = 340;

/** @lang zh-CN 当前源码视图模式（持久化；非法值回落 modal）。 / @lang en The current source view mode (persisted; invalid values fall back to modal). */
let sourceViewMode: SourceViewMode = (() => {
  const stored = localStorage.getItem(SOURCE_VIEW_KEY);
  return stored === "split" || stored === "full" || stored === "modal" ? stored : "modal";
})();

/** @lang zh-CN 持久化的源码栏宽度（非法或缺失时回退默认 340）。 / @lang en The persisted source pane width (falls back to the 340 default when missing or invalid). */
const storedSourceWidth = Number(localStorage.getItem(SOURCE_WIDTH_KEY));
let sourceWidth = Number.isFinite(storedSourceWidth) && storedSourceWidth >= SOURCE_MIN_WIDTH ? storedSourceWidth : SOURCE_DEFAULT_WIDTH;

/** @lang zh-CN 同步滚动设置（默认开；checkbox 即时改写并持久化）。 / @lang en The sync-scroll setting (on by default; the checkbox flips and persists it immediately). */
let sourceSyncScrollEnabled = localStorage.getItem(SOURCE_SYNC_SCROLL_KEY) !== "0";

/** @lang zh-CN 源码栏拖拽会话状态（与侧栏分隔条同一 pointer-capture 模式）。 / @lang en In-drag session state for the source separator (same pointer-capture pattern as the explorer's). */
let sourceResizeDrag: { pointerId: number; startX: number; startWidth: number } | null = null;

/** @lang zh-CN 把源码栏宽度夹进合法区间：固定 [220, 工作台−320]，窗口极窄时下限优先。 / @lang en Clamp the source pane width into its legal range: fixed [220, workbench−320]; the floor wins on very narrow windows. */
function clampSourceWidth(width: number): number {
  const dynamicMax = Math.max(SOURCE_MIN_WIDTH, workbench.clientWidth - 320);
  return Math.min(dynamicMax, Math.max(SOURCE_MIN_WIDTH, Math.round(width)));
}

/**
 * @lang zh-CN
 * 把当前源码视图模式应用到 DOM：`data-source-view` 驱动 CSS（full 隐藏编辑窗格）、面板/分隔条
 * 显隐、宽度 flex（split 固定值 / full 吃满）、同步滚动开关仅 split 有意义故随之显隐；分隔条
 * ARIA 值域同步。
 * @lang en
 * Apply the current source view mode to the DOM: `data-source-view` drives the CSS (full hides the
 * editor pane), pane/separator visibility, the width flex (fixed for split / filling for full), and
 * the sync-scroll toggle (only meaningful in split, so it hides elsewhere); separator ARIA values
 * stay in sync.
 */
function applySourceViewLayout(): void {
  workbench.dataset.sourceView = sourceViewMode;
  sourcePane.hidden = sourceViewMode === "modal";
  sourceResizer.hidden = sourceViewMode !== "split";
  sourcePane.style.flex = sourceViewMode === "full" ? "1 1 auto" : `0 0 ${sourceWidth}px`;
  sourceSyncLabel.hidden = sourceViewMode !== "split";
  sourceResizer.setAttribute("aria-valuemin", String(SOURCE_MIN_WIDTH));
  sourceResizer.setAttribute("aria-valuemax", String(Math.max(SOURCE_MIN_WIDTH, workbench.clientWidth - 320)));
  sourceResizer.setAttribute("aria-valuenow", String(sourceWidth));
}

/** @lang zh-CN 源码回写的异步序号：仅最新一次 apply 允许落到编辑器（防快速输入时旧异步覆盖新内容）。 / @lang en Sequence for source apply-backs: only the latest apply may land in the editor (prevents a slower older async from overwriting newer text). */
let sourceApplySequence = 0;

/** @lang zh-CN 防抖计时器与在途回写 Promise（flush 用其等待在途回写完成）。 / @lang en Debounce timer and the in-flight apply promise (flush awaits it). */
let sourceApplyTimer: number | null = null;
let sourceApplyInFlight: Promise<void> | null = null;

/**
 * @lang zh-CN
 * 把源码框文本回写到编辑器（防抖的落点）：先把内容与脏标记写入活动 Tab 快照，再经
 * `rewriteRelativeAssetsInHtml` 生成可显示内容注入编辑器（资源引用还原为 data URI 供 WebView
 * 显示），随后手工恢复 dirty（applyDocumentToEditor 的 setDirty(false) 会清掉）并刷新头部。
 * 已知取舍：`undoManager.clear()` 使回写后编辑器 undo 栈清空（与切 Tab 同款）。
 * @lang en
 * Write the source textarea's text back into the editor (the debounce target): first record the
 * content and dirty flag into the active tab's snapshot, then build displayable content via
 * `rewriteRelativeAssetsInHtml` (asset refs re-inlined as data URIs for the WebView) and inject it,
 * then manually restore dirty (applyDocumentToEditor's setDirty(false) clears it) and refresh the
 * header. Recorded trade-off: `undoManager.clear()` empties the editor's undo stack after a
 * write-back (same as tab switching).
 */
function applySourceTextToEditor(): Promise<void> {
  if (!editor || sourceViewMode === "modal") return Promise.resolve();
  const text = sourceTextarea.value;
  const sequence = ++sourceApplySequence;
  isReplacingContent = true;
  // 中文：源码视图允许编辑 head/doctype——回写前对整页文本重新拆分，刷新前缀/后缀缓存
  //       （保持「前缀+body+后缀 === content」不变量，ADR-0006）。
  // English: The source view may edit head/doctype — re-split the full-page text on apply-back to
  //       refresh the prefix/suffix caches (keeping the "prefix + body + suffix === content"
  //       invariant, ADR-0006).
  const parts = splitDocumentParts(text);
  replaceActiveDocument({ ...state(), content: text, documentPrefix: parts.prefix, documentSuffix: parts.suffix, dirty: true });
  const run = async (): Promise<void> => {
    try {
      const displayContent = await rewriteRelativeAssetsInHtml(parts.body, state().baseDir);
      // 中文：回写期间用户可能继续输入（新序号已开）——旧异步到此作废，避免整段覆盖新文本。
      // English: The user may keep typing during the write-back (a newer sequence exists) — the
      //          older async aborts here so it cannot overwrite the newer text wholesale.
      if (sequence !== sourceApplySequence || !editor) return;
      editor.setContent(displayContent);
      editor.undoManager.clear();
      editor.setDirty(false);
      replaceActiveDocument({ ...state(), dirty: true });
      refreshDocumentHeader();
      refreshOutlineIfVisible();
      refreshSearchIfVisible();
    } finally {
      // 中文：仅最新一次回写负责复位 isReplacingContent（被更新的回写接手时不复位，防漏保护窗口）。
      // English: Only the latest apply resets isReplacingContent (a superseded apply leaves it set
      //          for its successor, keeping the guard window intact).
      if (sequence === sourceApplySequence) {
        sourceApplyInFlight = null;
        isReplacingContent = false;
      }
    }
  };
  sourceApplyInFlight = run();
  return sourceApplyInFlight;
}

/** @lang zh-CN 源码输入的 300ms 防抖：连续键入只在停顿后回写一次（大文档整段 setContent 的开销可控）。 / @lang en A 300ms debounce for source typing: continuous keystrokes write back once after the pause (keeps whole-text setContent cost bounded on large documents). */
function scheduleSourceApply(): void {
  if (sourceApplyTimer !== null) window.clearTimeout(sourceApplyTimer);
  sourceApplyTimer = window.setTimeout(() => {
    sourceApplyTimer = null;
    void applySourceTextToEditor();
  }, 300);
}

/**
 * @lang zh-CN
 * 立即落盘源码编辑（保存/切 Tab/关 Tab/打开/退出源码视图前的统一闸口）：有待执行防抖则取消并
 * 立即回写；有在途回写则等它完成——保证后续 `readEditorContent()` 读到源码框的最新文本。
 * @lang en
 * Flush pending source edits (the single gate before save/tab-switch/tab-close/open/leaving the
 * source view): cancel and run a pending debounce immediately, and await any in-flight apply —
 * so the following `readEditorContent()` observes the textarea's latest text.
 */
async function flushSourceEdits(): Promise<void> {
  if (sourceApplyTimer !== null) {
    window.clearTimeout(sourceApplyTimer);
    sourceApplyTimer = null;
    await applySourceTextToEditor();
    return;
  }
  if (sourceApplyInFlight) await sourceApplyInFlight;
}

/**
 * @lang zh-CN
 * 编辑器 → 源码框镜像（可视化窗格编辑时保持源码框同步）：`force` 用于文档整体换入
 * （切 Tab/新建/打开——必须刷新，即使源码框仍聚焦，否则旧文档文本会被下一次回写误写进新文档）；
 * 常规编辑镜像跳过聚焦中的源码框（防 caret 冲突），并保留滚动位置。
 * @lang en
 * Editor → source-textarea mirror (keeps the source in sync while editing the visual pane): `force`
 * serves wholesale document swaps (tab switch/new/open — must refresh even when the textarea is
 * focused, otherwise the previous document's text would be written into the new one by the next
 * apply-back); ordinary mirrors skip a focused textarea (caret conflict) and preserve scroll.
 */
function refreshSourceTextFromEditor(force = false): void {
  if (sourceViewMode === "modal" || !editor) return;
  if (!force && document.activeElement === sourceTextarea) return;
  const previousScrollTop = sourceTextarea.scrollTop;
  sourceTextarea.value = state().content;
  sourceTextarea.scrollTop = previousScrollTop;
}

/**
 * @lang zh-CN
 * 切换源码视图形态（「查看」菜单入口）：离开源码形态先 flush（模态下不读源码框）；进入
 * split/full 用 `readEditorContent()`（含资源引用还原）填充源码框并聚焦；模式持久化。
 * @lang en
 * Switch the source view form (View-menu entries): leaving a source form flushes first (the modal
 * form never reads the textarea); entering split/full fills the textarea via `readEditorContent()`
 * (asset refs restored) and focuses it; the mode persists.
 */
async function setSourceViewMode(mode: SourceViewMode): Promise<void> {
  if (mode === sourceViewMode) return;
  if (sourceViewMode !== "modal") await flushSourceEdits();
  sourceViewMode = mode;
  localStorage.setItem(SOURCE_VIEW_KEY, mode);
  applySourceViewLayout();
  if (mode !== "modal") {
    sourceTextarea.value = readEditorContent();
    sourceTextarea.focus();
  }
}

/** @lang zh-CN 同步滚动的互斥锁：程序化滚动触发的事件在下一帧前被忽略，防两向映射互相追问。 / @lang en The sync-scroll mutex: programmatic scrolls ignore resulting events until the next frame, so the two mappings cannot feed back into each other. */
let sourceScrollSyncLock = false;

/** @lang zh-CN 把编辑器滚动位置按比例映射到源码框（split 且开关打开时）。 / @lang en Map the editor's scroll position onto the source textarea proportionally (in split with the toggle on). */
function syncScrollFromEditorToSource(): void {
  if (!sourceSyncScrollEnabled || sourceViewMode !== "split" || sourceScrollSyncLock) return;
  const editorScrollElement = editor?.getDoc()?.scrollingElement ?? null;
  if (!editorScrollElement) return;
  const maxEditor = editorScrollElement.scrollHeight - editorScrollElement.clientHeight;
  const maxSource = sourceTextarea.scrollHeight - sourceTextarea.clientHeight;
  if (maxEditor <= 0 || maxSource <= 0) return;
  sourceScrollSyncLock = true;
  sourceTextarea.scrollTop = (editorScrollElement.scrollTop / maxEditor) * maxSource;
  // 中文：用短计时器释放互斥锁而非 rAF——滚动事件在渲染步派发（先于计时器），真实浏览器同样
  //       安全；rAF 在部分嵌入式环境会被节流导致锁死（2026-11-17 探针实测）。
  // English: Release the mutex with a short timer instead of rAF — scroll events dispatch in the
  //       rendering step (before timers), so this stays safe in real browsers; rAF gets throttled
  //       in some embedded environments and would deadlock the lock (measured in the 2026-11-17
  //       probe).
  window.setTimeout(() => { sourceScrollSyncLock = false; }, 30);
}

/** @lang zh-CN 把源码框滚动位置按比例映射回编辑器（split 且开关打开时）。 / @lang en Map the source textarea's scroll position back onto the editor proportionally (in split with the toggle on). */
function syncScrollFromSourceToEditor(): void {
  if (!sourceSyncScrollEnabled || sourceViewMode !== "split" || sourceScrollSyncLock) return;
  const editorScrollElement = editor?.getDoc()?.scrollingElement ?? null;
  if (!editorScrollElement) return;
  const maxEditor = editorScrollElement.scrollHeight - editorScrollElement.clientHeight;
  const maxSource = sourceTextarea.scrollHeight - sourceTextarea.clientHeight;
  if (maxEditor <= 0 || maxSource <= 0) return;
  sourceScrollSyncLock = true;
  editorScrollElement.scrollTop = (sourceTextarea.scrollTop / maxSource) * maxEditor;
  // 中文：同上——计时器释放互斥锁，兼容 rAF 被节流的环境。
  // English: Same as above — release the mutex with a timer, tolerating environments where rAF is
  //       throttled.
  window.setTimeout(() => { sourceScrollSyncLock = false; }, 30);
}

/**
 * @lang zh-CN
 * 启动参数多文件（ADR-0005 第 3 条）：全部开为 Tab（首个活动），解除初版"仅开第一个"限制；
 * 达上限时对剩余文件提示。
 * @lang en
 * Startup multi-file (ADR-0005 §3): every file opens as a tab (first active), lifting the
 * initial "first file only" limit; remaining files get a notice when the cap is hit.
 */
async function openStartupDocuments(): Promise<void> {
  try {
    const documents = await invoke<DocumentPayload[]>("get_startup_documents");
    if (documents.length === 0) return;
    if (editor) {
      const content = readEditorContent();
      replaceActiveDocument({ ...state(), content });
    }
    let nextTabs = tabs;
    let skipped = 0;
    for (const payload of documents) {
      const appended = appendDocumentTab(nextTabs, documentFromPayload(payload));
      if (!appended) { skipped += 1; continue; }
      nextTabs = appended;
      // 中文：启动参数打开同样计入历史（ADR-0004：「打开过」即记录；openPayload 之外的打开路径
      //       也必须落记录，否则启动文件的快捷重开缺失——回归冒烟发现的缺陷）。
      // English: Startup-arg opens count toward history too (ADR-0004: "opened" means recorded;
      //       open paths outside openPayload must record as well, otherwise quick reopen of
      //       startup files is missing — defect surfaced by the release smoke).
      if (!historyDisabled && payload.path) void invoke("recent_files_record", { path: payload.path }).catch(() => undefined);
    }
    tabs = nextTabs;
    await switchToTab(1 >= tabs.length ? 0 : 1);
    setStatus(skipped > 0 ? `已打开 ${documents.length - skipped} 个传入文件；${skipped} 个因标签页上限被跳过` : documents.length > 1 ? `已通过系统文件入口打开 ${documents.length} 个文件` : "已通过系统文件入口打开");
  } catch (error) { setStatus(`启动文件打开失败：${formatError(error)}`); }
}

// 中文：应用级菜单栏与工具栏（`W-hrt-P12` 定案方案二）——顶部结构为 Banner / 菜单栏 / 工具栏 / Tab 条。
//       齿轮图标作设置入口；文档操作全部由工具栏与「文件」菜单承担（Banner 内不再有按钮行）。
// English: Application menu bar and toolbar (`W-hrt-P12`, decided option B) — the top structure is
//       Banner / menu bar / toolbar / tab strip. The gear icon is the settings entry; all document
//       actions live in the toolbar and the File menu (no button row inside the Banner any more).
settingsButton.appendChild(createIcon("settings", 20));
settingsButton.addEventListener("click", () => void toggleSettingsPanel());
// 中文：启动时应用持久化的界面字号（只影响外壳）。编辑器正文字号在编辑器初始化后单独应用。
// English: Apply the persisted interface font scale at startup (shell only). The editor body size is
//          applied separately after the editor initialises.
applyUiFontScale(localStorage.getItem(UI_FONT_SCALE_KEY) ?? "1");
renderAppMenubar();
renderAppToolbar();
// 中文：侧栏三态（W-hrt-P14 F2）——渲染模式条、恢复持久化模式，并绑定切换与搜索输入事件。
// English: Sidebar three modes (W-hrt-P14 F2) — render the mode strip, restore the persisted
//       mode, and bind the switch and search-input events.
renderSidebarModeStrip();
applySidebarMode();
explorerModes.addEventListener("click", (event) => {
  // 中文：closest 取按钮（点击落在图标/文字子元素上也能命中）；dataset.mode 缺失时忽略。
  // English: closest() reaches the button even when the click lands on the icon/label child;
  //          a missing dataset.mode is ignored.
  const target = (event.target as HTMLElement).closest<HTMLElement>(".explorer__mode");
  if (target?.dataset.mode === "files" || target?.dataset.mode === "outline" || target?.dataset.mode === "search") {
    setSidebarMode(target.dataset.mode);
  }
});
// 中文：搜索输入即扫（scanContentLineHits 为线性纯扫描，20 个 Tab 内可接受；如后续大文档
//       造成卡顿再引入节流——记录为已知取舍）。
// English: Scan as the user types (scanContentLineHits is a linear pure scan, acceptable for up
//          to 20 tabs; add throttling later only if large documents stutter — a recorded
//          trade-off).
explorerSearchInput.addEventListener("input", () => refreshSearchIfVisible());
// 中文：源码视图（W-hrt-P14 F1）接线——同步滚动开关（即时持久化）、源码输入防抖回写、
//       源码框滚动反向映射、分隔条拖拽与键盘微调、启动恢复布局与宽度。
// English: Source view (W-hrt-P14 F1) wiring — the sync-scroll toggle (persisted immediately),
//       debounced apply-back on source input, reverse scroll mapping, separator drag and keyboard
//       nudges, and startup restore of layout and width.
sourceSyncCheckbox.checked = sourceSyncScrollEnabled;
sourceSyncCheckbox.addEventListener("change", () => {
  sourceSyncScrollEnabled = sourceSyncCheckbox.checked;
  localStorage.setItem(SOURCE_SYNC_SCROLL_KEY, sourceSyncScrollEnabled ? "1" : "0");
});
sourceTextarea.addEventListener("input", () => scheduleSourceApply());
sourceTextarea.addEventListener("scroll", syncScrollFromSourceToEditor);
// 中文：源码栏在右侧——拖分隔条向左（dx<0）才是加宽，方向与左侧的资源管理器分隔条相反；
//       键盘同理（←加宽、→收窄）。
// English: The source pane sits on the right — dragging the separator left (dx<0) widens it, the
//       opposite of the explorer's left-side separator; keyboard mirrors that (← widens, → narrows).
sourceResizer.addEventListener("pointerdown", (event) => {
  if (sourceResizer.hidden) return;
  sourceResizeDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: sourceWidth };
  sourceResizer.setPointerCapture(event.pointerId);
  document.body.classList.add("source-resizing");
});
sourceResizer.addEventListener("pointermove", (event) => {
  if (!sourceResizeDrag || event.pointerId !== sourceResizeDrag.pointerId) return;
  sourceWidth = clampSourceWidth(sourceResizeDrag.startWidth - (event.clientX - sourceResizeDrag.startX));
  applySourceViewLayout();
});
const endSourceResize = (event: PointerEvent): void => {
  if (!sourceResizeDrag || event.pointerId !== sourceResizeDrag.pointerId) return;
  sourceResizeDrag = null;
  document.body.classList.remove("source-resizing");
  localStorage.setItem(SOURCE_WIDTH_KEY, String(sourceWidth));
};
sourceResizer.addEventListener("pointerup", endSourceResize);
sourceResizer.addEventListener("pointercancel", endSourceResize);
sourceResizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  sourceWidth = clampSourceWidth(sourceWidth + (event.key === "ArrowLeft" ? 16 : -16));
  applySourceViewLayout();
  localStorage.setItem(SOURCE_WIDTH_KEY, String(sourceWidth));
});
sourceWidth = clampSourceWidth(sourceWidth);
applySourceViewLayout();
explorerUpButton.addEventListener("click", () => {
  const parent = parentPath(explorerRootPath);
  if (parent) void setExplorerRoot(parent);
});
// 中文：屏蔽外壳区域的 WebView2 默认右键菜单（维护者 2026-11-12 反馈）：外壳不是浏览器——
//       返回/刷新/打印/另存为等动作与编辑器外壳语义冲突（「刷新」还会整页重载外壳丢状态）。
//       范围仅限外壳；编辑 iframe 内由 HugeRTE 的 contextmenu_never_use_native 选项负责
//       （原生菜单永不弹、HugeRTE 自带菜单保留）。不提供自定义右键菜单（未要求）。
// English: Suppress the WebView2 default context menu over the shell (maintainer feedback
//       2026-11-12): the shell is not a browser — Back/Reload/Print/Save-as conflict with
//       editor-shell semantics ("Reload" would also reload the shell and drop state). Scope is
//       the shell only; inside the editor iframe HugeRTE's contextmenu_never_use_native option
//       takes care of it (native menu never shows, HugeRTE's own menu is preserved). No custom
//       context menu is provided (not requested).
document.addEventListener("contextmenu", (event) => event.preventDefault());
// 中文：地址栏鼠标滚轮横向滚动——纵向增量转为 scrollLeft；触控板与 shift+滚轮的 deltaX 走原生
//       路径不动，无横向溢出时不拦截事件（维护者 2026-11-10 反馈：地址栏超长无法滚动）。
//       【插桩】wheel 事件数据写入状态栏供 2026-11-12 失效排查，定位根因后移除。
// English: Wheel-to-horizontal scrolling for the address bar — the vertical delta maps onto
//       scrollLeft; touchpad and shift+wheel deltaX keep the native path, and with no horizontal
//       overflow the event is not intercepted (maintainer feedback 2026-11-10: an overlong
//       address bar could not be scrolled).
//       [INSTRUMENTATION] wheel event data is written to the status bar for the 2026-11-12
//       failure investigation; remove once the root cause is fixed.
explorerBreadcrumb.addEventListener("wheel", (event) => {
  if (event.deltaY === 0 || explorerBreadcrumb.scrollWidth <= explorerBreadcrumb.clientWidth) return;
  event.preventDefault();
  explorerBreadcrumb.scrollLeft += event.deltaY;
}, { passive: false });
// 中文：拖拽分隔条调整侧栏宽度（维护者 2026-11-10 需求）：pointerdown 记录起点并捕获指针，
//       指针移出 6px 条后拖拽继续；pointerup 才把最终宽度写入 localStorage。
// English: Drag the resizer to set the sidebar width (maintainer request 2026-11-10):
//       pointerdown records the origin and captures the pointer so dragging continues after the
//       pointer leaves the 6px strip; pointerup writes the final width to localStorage.
explorerResizer.addEventListener("pointerdown", (event) => {
  if (explorerResizer.hidden) return;
  explorerResizeDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: explorerWidth };
  explorerResizer.setPointerCapture(event.pointerId);
  document.body.classList.add("explorer-resizing");
});
explorerResizer.addEventListener("pointermove", (event) => {
  if (!explorerResizeDrag || event.pointerId !== explorerResizeDrag.pointerId) return;
  explorerWidth = clampExplorerWidth(explorerResizeDrag.startWidth + (event.clientX - explorerResizeDrag.startX));
  applyExplorerWidth();
});
const endExplorerResize = (event: PointerEvent): void => {
  if (!explorerResizeDrag || event.pointerId !== explorerResizeDrag.pointerId) return;
  explorerResizeDrag = null;
  document.body.classList.remove("explorer-resizing");
  localStorage.setItem("hia-hugerte.explorer-width", String(explorerWidth));
};
explorerResizer.addEventListener("pointerup", endExplorerResize);
explorerResizer.addEventListener("pointercancel", endExplorerResize);
explorerResizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  // 中文：分隔条键盘可达（与树内按钮同一可及性基线）：方向键按 16px 微调，右=变宽、左=变窄。
  // English: The resizer is keyboard-reachable (same accessibility bar as the in-tree buttons):
  //       arrow keys adjust by 16px — Right widens, Left narrows.
  event.preventDefault();
  explorerWidth = clampExplorerWidth(explorerWidth + (event.key === "ArrowRight" ? 16 : -16));
  applyExplorerWidth();
  localStorage.setItem("hia-hugerte.explorer-width", String(explorerWidth));
});
// 中文：初始应用持久化的宽度与显隐状态（浏览器验证模式下同样安全：无文档 → 按钮禁用、侧栏隐藏）。
// English: Apply the persisted width and visibility once at startup (safe in browser verification
//       mode too: no document → button disabled, sidebar hidden).
explorerWidth = clampExplorerWidth(explorerWidth);
applyExplorerWidth();
updateExplorerVisibility();
window.addEventListener("resize", () => {
  // 中文：窗口变窄时把宽度重新夹回合法区间，防止侧栏挤压编辑区（拖拽进行中不打断）。
  // English: Re-clamp the width when the window shrinks so the sidebar cannot squeeze the editor
  //       (an in-flight drag is not interrupted).
  if (explorerResizeDrag) return;
  const clamped = clampExplorerWidth(explorerWidth);
  if (clamped !== explorerWidth) {
    explorerWidth = clamped;
    applyExplorerWidth();
  }
});
// 中文：字号选择器在设置面板内按需创建并自行绑定 change（见 toggleSettingsPanel），此处不再绑定。
// English: The size selector is created on demand inside the settings panel and binds its own change
//          handler (see toggleSettingsPanel); no binding here.

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

if (!isTauriRuntime) {
  // 中文：浏览器兼容性验证模式下无原生历史存储与设置命令，隐藏设置齿轮（菜单/工具栏中的相应项
  //       在点击时会自然失败并给出状态提示，不额外隐藏——保持结构可验证）。
  // English: No native history storage or settings commands in browser verification mode, so hide
  //       the settings gear (matching menu/toolbar entries simply fail with a status message when
  //       clicked — they stay visible so the structure remains verifiable).
  settingsButton.hidden = true;
}

if (isTauriRuntime) {
  void getCurrentWindow().onDragDropEvent(async (event) => {
    if (event.payload.type === "over") { dropIndicator.classList.add("drop-indicator--active"); return; }
    if (event.payload.type === "leave") { dropIndicator.classList.remove("drop-indicator--active"); return; }
    dropIndicator.classList.remove("drop-indicator--active");
    if (event.payload.type === "drop") {
      // 中文：拖放多文件 → 依次各开一 Tab（ADR-0005 第 3 条）；openPayload 内部含脏确认与上限提示。
      // English: Multi-file drop → one tab per file, in order (ADR-0005 §3); openPayload handles
      //       the dirty confirm and the cap notice internally.
      for (const path of event.payload.paths) {
        await openFromPath(path);
      }
    }
  });
}

void initializeEditor()
  .then(() => isTauriRuntime ? openStartupDocuments() : setStatus("浏览器兼容性验证模式"))
  .catch((error: unknown) => setStatus(`编辑器初始化失败：${formatError(error)}`));
