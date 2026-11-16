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
import { buildDiscardConfirmMessage, createNewDocument, documentFromPayload, ensureHtmlExtension, getDocumentLabel, type DocumentPayload, type DocumentState } from "./document";
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
import { createIcon } from "./ui/icons";
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
        <aside id="explorer" class="explorer" aria-label="资源管理" hidden>
          <div class="explorer__head"><span>资源管理 <span id="explorer-scope" class="explorer__scope"></span></span><button id="explorer-refresh" type="button" title="刷新目录树" class="explorer__refresh">⟳</button></div>
          <div class="explorer__breadcrumb-row">
            <button id="explorer-up" type="button" title="向上（浏览上一级目录）" class="explorer__up" aria-label="向上">↑</button>
            <nav id="explorer-breadcrumb" class="explorer__breadcrumb" aria-label="目录路径"></nav>
          </div>
          <div id="explorer-tree" class="tree" role="tree"></div>
          <div id="explorer-preview" class="explorer__preview" hidden></div>
        </aside>
        <div id="explorer-resizer" class="explorer__resizer" role="separator" aria-orientation="vertical" aria-label="调整资源管理器宽度" title="拖动调整资源管理器宽度（聚焦后可用左右方向键微调）" tabindex="0" hidden></div>
        <div class="editor-pane"><textarea id="hugerte-editor" aria-label="HTML 文档编辑器"></textarea></div>
      </div>
      <div id="drop-indicator" class="drop-indicator" aria-hidden="true">释放以打开 HTML 文件</div>
    </section>
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
const explorerPanel = requiredElement<HTMLElement>("#explorer");
const explorerTree = requiredElement<HTMLDivElement>("#explorer-tree");
const explorerScope = requiredElement<HTMLSpanElement>("#explorer-scope");
const explorerPreview = requiredElement<HTMLDivElement>("#explorer-preview");
const explorerBreadcrumb = requiredElement<HTMLElement>("#explorer-breadcrumb");
const explorerUpButton = requiredElement<HTMLButtonElement>("#explorer-up");
const explorerResizer = requiredElement<HTMLDivElement>("#explorer-resizer");
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

/** @lang zh-CN 应用级菜单项定义：点击动作或调用子菜单构建函数（原型稿 2「文件」菜单定案，其余菜单为提案）。 / @lang en Application menu item: a click action or a submenu builder (the File menu is decided per prototype draft 2; the others are proposals). */
interface AppMenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  /** 中文：true 时该项在菜单中渲染为分隔线（label/action 忽略）。 / English: When true the entry renders as a separator (label/action ignored). */
  separator?: boolean;
}

/** @lang zh-CN 应用级菜单定义（标签 + 菜单项）。 / @lang en Application menu definition (label + items). */
interface AppMenu { label: string; items: () => AppMenuItem[]; }

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
function renderAppMenubar(): void {
  menubarElement.textContent = "";
  /** @lang zh-CN 菜单集（按定案顺序；「编辑/插入/格式」当前为空提案占位——对应能力由编辑器内工具栏/HugeRTE 菜单承担）。 / @lang en Menu set in the decided order ("Edit/Insert/Format" are empty proposal placeholders — those capabilities live in the in-editor toolbar / HugeRTE menus). */
  const menus: AppMenu[] = [
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
        { label: "关于 HIA HugeRTE", action: () => setStatus("HIA HugeRTE — 基于 HugeRTE 与 Tauri 的便携 HTML 编辑器") }
      ]
    }
  ];

  for (const menu of menus) {
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
      if (openOwner?.getAttribute("data-owner") === menu.label) { openOwner.remove(); return; }
      openOwner?.remove();
      openAppMenu(menu, button);
    });
    menubarElement.appendChild(button);
  }
}

/** @lang zh-CN 在给定菜单按钮下方打开下拉（定位用 fixed，随滚动不漂移）。 / @lang en Open a dropdown under the given menu button (fixed positioning; does not drift on scroll). */
function openAppMenu(menu: AppMenu, anchor: HTMLElement): void {
  const panel = document.createElement("div");
  panel.className = "app-menu";
  panel.setAttribute("role", "menu");
  panel.setAttribute("data-owner", menu.label);
  for (const item of menu.items()) {
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
  const rect = anchor.getBoundingClientRect();
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.top = `${Math.round(rect.bottom + 2)}px`;
  document.body.appendChild(panel);
  // 中文：外点 / Esc 关闭（捕获级，一次注册、关闭时自移除）。
  // English: Close on outside click / Esc (capture phase, registered once and removed on close).
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
  document.addEventListener("mousedown", closeOnOutside, true);
  document.addEventListener("keydown", closeOnEscape, true);
  activeFloaterCloser = closeMenu;
  // 中文：首项自动聚焦（键盘用户可直接方向键/回车）。
  // English: Auto-focus the first item so keyboard users can continue immediately.
  panel.querySelector<HTMLButtonElement>(".app-menu__item")?.focus();
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
  restoreOriginalAssets();
  editor?.save();
  return editor?.getContent() ?? editorTarget.value;
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
  return document.documentElement?.outerHTML ?? html;
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
  const displayContent = await rewriteRelativeAssetsInHtml(documentState.content, documentState.baseDir);
  editor.setContent(displayContent);
  editor.undoManager.clear();
  editor.setDirty(false);
}

function applyEditorFontSize(): void {
  // 中文：字号选择器现在只存在于设置面板内（按需创建）；未打开面板时使用持久化值。
  // English: The size selector now only exists inside the settings panel (created on demand); when the
  //          panel has never opened, fall back to the persisted value.
  const selectedSize = fontSize?.value ?? localStorage.getItem("hia-hugerte.editor-font-size") ?? "16px";
  localStorage.setItem("hia-hugerte.editor-font-size", selectedSize);
  editor?.getBody().style.setProperty("font-size", selectedSize);
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
    statusbar: true,
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
        // 中文：编辑事件只作用于活动 Tab；把当前内容与脏标记写回该 Tab 的快照。
        // English: Edit events affect only the active tab; write content and the dirty flag back
        //       into that tab's snapshot.
        replaceActiveDocument({ ...state(), content: instance.getContent(), dirty: true });
        refreshDocumentHeader();
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
  // 中文：状态栏计数中文化（维护者 2026-11-15 反馈："7 words" 需显示字符数等）——HugeRTE 内置
  //       计数为英文单值（"{0} words"）。方案：把内置计数按钮替换为中文双显示元素（字符 + 词），
  //       并监听插件派发的 `wordCountUpdate` 事件（携带 words/characters 统计）持续刷新。
  //       词数语义：HugeRTE 按通用分词规则计数，每个 CJK 字符计为一个词；字符数含空格。
  // English: Status-bar count in Chinese (maintainer feedback 2026-11-15: "7 words" should show
  //       character counts etc.) — the built-in count is a single English value ("{0} words").
  //       Approach: replace the built-in count button with a Chinese dual display element
  //       (characters + words) and refresh it from the plugin's `wordCountUpdate` event (which
  //       carries words/characters stats). Word semantics: HugeRTE counts by universal word
  //       segmentation — each CJK character counts as one word; character count includes spaces.
  const builtInCount = document.querySelector(".tox-statusbar__wordcount");
  if (builtInCount) {
    const countDisplay = document.createElement("span");
    countDisplay.className = "tox-statusbar__wordcount";
    countDisplay.textContent = "字符 0 · 词 0";
    builtInCount.replaceWith(countDisplay);
    editor.on("wordCountUpdate", (event: { wordCount: { words: number; characters: number } }) => {
      countDisplay.textContent = `字符 ${event.wordCount.characters} · 词 ${event.wordCount.words}`;
    });
  }
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

  // 中文：编辑器外观区——编辑字号（自原独立选项行移入，`W-hrt-P12`）；字号变更即时作用于编辑器并持久化。
  // English: Editor appearance section — editor font size (moved here from the former standalone options
  //          row in `W-hrt-P12`); changes apply immediately and persist.
  const appearanceSection = document.createElement("div");
  appearanceSection.className = "settings-panel__section";
  const appearanceTitle = document.createElement("div");
  appearanceTitle.className = "settings-panel__title";
  appearanceTitle.textContent = "编辑器外观";
  const appearanceRow = document.createElement("div");
  appearanceRow.className = "settings-panel__row";
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
  appearanceRow.appendChild(fontSizeLabel);
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
    restoreOriginalAssets();
    const content = readEditorContent();
    if (forceSaveAs || !state().path) {
      const result = await invoke<SaveResult | null>("save_document_as", { content, suggestedName: ensureHtmlExtension(getDocumentLabel(state().path)) });
      if (!result) return;
      replaceActiveDocument({ content, path: result.path, dirty: false, baseDir: state().baseDir });
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
renderAppMenubar();
renderAppToolbar();
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
