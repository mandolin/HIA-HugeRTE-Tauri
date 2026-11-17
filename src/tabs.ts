import { createNewDocument, type DocumentState } from "./document";

/**
 * @lang zh-CN
 * 单个标签页的完整文档状态：id 是会话内稳定的短随机标识，document 携带与单文档
 * 模式完全相同的 DocumentState（内容/路径/脏标记/基准目录）。pinned/alias 为 F6
 * 显示层状态（固定防误关、显示别名——纯显示，永不改磁盘文件名），随会话数据
 * 跨会话恢复（F5 session.json）。tabs 模块只做纯数据规约与不变量维护，不触碰
 * DOM 或编辑器实例（后者由 main.ts 编排）。
 * @lang en
 * Full per-tab document state: id is a stable short random identifier within the session,
 * and document carries exactly the same DocumentState as single-document mode (content,
 * path, dirty flag, base directory). pinned/alias are F6 display-layer state (pin to
 * prevent accidental close, display alias — pure display, never touches the on-disk
 * file name), restored across sessions via session data (F5 session.json). The tabs
 * module only handles pure data invariants and never touches the DOM or the editor
 * instance (orchestrated in main.ts).
 */
export interface TabState {
  id: string;
  document: DocumentState;
  /** @lang zh-CN 固定标记：固定 Tab 不参与溢出收纳且隐藏关闭按钮。 / @lang en Pinned flag: pinned tabs stay out of overflow collapse and hide their close button. */
  pinned: boolean;
  /** @lang zh-CN 显示别名；null = 未设置（显示文件名）。 / @lang en Display alias; null = unset (the file name shows). */
  alias: string | null;
}

/** @lang zh-CN 多 Tab 约束：上限 20 个标签页，防止内存与 UI 失控。 / @lang en Tab cap: 20, guarding memory and UI overflow. */
export const MAX_TABS = 20;

let nextTabSeed = 0;

/**
 * @lang zh-CN
 * 生成会话内唯一且输入无关的 Tab 标识：递增种子 + 随机尾，避免依赖全局计时器，
 * 便于测试确定性（种子路径）与真实运行防碰撞（随机路径）。
 * @lang en
 * Produce a session-unique, input-independent tab id: an incrementing seed plus a random
 * tail, avoiding global timers and keeping tests deterministic (seed) while real runs stay
 * collision-resistant (random tail).
 */
export function createTabId(): string {
  nextTabSeed += 1;
  return `tab-${nextTabSeed.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @lang zh-CN
 * 创建一个承载"未命名新文档"的新标签页：与既有 Tab 互不影响，初始内容与单文档
 * 模式的 createNewDocument 完全一致。
 * @lang en
 * Create a new tab hosting an untitled document: independent of existing tabs, with initial
 * content identical to the single-document createNewDocument.
 */
export function createUntitledTab(): TabState {
  return { id: createTabId(), document: createNewDocument(), pinned: false, alias: null };
}

/**
 * @lang zh-CN
 * 把已打开的文档载荷包成新标签页（打开/拖放/启动参数路径）。返回 null 表示超出
 * MAX_TABS 上限——调用方负责提示，不在本模块弹错。
 * @lang en
 * Wrap an opened document payload into a new tab (open/drop/startup-arg paths). Returns null
 * when MAX_TABS is exceeded — the caller shows the notice; this module never raises UI errors.
 */
export function appendDocumentTab(tabs: TabState[], document: DocumentState): TabState[] | null {
  if (tabs.length >= MAX_TABS) return null;
  return [...tabs, { id: createTabId(), document, pinned: false, alias: null }];
}

/**
 * @lang zh-CN
 * 关闭指定 Tab 并返回新数组与新的活动索引：活动 Tab 被关时优先右移、末尾则左移；
 * 最后一片 Tab 被关时回退到单未命名文档（窗口不退出，ADR-0005 第 4 条）。
 * 返回 null 仅表示 id 不存在。固定 Tab 的关闭由 UI 层拦截（本函数不区分固定与否）。
 * @lang en
 * Close the given tab and return the new array with the new active index: closing the active
 * tab prefers moving right, or left at the tail; closing the last tab falls back to a single
 * untitled document (window stays open, ADR-0005 §4). Null only means the id was not found.
 * Closing pinned tabs is intercepted at the UI layer (this function does not distinguish).
 */
export function closeTab(tabs: TabState[], id: string, activeIndex: number): { tabs: TabState[]; activeIndex: number } | null {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return null;
  if (tabs.length === 1) {
    return { tabs: [createUntitledTab()], activeIndex: 0 };
  }
  const next = tabs.filter((tab) => tab.id !== id);
  let nextActive = activeIndex;
  if (index < activeIndex) nextActive -= 1;
  else if (index === activeIndex) nextActive = Math.min(index, next.length - 1);
  return { tabs: next, activeIndex: nextActive };
}

/**
 * @lang zh-CN
 * 统计头部摘要所需数据：文档总数与未保存（脏）数。
 * @lang en
 * Summaries for the header line: total documents and unsaved (dirty) count.
 */
export function summarizeTabs(tabs: TabState[]): { total: number; dirty: number } {
  return { total: tabs.length, dirty: tabs.filter((tab) => tab.document.dirty).length };
}

/**
 * @lang zh-CN
 * 溢出菜单条目：Tab 过多被收纳时返回**首个可折叠 Tab**的下标（0 计），未溢出返回 null。
 * F6 规则：固定 Tab 永不折叠（始终可见），折叠只发生在**非固定 Tab 序列**里；活动 Tab
 * （无论固定与否）始终可见。展示宽度按每个 Tab 14rem 估算，超出画布约 64rem 即视为溢出。
 * 渲染规则（main.ts）：折叠 = 非 pinned 且 index ≥ 返回值 且 ≠ activeIndex。
 * @lang en
 * Overflow bookkeeping: when tabs no longer fit, return the **index of the first collapsible
 * tab** (0-based), else null. F6 rule: pinned tabs never collapse (always visible), collapsing
 * happens only within the **non-pinned sequence**; the active tab (pinned or not) stays visible.
 * Display width estimates 14rem per tab with ~64rem of usable strip width. Render rule (main.ts):
 * collapsed = not pinned and index >= the returned value and index != activeIndex.
 */
export function overflowStartIndex(tabs: TabState[], activeIndex: number, maxVisible = 4): number | null {
  const nonPinnedIndexes = tabs.reduce<number[]>((indexes, tab, index) => {
    if (!tab.pinned) indexes.push(index);
    return indexes;
  }, []);
  if (nonPinnedIndexes.length <= maxVisible) return null;
  const activeOrdinal = nonPinnedIndexes.indexOf(activeIndex);
  // 中文：活动 Tab 在可见前段（含固定活动 Tab，序数 -1）→ 折叠点取第 maxVisible 个非固定 Tab
  //       （前段满容量可见）；活动 Tab 落在后段 → 尾部对齐，折叠点 = 序数 − maxVisible + 1
  //       （保证活动 Tab 与它之前的 maxVisible−1 个可见）。
  // English: With the active tab in the visible head (including a pinned active tab, ordinal -1),
  //       the collapse point is the maxVisible-th non-pinned tab (the head fills the capacity);
  //       once the active tab falls into the tail, align to the tail — collapse point =
  //       ordinal - maxVisible + 1 (keeping the active tab and its maxVisible-1 predecessors).
  const collapseOrdinal = activeOrdinal >= 0 && activeOrdinal >= maxVisible
    ? activeOrdinal - maxVisible + 1
    : maxVisible;
  return nonPinnedIndexes[collapseOrdinal];
}

/** @lang zh-CN 别名上限（字符数），超出截断（W-hrt-P14 F6 稿 3）。 / @lang en The alias cap (characters); longer input truncates (W-hrt-P14 F6 draft 3). */
export const TAB_ALIAS_MAX_LENGTH = 30;

/**
 * @lang zh-CN
 * 规整别名输入：去首尾空白、截断到 30 字符、空白化空为 null（清除别名）。
 * 纯函数，main.ts 的内联编辑与 F5 会话恢复共用。
 * @lang en
 * Normalize an alias input: trim whitespace, cap at 30 characters, and map blank values to null
 * (clearing the alias). A pure function shared by main.ts's inline editor and F5 session restore.
 */
export function normalizeTabAlias(alias: string | null | undefined): string | null {
  if (alias === null || alias === undefined) return null;
  const trimmed = alias.trim().slice(0, TAB_ALIAS_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @lang zh-CN
 * 设置某 Tab 的固定标记并返回新数组（不修改原数组；id 不存在时原样返回）。
 * @lang en
 * Set a tab's pinned flag and return a new array (the input array is never mutated; the original
 * array returns untouched when the id is unknown).
 */
export function setTabPinned(tabs: TabState[], id: string, pinned: boolean): TabState[] {
  const exists = tabs.some((tab) => tab.id === id);
  if (!exists) return tabs;
  return tabs.map((tab) => (tab.id === id ? { ...tab, pinned } : tab));
}

/**
 * @lang zh-CN
 * 设置某 Tab 的显示别名（经 normalizeTabAlias 规整）并返回新数组（不修改原数组；
 * id 不存在时原样返回）。
 * @lang en
 * Set a tab's display alias (normalized via normalizeTabAlias) and return a new array (the input
 * array is never mutated; the original array returns untouched when the id is unknown).
 */
export function setTabAlias(tabs: TabState[], id: string, alias: string | null): TabState[] {
  const exists = tabs.some((tab) => tab.id === id);
  if (!exists) return tabs;
  const normalized = normalizeTabAlias(alias);
  return tabs.map((tab) => (tab.id === id ? { ...tab, alias: normalized } : tab));
}
