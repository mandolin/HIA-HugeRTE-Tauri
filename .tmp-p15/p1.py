import io
p = 'src/main.ts'
s = io.open(p, encoding='utf-8').read()

# 1) strings 导入
old = 'import { buildSessionRecord, draftTitle, nextDraftId, normalizeSessionRecord, resolveRestoredActiveOrdinal, type DraftRecord, type SessionRecord } from "./session";'
new = old + '\nimport { currentLanguage, setLanguage as setUiLanguage, t, tf } from "./ui/strings";'
assert s.count(old) == 1, "import anchor"
s = s.replace(old, new)

# 2) 侧栏模式条 label 函数化（模块级常量需随语言重取词）
old = '''const SIDEBAR_MODE_DEFS: ReadonlyArray<{ mode: SidebarMode; icon: IconName; label: string }> = [
  { mode: "files", icon: "folders", label: "资源" },
  { mode: "outline", icon: "list", label: "大纲" },
  { mode: "search", icon: "search", label: "搜索" }
];'''
new = '''const SIDEBAR_MODE_DEFS: ReadonlyArray<{ mode: SidebarMode; icon: IconName; label: () => string }> = [
  { mode: "files", icon: "folders", label: () => t("资源") },
  { mode: "outline", icon: "list", label: () => t("大纲") },
  { mode: "search", icon: "search", label: () => t("搜索") }
];'''
assert s.count(old) == 1, "mode defs"
s = s.replace(old, new)

old = '''    button.appendChild(createIcon(definition.icon));
    const label = document.createElement("span");
    label.className = "explorer__mode-text";
    label.textContent = definition.label;
    button.appendChild(label);'''
new = '''    button.appendChild(createIcon(definition.icon));
    const label = document.createElement("span");
    label.className = "explorer__mode-text";
    label.textContent = definition.label();
    button.appendChild(label);'''
assert s.count(old) == 1, "mode strip label()"
s = s.replace(old, new)

# 3) 静态模板：同步滚动文案包进 span（语言切换可更新）
old = '''<label id="source-sync-label" class="source-pane__sync" for="source-sync-scroll"><input id="source-sync-scroll" type="checkbox" /> 同步滚动</label>'''
new = '''<label id="source-sync-label" class="source-pane__sync" for="source-sync-scroll"><input id="source-sync-scroll" type="checkbox" /><span id="source-sync-text">同步滚动</span></label>'''
assert s.count(old) == 1, "sync label markup"
s = s.replace(old, new)

# 4) applyShellLanguage + rebuildShellChrome（插在 renderSidebarModeStrip 定义之前）
anchor = '''function renderSidebarModeStrip(): void {'''
inject = '''/**
 * @lang zh-CN
 * 应用静态骨架的可见文案按当前语言刷新（W-hrt-P15）：innerHTML 模板里的中文（面板标题、
 * 按钮文案、aria-label、placeholder 等）不是可重渲函数的产物，切换语言后由本函数逐元素
 * 更新。动态文案（菜单/工具栏/Tab 条/状态栏/面板）由各自的重渲函数在 rebuildShellChrome
 * 中统一调用。
 * @lang en
 * Refresh the static skeleton's visible copy by the current language (W-hrt-P15): Chinese text
 * inside the innerHTML template (panel titles, button copy, aria-labels, placeholders) is not
 * produced by re-renderable functions, so this function updates it element by element after a
 * language switch. Dynamic copy (menus/toolbar/tab strip/status bar/panels) is refreshed by
 * their re-render functions, invoked together from rebuildShellChrome.
 */
function applyShellLanguage(): void {
  // 中文：源码栏标题与同步滚动文案。
  const sourceTitle = document.querySelector(".source-pane__title");
  if (sourceTitle) sourceTitle.textContent = t("源代码");
  const syncText = document.getElementById("source-sync-text");
  if (syncText) syncText.textContent = t("同步滚动");
  // 中文：草稿提示条按钮。
  const restoreButton = document.getElementById("draft-restore");
  if (restoreButton) restoreButton.textContent = t("恢复为 Tab");
  const discardButton = document.getElementById("draft-discard");
  if (discardButton) discardButton.textContent = t("全部丢弃");
  // 中文：拖放提示。
  const drop = document.getElementById("drop-indicator");
  if (drop) drop.textContent = t("释放以打开 HTML 文件");
  // 中文：弃改确认卡（标题与两个按钮）。
  const confirmTitle = document.getElementById("confirm-title");
  if (confirmTitle) confirmTitle.textContent = t("放弃未保存的修改？");
  const cancelButton = document.getElementById("confirm-cancel");
  if (cancelButton) cancelButton.textContent = t("取消");
  const discardConfirm = document.getElementById("confirm-discard");
  if (discardConfirm) discardConfirm.textContent = t("放弃修改并继续");
  // 中文：状态栏初始文案（动态值随运行事件覆盖）。
  const save = document.getElementById("status-save");
  if (save) save.textContent = t("已保存");
  const count = document.getElementById("status-count");
  if (count) count.textContent = t("字符 0 · 词 0");
  const cursor = document.getElementById("status-cursor");
  if (cursor) cursor.textContent = t("行 1 · 列 1");
  // 中文：设置齿轮标题。
  settingsButton.title = t("设置");
  settingsButton.setAttribute("aria-label", t("设置"));
  // 中文：结构化 aria-label（菜单/工具栏/Tab 条/侧栏/源码栏/编辑器）。
  menubarElement.setAttribute("aria-label", t("主菜单"));
  toolbarElement.setAttribute("aria-label", t("文档操作"));
  tabbar.setAttribute("aria-label", t("打开的文档"));
  explorerPanel.setAttribute("aria-label", t("文档侧栏"));
  explorerModes.setAttribute("aria-label", t("侧栏视图"));
  explorerOutline.setAttribute("aria-label", t("文档大纲"));
  const searchInput = document.getElementById("explorer-search-input");
  if (searchInput) {
    searchInput.placeholder = t("在所有打开的文档中查找…");
    searchInput.setAttribute("aria-label", t("在所有打开的文档中查找"));
  }
  const editorArea = document.getElementById("hugerte-editor");
  if (editorArea) editorArea.setAttribute("aria-label", t("HTML 文档编辑器"));
  const sourceArea = document.getElementById("source-editor");
  if (sourceArea) sourceArea.setAttribute("aria-label", t("HTML 源码编辑区"));
  // 中文：侧栏头部「资源管理」与刷新按钮标题。
  const head = explorerPanel.querySelector(".explorer__head > span");
  if (head && head.firstChild) {
    head.firstChild.nodeValue = `${t("资源管理")} `;
  }
  const refreshTitle = explorerPanel.querySelector("#explorer-refresh");
  if (refreshTitle) refreshTitle.title = t("刷新目录树");
  // 中文：面包屑行的「向上」按钮标题。
  const upButton = document.getElementById("explorer-up");
  if (upButton) {
    upButton.title = t("向上（浏览上一级目录）");
    upButton.setAttribute("aria-label", t("向上"));
  }
  const breadcrumb = document.getElementById("explorer-breadcrumb");
  if (breadcrumb) breadcrumb.setAttribute("aria-label", t("目录路径"));
  // 中文：分隔条标题/aria（资源树与源码栏）。
  explorerResizer.setAttribute("aria-label", t("调整资源管理器宽度"));
  explorerResizer.title = t("拖动调整资源管理器宽度（聚焦后可用左右方向键微调）");
  sourceResizer.setAttribute("aria-label", t("调整源码栏宽度"));
  sourceResizer.title = t("拖动调整源码栏宽度（聚焦后可用左右方向键微调）");
}

/**
 * @lang zh-CN
 * 语言切换后的壳重建总入口：静态骨架文案 + 全部可重渲动态区域（菜单/工具栏/Tab 条/状态栏
 * /模式条/侧栏可见视图）。
 * @lang en
 * The rebuild entry after a language switch: static skeleton copy plus every re-renderable
 * dynamic area (menus/toolbar/tab strip/status bar/mode strip/visible sidebar views).
 */
function rebuildShellChrome(): void {
  applyShellLanguage();
  renderAppMenubar();
  renderAppToolbar();
  renderTabStrip();
  refreshDocumentHeader();
  renderSidebarModeStrip();
  refreshOutlineIfVisible();
  refreshSearchIfVisible();
}

function renderSidebarModeStrip(): void {'''
assert s.count(anchor) == 1, "strip anchor"
s = s.replace(anchor, inject)

f = io.open(p, 'w', encoding='utf-8', newline='')
f.write(s)
f.close()
print('p1 done')
