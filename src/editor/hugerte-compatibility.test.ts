import { describe, expect, it } from "vitest";
import {
  buildDefaultCharacterMap,
  HUGERTE_COMPATIBILITY_PLUGINS,
  HUGERTE_COMPATIBILITY_TOOLBAR,
  HUGERTE_FONT_FAMILY_FORMATS,
  HUGERTE_FONT_SIZE_FORMATS
} from "./hugerte-compatibility-config";

describe("HugeRTE 兼容配置", () => {
  it("保留参考编辑器默认特殊字符组", () => {
    const characterMap = buildDefaultCharacterMap();
    expect(characterMap).toContainEqual(["✓".codePointAt(0), "Common symbols: Check mark"]);
    expect(characterMap).toContainEqual(["┼".codePointAt(0), "Box drawing: Box drawings vertical and horizontal"]);
    expect(characterMap).toContainEqual(["√".codePointAt(0), "Math: Square root"]);
    expect(characterMap).toContainEqual(["⚑".codePointAt(0), "OneNote tags: Flag"]);
    expect(characterMap).toContainEqual(["💻".codePointAt(0), "Laptop"]);
    expect(characterMap).toHaveLength(128);
  });

  it("保留会影响 HTML 命令结果的编辑器命令", () => {
    expect(HUGERTE_COMPATIBILITY_PLUGINS).toContain("lists");
    expect(HUGERTE_COMPATIBILITY_PLUGINS).toContain("table");
    expect(HUGERTE_COMPATIBILITY_TOOLBAR).toContain("outdent indent");
    expect(HUGERTE_COMPATIBILITY_TOOLBAR).toContain("bullist numlist checklist");
    expect(HUGERTE_COMPATIBILITY_TOOLBAR).toContain("alignjustify");
    expect(HUGERTE_COMPATIBILITY_TOOLBAR).toContain("htmlvCut htmlvCopy htmlvPaste htmlvPasteText htmlvSelectAll");
  });

  it("固定参考编辑器的字体格式契约", () => {
    expect(HUGERTE_FONT_SIZE_FORMATS).toBe("8pt 9pt 10pt 11pt 12pt 14pt 15pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt");
    expect(HUGERTE_FONT_FAMILY_FORMATS).toContain("霞鹜文楷等宽");
  });
});
