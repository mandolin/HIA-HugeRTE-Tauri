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
});
