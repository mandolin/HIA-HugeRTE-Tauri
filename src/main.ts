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
import { createNewDocument, documentFromPayload, ensureHtmlExtension, getDocumentLabel, type DocumentPayload, type DocumentState } from "./document";
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
  </main>
`;

const documentPath = requiredElement<HTMLParagraphElement>("#document-path");
const documentStatus = requiredElement<HTMLSpanElement>("#document-status");
const editorTarget = requiredElement<HTMLTextAreaElement>("#hugerte-editor");
const dropIndicator = requiredElement<HTMLDivElement>("#drop-indicator");
const fontSize = requiredElement<HTMLSelectElement>("#editor-font-size");
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
  editor?.save();
  return editor?.getContent() ?? editorTarget.value;
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
  replaceDocument(createNewDocument());
  applyEditorFontSize();
}

function replaceDocument(nextState: DocumentState): void {
  isReplacingContent = true;
  state = nextState;
  if (editor) { editor.setContent(nextState.content); editor.undoManager.clear(); editor.setDirty(false); } else editorTarget.value = nextState.content;
  isReplacingContent = false;
  refreshDocumentHeader();
}

async function confirmDiscardChanges(): Promise<boolean> {
  return !state.dirty || window.confirm("当前文档尚未保存。是否放弃这些修改？");
}

async function openPayload(payload: DocumentPayload): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  replaceDocument(documentFromPayload(payload));
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
  replaceDocument(createNewDocument());
  applyEditorFontSize();
  setStatus("已新建文档");
}

async function saveDocument(forceSaveAs: boolean): Promise<void> {
  try {
    const content = readEditorContent();
    if (forceSaveAs || !state.path) {
      const result = await invoke<SaveResult | null>("save_document_as", { content, suggestedName: ensureHtmlExtension(getDocumentLabel(state.path)) });
      if (!result) return;
      state = { content, path: result.path, dirty: false };
    } else {
      await invoke("save_document", { path: state.path, content });
      state = { ...state, content, dirty: false };
    }
    editor?.setDirty(false);
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
