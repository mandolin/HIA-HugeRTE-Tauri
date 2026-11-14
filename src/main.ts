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
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("无法初始化应用根节点。");

app.innerHTML = `
  <main class="application-shell">
    <header class="app-header">
      <div class="app-brand"><span class="app-brand__mark" aria-hidden="true">H</span><div><h1>HIA HugeRTE</h1><p id="document-path">未命名文档</p></div></div>
      <nav class="document-actions" aria-label="文档操作">
        <button id="new-document" type="button" title="新建文档">新建</button>
        <button id="open-document" type="button" title="打开 HTML 文件">打开</button>
        <button id="save-document" type="button" title="保存当前文档">保存</button>
        <button id="save-as-document" type="button" title="另存为 HTML 文件">另存为</button>
        <button id="history-button" type="button" title="最近打开的文件">历史 ▾</button>
        <button id="explorer-toggle" type="button" title="显示/隐藏目录树" aria-pressed="false">显示目录树</button>
        <button id="settings-button" type="button" title="设置：打开方式与版本信息">设置 ▾</button>
      </nav>
    </header>
    <div id="tabbar" class="tabbar" role="tablist" aria-label="打开的文档"></div>
    <section class="editor-options" aria-label="编辑器设置"><label>编辑字号 <select id="editor-font-size"><option value="14px">14</option><option value="16px" selected>16</option><option value="18px">18</option><option value="20px">20</option></select></label><span id="document-status" role="status">准备就绪</span></section>
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
const fontSize = requiredElement<HTMLSelectElement>("#editor-font-size");
const tabbar = requiredElement<HTMLDivElement>("#tabbar");
const explorerPanel = requiredElement<HTMLElement>("#explorer");
const explorerTree = requiredElement<HTMLDivElement>("#explorer-tree");
const explorerScope = requiredElement<HTMLSpanElement>("#explorer-scope");
const explorerPreview = requiredElement<HTMLDivElement>("#explorer-preview");
const explorerBreadcrumb = requiredElement<HTMLElement>("#explorer-breadcrumb");
const explorerUpButton = requiredElement<HTMLButtonElement>("#explorer-up");
const explorerResizer = requiredElement<HTMLDivElement>("#explorer-resizer");
const explorerToggleButton = requiredElement<HTMLButtonElement>("#explorer-toggle");
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
  const selectedSize = fontSize.value;
  localStorage.setItem("hia-hugerte.editor-font-size", selectedSize);
  editor?.getBody().style.setProperty("font-size", selectedSize);
}

async function initializeEditor(): Promise<void> {
  const savedFontSize = localStorage.getItem("hia-hugerte.editor-font-size");
  if (savedFontSize && Array.from(fontSize.options).some((option) => option.value === savedFontSize)) fontSize.value = savedFontSize;
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
  if (existing) { existing.remove(); return; }
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
  if (existing) { existing.remove(); return; }
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
  explorerToggleButton.disabled = explorerRootPath === "";
  explorerToggleButton.textContent = shouldShow ? "隐藏目录树" : "显示目录树";
  explorerToggleButton.setAttribute("aria-pressed", String(shouldShow));
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
  // 中文：点击别处关闭（一次性监听，避免累积）。
  // English: Close on outside click (one-shot listener, no accumulation).
  const close = (event: MouseEvent) => {
    if (!menu.contains(event.target as Node)) {
      menu.remove();
      document.removeEventListener("mousedown", close, true);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close, true), 0);
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

requiredElement<HTMLButtonElement>("#new-document").addEventListener("click", () => void createDocument());
requiredElement<HTMLButtonElement>("#open-document").addEventListener("click", () => void openWithDialog());
requiredElement<HTMLButtonElement>("#save-document").addEventListener("click", () => void saveDocument(false));
requiredElement<HTMLButtonElement>("#save-as-document").addEventListener("click", () => void saveDocument(true));
requiredElement<HTMLButtonElement>("#history-button").addEventListener("click", () => void toggleHistoryMenu());
// 中文：设置面板入口（ADR-0001 修订条目 1/2 的界面）。浏览器验证模式下按钮隐藏（无原生命令）。
// English: Settings panel entry (the UI for ADR-0001 revision items 1/2). Hidden in browser
//       verification mode (no native commands there).
requiredElement<HTMLButtonElement>("#settings-button").addEventListener("click", () => void toggleSettingsPanel());
explorerUpButton.addEventListener("click", () => {
  const parent = parentPath(explorerRootPath);
  if (parent) void setExplorerRoot(parent);
});
// 中文：右上切换按钮——翻转显隐意愿并持久化（见 explorerHiddenByUser 的 ADR-0003 第 6 条说明）。
// English: The top-right toggle — flips the show/hide intent and persists it (see the
//       ADR-0003 §6 note on explorerHiddenByUser).
explorerToggleButton.addEventListener("click", () => {
  explorerHiddenByUser = !explorerHiddenByUser;
  localStorage.setItem("hia-hugerte.explorer-hidden", explorerHiddenByUser ? "1" : "0");
  updateExplorerVisibility();
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
fontSize.addEventListener("change", applyEditorFontSize);

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

if (!isTauriRuntime) {
  // 中文：浏览器兼容性验证模式下无原生历史存储与设置命令，隐藏对应入口。
  // English: No native history storage or settings commands in browser verification mode; hide those
  //       entry points.
  requiredElement<HTMLButtonElement>("#history-button").hidden = true;
  requiredElement<HTMLButtonElement>("#settings-button").hidden = true;
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
