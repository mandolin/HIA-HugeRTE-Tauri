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
      </nav>
    </header>
    <div id="tabbar" class="tabbar" role="tablist" aria-label="打开的文档"></div>
    <section class="editor-options" aria-label="编辑器设置"><label>编辑字号 <select id="editor-font-size"><option value="14px">14</option><option value="16px" selected>16</option><option value="18px">18</option><option value="20px">20</option></select></label><span id="document-status" role="status">准备就绪</span></section>
    <section class="editor-container"><textarea id="hugerte-editor" aria-label="HTML 文档编辑器"></textarea><div id="drop-indicator" class="drop-indicator" aria-hidden="true">释放以打开 HTML 文件</div></section>
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
  return new Promise<boolean>((resolve) => {
    let decided = false;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const finish = (discarded: boolean) => {
      // 中文：幂等收口——按钮点击、Esc 与收尾清理可能交错，只有第一次决定生效。
      // English: Idempotent teardown — button clicks, Esc and cleanup may interleave; only the
      // first decision takes effect.
      if (decided) return;
      decided = true;
      confirmScrim.classList.remove("confirm-scrim--active");
      window.removeEventListener("keydown", onKeyDown, true);
      previousActive?.focus();
      resolve(discarded);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    };
    confirmMessage.textContent = buildDiscardConfirmMessage(state().path);
    confirmScrim.classList.add("confirm-scrim--active");
    window.addEventListener("keydown", onKeyDown, true);
    confirmCancelButton.focus();
    confirmCancelButton.addEventListener("click", () => finish(false), { once: true });
    confirmDiscardButton.addEventListener("click", () => finish(true), { once: true });
  });
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
fontSize.addEventListener("change", applyEditorFontSize);

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

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
