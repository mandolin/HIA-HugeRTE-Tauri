import { describe, expect, it } from "vitest";
import { normalizeCompatibilityHtml } from "./html-output-normalizer";

describe("HugeRTE 输出规范化", () => {
  it("保留普通列表的标准 HTML 结构", () => {
    expect(normalizeCompatibilityHtml("<ul>\n  <li>列表兼容性</li>\n</ul>"))
      .toBe("<ul><li>列表兼容性</li></ul>");
  });

  it("仅忽略 Checklist 的运行时标识，不丢失兼容语义", () => {
    const actual = '<ul id="tox-checklist-17" class="tox-checklist htmlv-checklist">\n  <li class="tox-checklist-item htmlv-checklist-item" data-checked="false" data-htmlv-task-id="htmlv-task-mrzcstgs-rehfwx">清单兼容性</li>\n</ul>';
    expect(normalizeCompatibilityHtml(actual)).toBe(
      '<ul id="tox-checklist" class="tox-checklist htmlv-checklist"><li class="tox-checklist-item htmlv-checklist-item" data-checked="false" data-htmlv-task-id="htmlv-task">清单兼容性</li></ul>'
    );
  });

  it("不改动用户普通文档的 HTML 语义，仅去除标签间格式化空白", () => {
    const userDoc = [
      "<!doctype html>",
      '<html lang="zh">',
      "<head><title>未命名文档</title></head>",
      "<body><p>普通段落</p><table><tr><td>单元格</td></tr></table></body>",
      "</html>",
    ].join("\n");
    expect(normalizeCompatibilityHtml(userDoc)).toBe(
      "<!doctype html><html lang=\"zh\"><head><title>未命名文档</title></head><body><p>普通段落</p><table><tr><td>单元格</td></tr></table></body></html>"
    );
  });

  it("不重写非 Checklist 的 id 与 data 属性", () => {
    const actual = '<div id="section-3" data-custom="keep-me"><p>保留属性</p></div>';
    expect(normalizeCompatibilityHtml(actual)).toBe(
      '<div id="section-3" data-custom="keep-me"><p>保留属性</p></div>'
    );
  });

  it("规范化不同数字的多个 Checklist 实例为同一可比形态", () => {
    const actual = [
      '<ul id="tox-checklist-2" class="tox-checklist htmlv-checklist">',
      '  <li class="tox-checklist-item htmlv-checklist-item" data-checked="true" data-htmlv-task-id="htmlv-task-aaa">已勾选</li>',
      "</ul>",
      '<ul id="tox-checklist-9" class="tox-checklist htmlv-checklist">',
      '  <li class="tox-checklist-item htmlv-checklist-item" data-checked="false" data-htmlv-task-id="htmlv-task-bbb">未勾选</li>',
      "</ul>",
    ].join("\n");
    expect(normalizeCompatibilityHtml(actual)).toBe(
      '<ul id="tox-checklist" class="tox-checklist htmlv-checklist"><li class="tox-checklist-item htmlv-checklist-item" data-checked="true" data-htmlv-task-id="htmlv-task">已勾选</li></ul><ul id="tox-checklist" class="tox-checklist htmlv-checklist"><li class="tox-checklist-item htmlv-checklist-item" data-checked="false" data-htmlv-task-id="htmlv-task">未勾选</li></ul>'
    );
  });
});
