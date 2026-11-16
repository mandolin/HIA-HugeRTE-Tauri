export const HTML_DOCUMENT_EXTENSIONS = ["htm", "html"] as const;

/**
 * @lang zh-CN
 * 单个文档的完整状态。`content` 始终是**完整文档文本**（含 doctype/head——缺陷修复
 * 2026-11-17：此前编辑后 `getContent()` 只返回 body 片段，保存会丢失 `<!doctype>`、
 * `<meta charset>`、`<title>` 等全部文档级 head 内容）；`documentPrefix`/`documentSuffix`
 * 是拆分缓存——HugeRTE（无 fullpage 机制）只承载 body，编辑器往返时用
 * `documentPrefix + body 内容 + documentSuffix` 重组完整文档，body 段 =
 * `content.slice(prefix.length, content.length - suffix.length)`。
 * 不变量：`documentPrefix + body 段 + documentSuffix === content`，所有写入方必须维护。
 * `documentPrefix` 为空串表示 body 片段文档（无 body 标签，编辑器可整体承载）。
 * @lang en
 * Full state of one document. `content` always holds the **complete document text** (doctype and
 * head included — defect fix 2026-11-17: `getContent()` used to return only a body fragment after
 * edits, so saving lost `<!doctype>`, `<meta charset>`, `<title>` and every other document-level
 * head item). `documentPrefix`/`documentSuffix` are split caches — HugeRTE (no fullpage
 * mechanism) carries only the body, so editor round-trips reassemble the full document as
 * `documentPrefix + body section + documentSuffix`, with the body section =
 * `content.slice(prefix.length, content.length - suffix.length)`.
 * Invariant: `documentPrefix + body section + documentSuffix === content`; every writer must keep
 * it. An empty `documentPrefix` marks a body-fragment document (no body tag; the editor carries it
 * whole).
 */
export interface DocumentState {
  /** @lang zh-CN 完整文档文本（doctype + head + body）。 / @lang en The complete document text (doctype + head + body). */
  content: string;
  path: string | null;
  dirty: boolean;
  /** 文档所在目录；仅用于把相对资源引用安全映射为可显示的内联数据，绝不写回磁盘。 */
  baseDir: string | null;
  /** @lang zh-CN body 开标签及之前的全部文本（doctype/html 开/head），编辑器往返重组用。 / @lang en All text up to and including the body open tag (doctype/html open/head), used to reassemble across editor round-trips. */
  documentPrefix: string;
  /** @lang zh-CN body 闭标签及之后的全部文本（通常为 </body></html>），编辑器往返重组用。 / @lang en All text from the body close tag onward (usually </body></html>), used to reassemble across editor round-trips. */
  documentSuffix: string;
}

export interface DocumentPayload {
  content: string;
  path: string;
  /** 文档所在目录，由原生层提供。 */
  baseDir: string;
}

/**
 * @lang zh-CN
 * 把文档文本拆为「body 前缀 / body 内容 / body 后缀」三段（ADR-0006）：
 * - 以首个 `<body …>` 开标签（大小写不敏感，属性保留在原文本中）为界取前缀；
 * - body 内容 = 前缀之后到最后一个 `</body>` 之间的文本（正文中的字面 `</body>` 文本
 *   因此留在 body 段内）；
 * - 后缀 = 该 `</body>` 起的全部剩余文本（通常 `</body></html>`）。
 * 没有 body 开标签的输入视为 body 片段，原样作为 body 返回（前缀/后缀为空串）。
 * 不变量：`prefix + body + suffix === html`（有 body 标签时恒成立）。
 * @lang en
 * Split document text into "prefix / body / suffix" sections (ADR-0006):
 * - the prefix runs up to and including the first `<body …>` open tag (case-insensitive, with its
 *   attributes preserved verbatim);
 * - the body section is the text between that tag and the **last** `</body>` (a literal `</body>`
 *   string inside the content therefore stays inside the body section);
 * - the suffix is everything from that `</body>` onward (usually `</body></html>`).
 * Input without a body open tag is treated as a body fragment and returned as the body section
 * (empty prefix/suffix). Invariant: `prefix + body + suffix === html` (always holds when a body
 * tag exists).
 */
export function splitDocumentParts(html: string): { prefix: string; body: string; suffix: string } {
  const bodyOpenMatch = /<body\b[^>]*>/i.exec(html);
  if (!bodyOpenMatch) return { prefix: "", body: html, suffix: "" };
  const prefix = html.slice(0, bodyOpenMatch.index + bodyOpenMatch[0].length);
  const afterBodyOpen = html.slice(bodyOpenMatch.index + bodyOpenMatch[0].length);
  const bodyCloseIndex = afterBodyOpen.toLowerCase().lastIndexOf("</body>");
  if (bodyCloseIndex < 0) return { prefix, body: afterBodyOpen, suffix: "" };
  return { prefix, body: afterBodyOpen.slice(0, bodyCloseIndex), suffix: afterBodyOpen.slice(bodyCloseIndex) };
}

/** 创建一个尚未保存的 HTML 文档状态。 */
export function createNewDocument(): DocumentState {
  const content = "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\" />\n  <title>未命名文档</title>\n</head>\n<body>\n  <p></p>\n</body>\n</html>\n";
  const parts = splitDocumentParts(content);
  return {
    content,
    path: null,
    dirty: false,
    baseDir: null,
    documentPrefix: parts.prefix,
    documentSuffix: parts.suffix
  };
}

/**
 * @lang zh-CN
 * 生成「放弃未保存修改」确认模态的正文文案：区分已有保存路径的文档与未命名文档，
 * 未命名文档额外提示尚未落盘并指引先保存。供界面模态与测试共用（DEF-1 方案 B）。
 * @lang en
 * Build the body copy for the discard-changes confirmation modal: distinguish documents that
 * already have a save path from untitled ones; the untitled variant additionally notes that
 * nothing has been written to disk yet and points to saving first. Shared by the UI modal and
 * tests (DEF-1 option B).
 */
export function buildDiscardConfirmMessage(path: string | null): string {
  if (!path) {
    return "当前文档 未命名文档 有尚未保存的修改（尚未保存到任何文件）。继续操作将放弃这些修改，且无法撤销。若需保留，请先取消并使用「保存」或「另存为」。";
  }
  return `当前文档 ${getDocumentLabel(path)} 有尚未保存的修改。继续操作将放弃这些修改，且无法撤销。`;
}

/** 将已读取的本地文档转换为干净的编辑状态（同时缓存整页拆分段，供编辑器往返重组）。 */
export function documentFromPayload(payload: DocumentPayload): DocumentState {
  const parts = splitDocumentParts(payload.content);
  return {
    content: payload.content,
    path: payload.path,
    dirty: false,
    baseDir: payload.baseDir,
    documentPrefix: parts.prefix,
    documentSuffix: parts.suffix
  };
}

/** 只接受本应用第一期明确支持的 HTML 文件扩展名。 */
export function isSupportedHtmlPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && HTML_DOCUMENT_EXTENSIONS.includes(extension as typeof HTML_DOCUMENT_EXTENSIONS[number]);
}

/** 为另存为路径补充默认的 .html 扩展名。 */
export function ensureHtmlExtension(path: string): string {
  return isSupportedHtmlPath(path) ? path : `${path}.html`;
}

/** 从 Windows 路径或其他平台路径中取得适合显示的文件名。 */
export function getDocumentLabel(path: string | null): string {
  if (!path) return "未命名文档";
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path;
}
