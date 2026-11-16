/**
 * @lang zh-CN
 * 侧栏「搜索」态的纯扫描逻辑（W-hrt-P14 F2）：在一段 HTML 源码文本中按行查找关键字，
 * 产出「行号 + 上下文片段」命中列表，供搜索结果面板按文件分组渲染。
 * 设计约束：
 * - 只做**纯字符串扫描**，不触 DOM、不触 Tauri——调用方（main.ts）负责取各 Tab 的
 *   `document.content` 与渲染，本模块可独立单测。
 * - 行号基于 HTML 源码行（与后续 F1 源码视图同一坐标），不是渲染正文行。
 * - 大小写不敏感；每行只报**首个**命中（一行一条结果，行内多处命中不重复展开）。
 * - 上下文窗口为固定字符数，截断处以「…」标注（before 前缀 / after 后缀）。
 * - 空白查询返回空结果；命中数超过 maxHits 时截断并以 truncated 标记。
 * @lang en
 * Pure scan logic for the sidebar's "Search" state (W-hrt-P14 F2): finds a keyword line by line
 * inside a piece of HTML source text and produces a "line number + context snippet" hit list for
 * the search-results panel to render grouped by file. Design constraints:
 * - Pure string scanning only — no DOM, no Tauri. The caller (main.ts) fetches each tab's
 *   `document.content` and renders; this module stays independently unit-testable.
 * - Line numbers refer to HTML source lines (same coordinates as the future F1 source view),
 *   not to the rendered body.
 * - Case-insensitive; only the **first** hit per line is reported (one result row per line;
 *   multiple hits inside one line are not expanded).
 * - Context windows are fixed character counts, with truncation marked by an ellipsis
 *   ("…" as the before prefix / after suffix).
 * - A blank query yields an empty result; when hits exceed maxHits the list truncates with a
 *   truncated flag.
 */

/** @lang zh-CN 单条命中：行号（1 起算）与匹配前/匹配/匹配后的上下文片段（截断处带「…」）。 / @lang en One hit: line number (1-based) plus before/match/after context snippets (truncations carry an ellipsis). */
export interface SidebarSearchHit {
  /** @lang zh-CN 命中所在行，从 1 起算。 / @lang en The line containing the hit, starting at 1. */
  line: number;
  /** @lang zh-CN 命中之前的上下文（可能以「…」开头表示有更多内容）。 / @lang en Context before the match (may start with an ellipsis meaning more content exists). */
  before: string;
  /** @lang zh-CN 命中文本本身（保留行内原始大小写）。 / @lang en The matched text itself (original in-line casing preserved). */
  match: string;
  /** @lang zh-CN 命中之后的上下文（可能以「…」结尾表示有更多内容）。 / @lang en Context after the match (may end with an ellipsis meaning more content exists). */
  after: string;
}

/** @lang zh-CN 单个文档（一段内容）的扫描结果：命中列表与是否被截断。 / @lang en Scan result for one document (one content string): hit list plus whether it was truncated. */
export interface SidebarScanResult {
  /** @lang zh-CN 有命中的行（每行一条，按行序）。 / @lang en Lines with hits (one entry per line, in line order). */
  hits: SidebarSearchHit[];
  /** @lang zh-CN 命中行数超过 maxHits 时为 true（结果被截断）。 / @lang en True when matching lines exceeded maxHits (results truncated). */
  truncated: boolean;
}

/** @lang zh-CN 匹配前的上下文窗口长度（字符数）。 / @lang en Context window length (characters) before the match. */
const BEFORE_WINDOW = 24;
/** @lang zh-CN 匹配后的上下文窗口长度（字符数）。 / @lang en Context window length (characters) after the match. */
const AFTER_WINDOW = 48;

/**
 * @lang zh-CN
 * 扫描一段内容（HTML 源码字符串）中的关键字命中：
 * 1. 按 `\r\n`/`\r`/`\n` 拆行；
 * 2. 逐行做大小写不敏感的子串查找（只取每行首个）；
 * 3. 以命中位置裁出上下文窗口，超出行边界处补「…」；
 * 4. 命中行数达到 maxHits 后停止收集，但继续统计以设置 truncated。
 * 复杂度为 O(内容长度)，20 个 Tab × 数十 KB 的内容在输入节流下可接受。
 * @lang en
 * Scan a content string (HTML source) for keyword hits:
 * 1. split into lines on `\r\n` / `\r` / `\n`;
 * 2. case-insensitive substring search per line (first hit only);
 * 3. slice the context window around the hit, appending "…" where the window clips the line;
 * 4. stop collecting once maxHits lines matched, but keep counting to set truncated.
 * Complexity is O(content length); 20 tabs × tens of KB is acceptable under input throttling.
 */
export function scanContentLineHits(content: string, query: string, maxHits = 20): SidebarScanResult {
  // 中文：空白查询（含纯空格）视为"未输入"，返回空结果而不是全量匹配。
  // English: A blank query (spaces only) counts as "nothing typed" — return empty instead of
  //          matching everything.
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return { hits: [], truncated: false };
  const lowerQuery = trimmedQuery.toLowerCase();
  const hits: SidebarSearchHit[] = [];
  const lines = content.split(/\r\n|\r|\n/);
  let truncated = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lowerLine = line.toLowerCase();
    const at = lowerLine.indexOf(lowerQuery);
    if (at < 0) continue;
    // 中文：达到上限后不再构造条目，但保留"还有更多"的事实——truncated 驱动面板提示。
    // English: Past the cap, stop building entries but keep the "more exist" fact — truncated
    //          drives the panel's notice.
    if (hits.length >= maxHits) {
      truncated = true;
      continue;
    }
    // 中文：上下文窗口——超出行的首/尾时截断并加「…」，保持片段可读且位置真实。
    // English: Context windows — clip at the line's start/end and mark with an ellipsis so the
    //          snippet stays readable and positionally truthful.
    const windowStart = Math.max(0, at - BEFORE_WINDOW);
    const windowEnd = Math.min(line.length, at + trimmedQuery.length + AFTER_WINDOW);
    hits.push({
      line: index + 1,
      before: `${windowStart > 0 ? "…" : ""}${line.slice(windowStart, at)}`,
      match: line.slice(at, at + trimmedQuery.length),
      after: `${line.slice(at + trimmedQuery.length, windowEnd)}${windowEnd < line.length ? "…" : ""}`
    });
  }
  return { hits, truncated };
}
