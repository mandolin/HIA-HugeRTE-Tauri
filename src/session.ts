/**
 * @lang zh-CN
 * 会话与草稿的纯数据规约（W-hrt-P14 F5/F7）：把「Tab 组」与「会话文件形态」互相转换，
 * 并生成稳定有序的草稿 id。设计约束：
 * - 只处理有保存路径的 Tab（未命名 Tab 不进会话——其内容由 F7 草稿兜底）；
 * - 超过上限（20）截断，活动索引夹取到合法区间；
 * - 不触 DOM、不触 Tauri，可独立单测（main.ts 负责调用原生命令）。
 * @lang en
 * Pure data rules for sessions and drafts (W-hrt-P14 F5/F7): convert between the "tab group" and
 * the session-file shape, and mint stable ordered draft ids. Design constraints:
 * - Only tabs with a saved path enter the session (untitled tabs are covered by F7 drafts);
 * - Exceeding the cap (20) truncates, and the active index clamps into range;
 * - No DOM and no Tauri — independently unit-testable (main.ts calls the native commands).
 */

/** @lang zh-CN 会话中的一个 Tab（与 Rust `SessionTab` 同构，camelCase）。 / @lang en One session tab (isomorphic to Rust's `SessionTab`, camelCase). */
export interface SessionTabRecord {
  path: string;
  pinned: boolean;
  alias: string | null;
}

/** @lang zh-CN 会话文件形态（与 Rust `SessionFile` 同构）。 / @lang en The session-file shape (isomorphic to Rust's `SessionFile`). */
export interface SessionRecord {
  version: number;
  tabs: SessionTabRecord[];
  activeIndex: number;
}

/** @lang zh-CN 会话 Tab 上限（与 MAX_TABS 一致）。 / @lang en The session tab cap (matching MAX_TABS). */
export const SESSION_TAB_LIMIT = 20;

/** @lang zh-CN 会话所需的最小 Tab 形态（main.ts 的 TabState 结构子集，避免循环依赖）。 / @lang en The minimal tab shape a session needs (a structural subset of main.ts's TabState, avoiding a circular import). */
export interface SessionSourceTab {
  pinned: boolean;
  alias: string | null;
  document: { path: string | null };
}

/**
 * @lang zh-CN
 * 会话恢复的**结果定位**纯逻辑（W-hrt-P14 F5，缺陷回归防护 2026-11-17）：给定「存档 Tab 顺序」、
 * 「每个存档项是否恢复成功」与「存档活动序号」，返回活动 Tab 在**成功序列**中的序号。
 * 关键不变量：失效项被跳过时，活动序号只在成功序列内夹取——绝不因跳过而指向相邻文档。
 * 返回 -1 表示没有任何成功项。
 * @lang en
 * Pure result-location logic for session restore (W-hrt-P14 F5, regression guard 2026-11-17):
 * given the archive order, a per-entry "restored successfully" flag list and the archived active
 * ordinal, return the active tab's ordinal within the **successful sequence**. Key invariant: when
 * entries fail and are skipped, the active ordinal clamps inside the successful sequence — it can
 * never point at a neighbouring document because of a skip. -1 means nothing succeeded.
 */
export function resolveRestoredActiveOrdinal(successFlags: boolean[], archivedActiveIndex: number): number {
  const successCount = successFlags.filter(Boolean).length;
  if (successCount === 0) return -1;
  // 中文：存档活动序号 → 在成功序列中的序号：数一数它之前有多少个成功项。
  //       活动项本身失败时落到「它之前的成功项数」（夹取到末尾），与运行期实现一致。
  // English: Archive active ordinal → ordinal within the successful sequence: count how many
  //          successes precede it. When the active entry itself failed, fall back to the number of
  //          successes before it (clamped at the end), matching the runtime implementation.
  const clamped = Math.min(Math.max(archivedActiveIndex, 0), successFlags.length - 1);
  const preceding = successFlags.slice(0, clamped).filter(Boolean).length;
  return Math.min(preceding, successCount - 1);
}

/**
 * @lang zh-CN
 * 由当前 Tab 组构造会话记录：过滤未命名 Tab（无路径）→ 截断到上限 → 以**过滤后**的
 * 活动位置重算 activeIndex（原索引越过过滤边界时夹到最后一片）。
 * @lang en
 * Build a session record from the current tab group: drop untitled tabs (no path) → truncate to
 * the cap → recompute activeIndex from the **filtered** position (clamped to the last tab when the
 * original index crossed the filtered boundary).
 */
export function buildSessionRecord(tabs: SessionSourceTab[], activeIndex: number): SessionRecord {
  const candidates = tabs
    .map((tab, index) => ({ tab, index }))
    .filter((entry) => entry.tab.document.path !== null);
  const kept = candidates.slice(0, SESSION_TAB_LIMIT);
  const records: SessionTabRecord[] = kept.map((entry) => ({
    path: entry.tab.document.path as string,
    pinned: entry.tab.pinned,
    alias: entry.tab.alias
  }));
  // 中文：活动 Tab 在保留序列中的位置。它不在其中时（被截断或未命名被过滤）夹取原索引到
  //       保留区间——活动 Tab 越过上限截断 → 落到最后一片；活动为未命名 → 通常归 0。
  // English: The active tab's position within the kept sequence. When it is absent (truncated away
  //          or filtered as untitled), clamp the original index into the kept range — an active tab
  //          beyond the cap lands on the last kept tab; an untitled active tab normally lands on 0.
  const keptActive = kept.findIndex((entry) => entry.index === activeIndex);
  const safeActive = kept.length === 0
    ? 0
    : keptActive >= 0
      ? keptActive
      : Math.min(activeIndex, kept.length - 1);
  return { version: 1, tabs: records, activeIndex: safeActive };
}

/**
 * @lang zh-CN
 * 校验并规整读到的会话记录（防御损坏/旧版数据）：未知结构返回 null；非法的 pinned/alias
 * 按默认处理；超限截断；活动索引夹取。`restorable` 过滤交给调用方（需按文件存在性探测）。
 * @lang en
 * Validate and normalize a loaded session record (defence against corrupt/old data): unknown
 * shapes yield null; invalid pinned/alias fall back to defaults; overflow truncates; the active
 * index clamps. Existence filtering is the caller's job (files must be probed).
 */
export function normalizeSessionRecord(raw: unknown): SessionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as { tabs?: unknown; activeIndex?: unknown };
  if (!Array.isArray(candidate.tabs)) return null;
  const tabs: SessionTabRecord[] = [];
  for (const item of candidate.tabs.slice(0, SESSION_TAB_LIMIT)) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as { path?: unknown; pinned?: unknown; alias?: unknown };
    if (typeof entry.path !== "string" || entry.path.length === 0) continue;
    tabs.push({
      path: entry.path,
      pinned: entry.pinned === true,
      alias: typeof entry.alias === "string" && entry.alias.trim().length > 0 ? entry.alias.trim() : null
    });
  }
  if (tabs.length === 0) return null;
  const rawActive = typeof candidate.activeIndex === "number" ? Math.floor(candidate.activeIndex) : 0;
  return { version: 1, tabs, activeIndex: Math.min(Math.max(rawActive, 0), tabs.length - 1) };
}

/** @lang zh-CN 草稿元数据（与 Rust `DraftEntry` 同构；content 由原生层填充）。 / @lang en Draft metadata (isomorphic to Rust's `DraftEntry`; content is filled by the native layer). */
export interface DraftRecord {
  id: string;
  origin: string | null;
  title: string;
  savedAt: string;
  content?: string;
}

/**
 * @lang zh-CN
 * 生成草稿 id（`draft-<序号>`）：序号取现有草稿最大序号 + 1，保证同一会话内稳定递增、
 * 且满足原生层的白名单（仅数字）。空清单从 1 起。
 * @lang en
 * Mint a draft id (`draft-<n>`): the sequence is one past the largest existing id, staying
 * monotonic within the session and matching the native whitelist (digits only). An empty list
 * starts at 1.
 */
export function nextDraftId(existing: DraftRecord[]): string {
  let max = 0;
  for (const draft of existing) {
    const match = /^draft-(\d+)$/.exec(draft.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `draft-${max + 1}`;
}

/**
 * @lang zh-CN
 * 草稿标题：有来源路径用文件名，否则「未命名文档」——与 Tab 显示一致，也用于启动提示条文案。
 * @lang en
 * Draft title: the file name when an origin path exists, otherwise "untitled document" — matching
 * tab display and reused in the startup banner copy.
 */
export function draftTitle(origin: string | null): string {
  if (!origin) return "未命名文档";
  const normalized = origin.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || origin;
}
