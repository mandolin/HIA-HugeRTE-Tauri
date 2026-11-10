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
      </nav>
    </header>
    <div id="tabbar" class="tabbar" role="tablist" aria-label="打开的文档"></div>
    <section class="editor-options" aria-label="编辑器设置"><label>编辑字号 <select id="editor-font-size"><option value="14px">14</option><option value="16px" selected>16</option><option value="18px">18</option><option value="20px">20</option></select></label><span id="document-status" role="status">准备就绪</span></section>
    <section class="editor-container">
      <aside id="explorer" class="explorer" aria-label="资源管理" hidden>
        <div class="explorer__head"><span>资源管理 <span id="explorer-scope" class="explorer__scope"></span></span><button id="explorer-refresh" type="button" title="刷新目录树" class="explorer__refresh">⟳</button></div>
        <div id="explorer-tree" class="tree" role="tree"></div>
        <div id="explorer-preview" class="explorer__preview" hidden></div>
      </aside>
      <div id="workbench" class="workbench"><textarea id="hugerte-editor" aria-label="HTML 文档编辑器"></textarea></div>
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
  expandedDirs.clear();
  expandedDirs.add(".");
  await renderExplorerTree();
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
  expandedDirs.clear();
  expandedDirs.add(".");
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

/** @lang zh-CN 已展开目录的相对路径集合（会话内状态；文档切换时重置）。 / @lang en Relative paths of expanded directories (session state; reset when the document changes). */
const expandedDirs = new Set<string>();

/**
 * @lang zh-CN
 * 渲染资源树（ADR-0003 + 设计基线 v1.1）：根行 = 文档目录；子行懒加载——目录行的行首是
 * **真实展开/收缩按钮**（维护者修订：可键盘到达，Enter/Space 切换），文件行点击图片/样式
 * 时在预览卡显示相对引用与「插入相对引用」。无文档或读取失败显示空态文案。
 * @lang en
 * Render the explorer tree (ADR-0003 + design baseline v1.1): root row = document directory;
 * children lazy-load. Directory rows start with a real expand/collapse button (maintainer
 * revision: keyboard-reachable via Enter/Space); clicking an image/style shows the preview card
 * with its relative reference and an "insert reference" action. Empty state when no document or
 * on read failure.
 */
async function renderExplorerTree(): Promise<void> {
  explorerTree.textContent = "";
  explorerPreview.hidden = true;
  const baseDir = state().baseDir;
  if (!baseDir) {
    explorerPanel.hidden = true;
    return;
  }
  explorerPanel.hidden = false;
  explorerScope.textContent = "作用域：文档目录及其父目录";
  const rootRow = buildTreeRow({ name: getDocumentLabel(state().path) ?? "文档目录", isDir: true, size: 0, isSupportedAsset: false }, ".", expandedDirs.has("."));
  rootRow.classList.add("tree__row--active");
  explorerTree.appendChild(rootRow);
  if (!expandedDirs.has(".")) {
    const hint = document.createElement("div");
    hint.className = "tree__empty";
    hint.textContent = "展开目录以浏览资源";
    explorerTree.appendChild(hint);
    return;
  }
  await appendTreeChildren(explorerTree, baseDir, ".", 1);
}

/**
 * @lang zh-CN
 * 向容器追加某目录一层的子行（懒加载一层；子目录再次展开时再取）。读取失败显示空态文案。
 * @lang en
 * Append one level of child rows for a directory (lazy per level; subdirectories fetch on
 * expand). Read failures render the empty-state text.
 */
async function appendTreeChildren(container: HTMLElement, baseDir: string, relativePath: string, indent: number): Promise<void> {
  let entries: TreeEntryPayload[] = [];
  try {
    entries = await invoke<TreeEntryPayload[]>("list_directory_tree", { baseDir, relativePath });
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
    const childRelative = relativePath === "." ? entry.name : `${relativePath}/${entry.name}`;
    const row = buildTreeRow(entry, childRelative, expandedDirs.has(childRelative));
    row.classList.add(`tree__indent-${Math.min(indent, 3)}`);
    container.appendChild(row);
    if (entry.isDir && expandedDirs.has(childRelative)) {
      await appendTreeChildren(container, baseDir, childRelative, indent + 1);
    }
  }
}

/**
 * @lang zh-CN
 * 构造单行：目录行带真实展开/收缩按钮（toggleExpandDir，键盘可达）；资源行可点击预览。
 * @lang en
 * Build one row: directory rows carry a real expand/collapse button (toggleExpandDir,
 * keyboard-reachable); asset rows are clickable for preview.
 */
function buildTreeRow(entry: TreeEntryPayload, relativePath: string, expanded: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = `tree__row${entry.isSupportedAsset ? " tree__row--asset" : ""}`;
  row.setAttribute("role", "treeitem");
  row.tabIndex = 0;
  if (entry.isDir) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree__caret";
    toggle.textContent = expanded ? "▾" : "▸";
    toggle.title = expanded ? "收起目录" : "展开目录";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", (event) => { event.stopPropagation(); void toggleExpandDir(relativePath); });
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
  if (entry.isSupportedAsset) {
    row.addEventListener("click", () => void showAssetPreview(relativePath));
    row.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void showAssetPreview(relativePath); } });
  }
  return row;
}

/**
 * @lang zh-CN
 * 展开/收缩一个目录：更新集合后整树重绘（数据量小，重绘简单可靠且保持展开状态）。
 * @lang en
 * Expand or collapse one directory: update the set and re-render the whole tree (small data;
 * re-render is simple, reliable and preserves expansion state).
 */
async function toggleExpandDir(relativePath: string): Promise<void> {
  if (expandedDirs.has(relativePath)) expandedDirs.delete(relativePath);
  else expandedDirs.add(relativePath);
  await renderExplorerTree();
}

/**
 * @lang zh-CN
 * 资源预览卡：显示名称、相对引用（以活动文档目录为基准）与大小；「插入相对引用」按钮把
 * 最短相对路径插入编辑器（convert_urls:false 契约下由 HugeRTE 原样保留）。
 * @lang en
 * Asset preview card: name, relative reference (against the active document's directory) and
 * size; "insert reference" places the shortest relative path into the editor (kept verbatim
 * under the convert_urls:false contract).
 */
async function showAssetPreview(relativePath: string): Promise<void> {
  const baseDir = state().baseDir;
  if (!baseDir) return;
  try {
    const dataUri = await invoke<string | null>("resolve_document_asset", { baseDir, relativePath });
    if (!dataUri) return;
    const size = Math.round((dataUri.length - dataUri.indexOf(",") - 1) * 3 / 4 / 1024);
    explorerPreview.hidden = false;
    explorerPreview.textContent = "";
    const title = document.createElement("b");
    title.textContent = relativePath.split("/").pop() ?? relativePath;
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
fontSize.addEventListener("change", applyEditorFontSize);

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

if (!isTauriRuntime) {
  // 中文：浏览器兼容性验证模式下无原生历史存储，隐藏入口。
  // English: No native history storage in browser verification mode; hide the entry point.
  requiredElement<HTMLButtonElement>("#history-button").hidden = true;
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
