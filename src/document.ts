export const HTML_DOCUMENT_EXTENSIONS = ["htm", "html"] as const;

export interface DocumentState {
  content: string;
  path: string | null;
  dirty: boolean;
}

export interface DocumentPayload {
  content: string;
  path: string;
}

/** 创建一个尚未保存的 HTML 文档状态。 */
export function createNewDocument(): DocumentState {
  return {
    content: "<!doctype html>\n<html>\n<head>\n  <meta charset=`utf-8` />\n  <title>未命名文档</title>\n</head>\n<body>\n  <p></p>\n</body>\n</html>\n",
    path: null,
    dirty: false
  };
}

/** 将已读取的本地文档转换为干净的编辑状态。 */
export function documentFromPayload(payload: DocumentPayload): DocumentState {
  return { content: payload.content, path: payload.path, dirty: false };
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
