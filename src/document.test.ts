import { describe, expect, it } from "vitest";
import { createNewDocument, documentFromPayload, ensureHtmlExtension, getDocumentLabel, isSupportedHtmlPath } from "./document";

describe("文档状态", () => {
  it("新建文档默认是未保存且未修改的 UTF-8 HTML", () => {
    const document = createNewDocument();
    expect(document.path).toBeNull();
    expect(document.dirty).toBe(false);
    expect(document.content).toContain("charset=`utf-8`");
  });

  it("仅接受 htm 和 html 扩展名，且忽略大小写", () => {
    expect(isSupportedHtmlPath("K:\\docs\\sample.HTM")).toBe(true);
    expect(isSupportedHtmlPath("K:\\docs\\sample.html")).toBe(true);
    expect(isSupportedHtmlPath("K:\\docs\\sample.txt")).toBe(false);
  });

  it("为没有受支持扩展名的另存为路径补充 html", () => {
    expect(ensureHtmlExtension("K:\\docs\\new-file")).toBe("K:\\docs\\new-file.html");
    expect(ensureHtmlExtension("K:\\docs\\old.htm")).toBe("K:\\docs\\old.htm");
  });

  it("从载荷恢复干净文档并显示文件名", () => {
    const document = documentFromPayload({ path: "K:\\docs\\sample.html", content: "<p>内容</p>", baseDir: "K:\\docs" });
    expect(document).toEqual({ path: "K:\\docs\\sample.html", content: "<p>内容</p>", dirty: false, baseDir: "K:\\docs" });
    expect(getDocumentLabel(document.path)).toBe("sample.html");
  });
});
