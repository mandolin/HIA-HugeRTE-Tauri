import hugerte, { type Editor } from "hugerte";

const CHECKLIST_SELECTOR = "ul.tox-checklist,ol.tox-checklist,ul.htmlv-checklist,ol.htmlv-checklist";
const CHECKLIST_ITEM_SELECTOR = "li.tox-checklist-item,li.htmlv-checklist-item";
const CHECKBOX_CLICK_WIDTH = 40;
let checklistPluginRegistered = false;
let checklistSequence = 0;

/**
 * 中文：注册编辑器内的剪贴板按钮和专用 Checklist；不依赖 Obsidian 宿主 API。
 * English: Registers editor-local clipboard controls and the Checklist behavior without Obsidian host APIs.
 */
export function registerCompatibilityChecklistPlugin(): void {
  if (checklistPluginRegistered) return;
  checklistPluginRegistered = true;

  hugerte.PluginManager.add("checklist", (editor: Editor) => {
    registerClipboardButtons(editor);
    editor.addCommand("toggleChecklist", () => toggleChecklist(editor));
    editor.ui.registry.addButton("checklist", {
      icon: "checklist",
      tooltip: "Checklist",
      onAction: () => editor.execCommand("toggleChecklist")
    });
    editor.ui.registry.addMenuItem("checklist", {
      icon: "checklist",
      text: "Checklist",
      onAction: () => editor.execCommand("toggleChecklist")
    });
    editor.on("KeyDown", (event: KeyboardEvent) => handleChecklistKeyDown(editor, event));
    editor.on("mousedown", (event: MouseEvent) => handleChecklistMouseDown(editor, event));
  });
}

function registerClipboardButtons(editor: Editor): void {
  addClipboardButton(editor, "htmlvCut", "cut", "Cut", "Ctrl+X", () => editor.execCommand("Cut"));
  addClipboardButton(editor, "htmlvCopy", "copy", "Copy", "Ctrl+C", () => editor.execCommand("Copy"));
  addClipboardButton(editor, "htmlvPaste", "paste", "Paste", "Ctrl+V", () => void pasteIntoEditor(editor, "html"));
  addClipboardButton(editor, "htmlvPasteText", "paste-text", "Text", "Ctrl+Shift+V", () => void pasteIntoEditor(editor, "text"));
  addClipboardButton(editor, "htmlvSelectAll", "select-all", "All", "Ctrl+A", () => editor.execCommand("SelectAll"));
}

function addClipboardButton(editor: Editor, name: string, icon: string, label: string, shortcut: string, action: () => void): void {
  editor.ui.registry.addButton(name, {
    icon,
    text: label,
    tooltip: label === "Text" ? "Paste as plain text" : label,
    shortcut,
    onAction: () => {
      editor.focus();
      action();
    }
  });
}

async function pasteIntoEditor(editor: Editor, mode: "html" | "text"): Promise<void> {
  editor.focus();
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  try {
    if (mode === "html" && clipboard && "read" in clipboard) {
      const items = await (clipboard as Clipboard & { read: () => Promise<ClipboardItem[]> }).read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          insertClipboardHtml(editor, await (await item.getType("text/html")).text());
          return;
        }
      }
    }
    const text = clipboard ? await clipboard.readText() : "";
    if (text) {
      // 中文：走到这里说明剪贴板只有纯文本（或 html 模式未取到 text/html）；无论哪种模式，
      //       纯文本都必须转义后再插入，避免把用户文本当作标记解析。
      // English: Reaching here means the clipboard holds plain text only (or html mode found no
      //       text/html item); in either mode the plain text must be escaped before insertion so
      //       user text is never parsed as markup.
      insertClipboardHtml(editor, textToHtml(text));
      return;
    }
  } catch {
    // 浏览器拒绝主动读取剪贴板时，继续使用 HugeRTE 自身的粘贴回退。
  }

  if (mode === "html") editor.execCommand("Paste");
  else editor.notificationManager.open({ text: "纯文本粘贴需要剪贴板权限，请使用 Ctrl+Shift+V。", type: "warning" });
}

function insertClipboardHtml(editor: Editor, html: string): void {
  editor.undoManager.transact(() => editor.insertContent(html, { paste: true }));
  editor.nodeChanged();
}

function textToHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
    .replace(/\r\n|\r|\n/g, "<br>");
}

function toggleChecklist(editor: Editor): void {
  const activeList = editor.dom.getParent(editor.selection.getNode(), "ul,ol") as HTMLElement | null;
  if (activeList?.matches(CHECKLIST_SELECTOR)) {
    removeChecklistSemantics(editor, activeList);
    return;
  }

  editor.undoManager.transact(() => {
    if (activeList) convertExistingList(editor, activeList);
    else convertCurrentSelection(editor);
  });
  markChecklistChanged(editor);
}

function convertExistingList(editor: Editor, list: HTMLElement): void {
  list.classList.add("tox-checklist", "htmlv-checklist");
  if (!list.id) list.id = nextChecklistId();
  editor.dom.select("li", list).forEach((item) => prepareChecklistItem(item as HTMLLIElement));
}

function convertCurrentSelection(editor: Editor): void {
  const blocks = editor.selection.isCollapsed()
    ? [getCurrentConvertibleBlock(editor)].filter((block): block is HTMLElement => Boolean(block))
    : editor.selection.getSelectedBlocks().filter((block) => isConvertibleBlock(editor, block)) as HTMLElement[];
  if (blocks.length === 0) {
    insertBlankChecklist(editor);
    return;
  }

  const groups = new Map<ParentNode, HTMLElement[]>();
  for (const block of blocks) {
    if (isChecklistElement(block)) continue;
    const parent = block.parentNode;
    if (parent) groups.set(parent, [...(groups.get(parent) ?? []), block]);
  }

  let firstItem: HTMLLIElement | null = null;
  for (const group of groups.values()) {
    const firstBlock = group[0];
    if (!firstBlock?.parentNode) continue;
    const checklist = createChecklist(editor);
    for (const block of group) checklist.appendChild(moveBlockIntoChecklistItem(editor, block));
    firstBlock.parentNode.insertBefore(checklist, firstBlock);
    group.forEach((block) => block.remove());
    firstItem ??= checklist.querySelector("li");
  }
  if (firstItem) setCursorAtStart(editor, firstItem);
}

function getCurrentConvertibleBlock(editor: Editor): HTMLElement | null {
  const node = editor.selection.getNode();
  const block = editor.dom.getParent(node, editor.dom.isBlock) as HTMLElement | null;
  return block && isConvertibleBlock(editor, block) ? block : null;
}

function isConvertibleBlock(editor: Editor, block: Element): boolean {
  if (block === editor.getBody() || isChecklistElement(block)) return false;
  if (block.matches("table,thead,tbody,tfoot,tr")) return false;
  return Boolean(block.textContent?.trim() || block.querySelector("img,table,hr,iframe,video,audio"));
}

function insertBlankChecklist(editor: Editor): void {
  const checklist = createChecklist(editor);
  const item = createChecklistItem(editor);
  checklist.appendChild(item);
  const cell = editor.dom.getParent(editor.selection.getNode(), "td,th");
  if (cell) cell.appendChild(checklist);
  else editor.selection.getNode().parentNode?.insertBefore(checklist, editor.selection.getNode().nextSibling);
  setCursorAtStart(editor, item);
}

function createChecklist(editor: Editor): HTMLUListElement {
  const checklist = editor.getDoc().createElement("ul");
  checklist.className = "tox-checklist htmlv-checklist";
  checklist.id = nextChecklistId();
  return checklist;
}

function createChecklistItem(editor: Editor): HTMLLIElement {
  const item = editor.getDoc().createElement("li");
  item.appendChild(editor.dom.create("br", { "data-mce-bogus": "1" }));
  prepareChecklistItem(item);
  return item;
}

function moveBlockIntoChecklistItem(editor: Editor, block: HTMLElement): HTMLLIElement {
  const item = createChecklistItem(editor);
  item.replaceChildren();
  while (block.firstChild) item.appendChild(block.firstChild);
  return item;
}

function prepareChecklistItem(item: HTMLLIElement): void {
  item.classList.add("tox-checklist-item", "htmlv-checklist-item");
  if (!item.hasAttribute("data-checked")) setChecklistChecked(item, false);
  if (!item.hasAttribute("data-htmlv-task-id")) item.setAttribute("data-htmlv-task-id", nextTaskId());
}

function setChecklistChecked(item: HTMLLIElement, checked: boolean): void {
  item.dataset.checked = checked ? "true" : "false";
  item.classList.toggle("tox-checklist--checked", checked);
}

function removeChecklistSemantics(editor: Editor, list: HTMLElement): void {
  editor.undoManager.transact(() => {
    editor.dom.select("li", list).forEach((item) => {
      item.classList.remove("tox-checklist-item", "htmlv-checklist-item", "tox-checklist--checked");
      item.removeAttribute("data-checked");
      item.removeAttribute("data-htmlv-task-id");
    });
    list.classList.remove("tox-checklist", "htmlv-checklist");
  });
  markChecklistChanged(editor);
}

function handleChecklistKeyDown(editor: Editor, event: KeyboardEvent): void {
  const item = getChecklistItem(editor);
  if (!item) return;
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    setChecklistChecked(item, item.dataset.checked !== "true");
    markChecklistChanged(editor);
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (isChecklistItemEmpty(item)) exitBlankChecklistItem(editor, item);
    else {
      const nextItem = createChecklistItem(editor);
      item.parentNode?.insertBefore(nextItem, item.nextSibling);
      setCursorAtStart(editor, nextItem);
      markChecklistChanged(editor);
    }
    return;
  }
  if (event.key === "Backspace" && isChecklistItemEmpty(item) && isCaretAtStart(editor)) {
    event.preventDefault();
    removeChecklistSemantics(editor, item.parentElement as HTMLElement);
  }
}

function handleChecklistMouseDown(editor: Editor, event: MouseEvent): void {
  const item = getChecklistItem(editor, event.target as Node | null);
  if (!item || !isChecklistElement(item)) return;
  const rectangle = item.getBoundingClientRect();
  if (event.clientX - rectangle.left >= CHECKBOX_CLICK_WIDTH) return;
  event.preventDefault();
  event.stopPropagation();
  setChecklistChecked(item, item.dataset.checked !== "true");
  markChecklistChanged(editor);
}

function exitBlankChecklistItem(editor: Editor, item: HTMLLIElement): void {
  const list = item.parentElement;
  if (!list) return;
  const parent = list.parentNode;
  const laterItems = Array.from(list.querySelectorAll<HTMLElement>(CHECKLIST_ITEM_SELECTOR)).slice(Array.from(list.children).indexOf(item) + 1);
  item.remove();
  if (laterItems.length) {
    const nextList = createChecklist(editor);
    laterItems.forEach((laterItem) => nextList.appendChild(laterItem));
    list.parentNode?.insertBefore(nextList, list.nextSibling);
  }
  const paragraph = editor.dom.create("p");
  paragraph.appendChild(editor.dom.create("br", { "data-mce-bogus": "1" }));
  if (list.querySelector("li")) list.parentNode?.insertBefore(paragraph, list.nextSibling);
  else {
    list.remove();
    parent?.appendChild(paragraph);
  }
  setCursorAtStart(editor, paragraph);
  markChecklistChanged(editor);
}

function getChecklistItem(editor: Editor, node?: Node | null): HTMLLIElement | null {
  const item = editor.dom.getParent(node ?? editor.selection.getNode(), "li") as HTMLLIElement | null;
  return item && isChecklistElement(item) ? item : null;
}

function isChecklistElement(element: Element): boolean {
  return element.matches(CHECKLIST_SELECTOR) || Boolean(element.closest(CHECKLIST_SELECTOR));
}

function isChecklistItemEmpty(item: HTMLLIElement): boolean { return !item.textContent?.trim(); }

function isCaretAtStart(editor: Editor): boolean { return editor.selection.getRng().startOffset === 0; }

function setCursorAtStart(editor: Editor, element: Node): void {
  const range = editor.dom.createRng();
  range.setStart(element, 0);
  range.collapse(true);
  editor.selection.setRng(range);
  editor.focus();
}

function markChecklistChanged(editor: Editor): void {
  editor.setDirty(true);
  editor.dispatch("Change");
}

function nextChecklistId(): string { checklistSequence += 1; return `tox-checklist-${checklistSequence}`; }
function nextTaskId(): string { return `htmlv-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
