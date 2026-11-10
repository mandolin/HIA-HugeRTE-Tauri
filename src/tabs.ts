import { createNewDocument, type DocumentState } from "./document";

/**
 * @lang zh-CN
 * 单个标签页的完整文档状态：id 是会话内稳定的短随机标识，document 携带与单文档
 * 模式完全相同的 DocumentState（内容/路径/脏标记/基准目录）。tabs 模块只做纯数据
 * 规约与不变量维护，不触碰 DOM 或编辑器实例（后者由 main.ts 编排）。
 * @lang en
 * Full per-tab document state: id is a stable short random identifier within the session,
 * and document carries exactly the same DocumentState as single-document mode (content,
 * path, dirty flag, base directory). The tabs module only handles pure data invariants and
 * never touches the DOM or the editor instance (orchestrated in main.ts).
 */
export interface TabState {
  id: string;
  document: DocumentState;
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
  return { id: createTabId(), document: createNewDocument() };
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
  return [...tabs, { id: createTabId(), document }];
}

/**
 * @lang zh-CN
 * 关闭指定 Tab 并返回新数组与新的活动索引：活动 Tab 被关时优先右移、末尾则左移；
 * 最后一片 Tab 被关时回退到单未命名文档（窗口不退出，ADR-0005 第 4 条）。
 * 返回 null 仅表示 id 不存在。
 * @lang en
 * Close the given tab and return the new array with the new active index: closing the active
 * tab prefers moving right, or left at the tail; closing the last tab falls back to a single
 * untitled document (window stays open, ADR-0005 §4). Null only means the id was not found.
 */
export function closeTab(tabs: TabState[], id: string, activeIndex: number): { tabs: TabState[]; activeIndex: number } | null {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return null;
  if (tabs.length === 1) {
    return { tabs: [{ id: createTabId(), document: createNewDocument() }], activeIndex: 0 };
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
 * 溢出菜单条目：Tab 过多被收纳时返回需要折叠的活动 Tab 序号（从 0 计），
 * 未溢出返回 null。展示宽度按每个 Tab 14rem 估算，超出画布约 64rem 即视为溢出。
 * @lang en
 * Overflow bookkeeping: when tabs no longer fit, return the first visible index that must be
 * collapsed (0-based), else null. Estimated at 14rem per tab with ~64rem of usable strip width.
 */
export function overflowStartIndex(tabs: TabState[], activeIndex: number, maxVisible = 4): number | null {
  if (tabs.length <= maxVisible) return null;
  return activeIndex < maxVisible ? maxVisible : activeIndex - maxVisible + 1;
}
