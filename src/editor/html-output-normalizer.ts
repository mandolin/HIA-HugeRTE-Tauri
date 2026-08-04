/**
 * 中文：用于比较 HugeRTE 命令输出的最小规范化器。
 *
 * Checklist 的容器和任务标识由运行时生成；它们不改变文档语义，不能作为
 * 与参考编辑器进行等价比较时的差异。该函数仅规范化这些已知动态值和标签间
 * 的格式化空白，不用于用户文档的保存或展示。
 */
export function normalizeCompatibilityHtml(html: string): string {
  return html
    .trim()
    .replace(/\r\n?/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/\bid="tox-checklist-\d+"/g, 'id="tox-checklist"')
    .replace(/\bdata-htmlv-task-id="htmlv-task-[^"]+"/g, 'data-htmlv-task-id="htmlv-task"');
}
