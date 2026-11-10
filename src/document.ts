export const HTML_DOCUMENT_EXTENSIONS = ["htm", "html"] as const;

export interface DocumentState {
  content: string;
  path: string | null;
  dirty: boolean;
  /** 文档所在目录；仅用于把相对资源引用安全映射为可显示的内联数据，绝不写回磁盘。 */
  baseDir: string | null;
}

export interface DocumentPayload {
  content: string;
  path: string;
  /** 文档所在目录，由原生层提供。 */
  baseDir: string;
}

/** 创建一个尚未保存的 HTML 文档状态。 */
export function createNewDocument(): DocumentState {
  return {
    content: "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\" />\n  <title>未命名文档</title>\n</head>\n<body>\n  <p></p>\n</body>\n</html>\n",
    path: null,
    dirty: false,
    baseDir: null
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

/** 将已读取的本地文档转换为干净的编辑状态。 */
export function documentFromPayload(payload: DocumentPayload): DocumentState {
  return { content: payload.content, path: payload.path, dirty: false, baseDir: payload.baseDir };
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
