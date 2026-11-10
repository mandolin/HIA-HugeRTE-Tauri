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
const confirmScrim = requiredElement<HTMLDivElement>("#confirm-scrim");
const confirmMessage = requiredElement<HTMLParagraphElement>("#confirm-message");
const confirmCancelButton = requiredElement<HTMLButtonElement>("#confirm-cancel");
const confirmDiscardButton = requiredElement<HTMLButtonElement>("#confirm-discard");
let editor: Editor | null = null;
let state = createNewDocument();
let isReplacingContent = false;

interface SaveResult { path: string; }

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`找不到必要的界面元素：${selector}`);
  return element;
}

function setStatus(message: string): void { documentStatus.textContent = message; }

function refreshDocumentHeader(): void {
  const label = getDocumentLabel(state.path);
  documentPath.textContent = state.dirty ? `● ${label}` : label;
  document.title = state.dirty ? `● ${label} — HIA HugeRTE` : `${label} — HIA HugeRTE`;
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
        state = { ...state, content: instance.getContent(), dirty: true };
        refreshDocumentHeader();
        setStatus("已修改，尚未保存");
      });
    }
  });
  editor = instances[0] ?? null;
  if (!editor) throw new Error("HugeRTE 未能创建编辑器实例。");
  await replaceDocument(createNewDocument());
  applyEditorFontSize();
}

async function replaceDocument(nextState: DocumentState): Promise<void> {
  isReplacingContent = true;
  state = nextState;
  await applyDocumentToEditor(nextState);
  isReplacingContent = false;
  refreshDocumentHeader();
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
  if (!state.dirty) return Promise.resolve(true);
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
    confirmMessage.textContent = buildDiscardConfirmMessage(state.path);
    confirmScrim.classList.add("confirm-scrim--active");
    window.addEventListener("keydown", onKeyDown, true);
    confirmCancelButton.focus();
    confirmCancelButton.addEventListener("click", () => finish(false), { once: true });
    confirmDiscardButton.addEventListener("click", () => finish(true), { once: true });
  });
}

async function openPayload(payload: DocumentPayload): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  await replaceDocument(documentFromPayload(payload));
  applyEditorFontSize();
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

async function createDocument(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  await replaceDocument(createNewDocument());
  applyEditorFontSize();
  setStatus("已新建文档");
}

async function saveDocument(forceSaveAs: boolean): Promise<void> {
  try {
    restoreOriginalAssets();
    const content = readEditorContent();
    if (forceSaveAs || !state.path) {
      const result = await invoke<SaveResult | null>("save_document_as", { content, suggestedName: ensureHtmlExtension(getDocumentLabel(state.path)) });
      if (!result) return;
      state = { content, path: result.path, dirty: false, baseDir: state.baseDir };
    } else {
      await invoke("save_document", { path: state.path, content });
      state = { ...state, content, dirty: false };
    }
    await applyDocumentToEditor(state);
    refreshDocumentHeader();
    setStatus("已保存");
  } catch (error) { setStatus(`保存失败：${formatError(error)}`); }
}

function formatError(error: unknown): string { return typeof error === "string" ? error : "发生未知错误。"; }

async function openStartupDocuments(): Promise<void> {
  try {
    const documents = await invoke<DocumentPayload[]>("get_startup_documents");
    const firstDocument = documents[0];
    if (!firstDocument) return;
    replaceDocument(documentFromPayload(firstDocument));
    applyEditorFontSize();
    setStatus(documents.length > 1 ? "已打开第一个传入文件；其余文件未在初版中自动打开" : "已通过系统文件入口打开");
  } catch (error) { setStatus(`启动文件打开失败：${formatError(error)}`); }
}

requiredElement<HTMLButtonElement>("#new-document").addEventListener("click", () => void createDocument());
requiredElement<HTMLButtonElement>("#open-document").addEventListener("click", () => void openWithDialog());
requiredElement<HTMLButtonElement>("#save-document").addEventListener("click", () => void saveDocument(false));
requiredElement<HTMLButtonElement>("#save-as-document").addEventListener("click", () => void saveDocument(true));
fontSize.addEventListener("change", applyEditorFontSize);

const isTauriRuntime = "__TAURI_INTERNALS__" in window;

if (isTauriRuntime) {
  void getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type === "over") { dropIndicator.classList.add("drop-indicator--active"); return; }
    if (event.payload.type === "leave") { dropIndicator.classList.remove("drop-indicator--active"); return; }
    dropIndicator.classList.remove("drop-indicator--active");
    if (event.payload.type === "drop") {
      const [firstPath] = event.payload.paths;
      if (firstPath) void openFromPath(firstPath);
    }
  });
}

void initializeEditor()
  .then(() => isTauriRuntime ? openStartupDocuments() : setStatus("浏览器兼容性验证模式"))
  .catch((error: unknown) => setStatus(`编辑器初始化失败：${formatError(error)}`));
