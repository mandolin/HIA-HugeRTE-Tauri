import { describe, expect, it } from "vitest";
import { buildDiscardConfirmMessage, createNewDocument, documentFromPayload, ensureHtmlExtension, getDocumentLabel, isSupportedHtmlPath, splitDocumentParts } from "./document";

describe("文档状态", () => {
  it("新建文档默认是未保存且未修改的 UTF-8 HTML", () => {
    const document = createNewDocument();
    expect(document.path).toBeNull();
    expect(document.dirty).toBe(false);
    expect(document.content).toContain('charset="utf-8"');
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

  it("放弃修改确认文案区分已保存路径与未命名文档", () => {
    expect(buildDiscardConfirmMessage("K:\\docs\\sample.html")).toContain("sample.html");
    expect(buildDiscardConfirmMessage("K:\\docs\\sample.html")).not.toContain("尚未保存到任何文件");
    expect(buildDiscardConfirmMessage(null)).toContain("未命名文档");
    expect(buildDiscardConfirmMessage(null)).toContain("尚未保存到任何文件");
  });

  it("从载荷恢复干净文档并显示文件名", () => {
    const document = documentFromPayload({ path: "K:\\docs\\sample.html", content: "<p>内容</p>", baseDir: "K:\\docs" });
    expect(document).toEqual({ path: "K:\\docs\\sample.html", content: "<p>内容</p>", dirty: false, baseDir: "K:\\docs", documentPrefix: "", documentSuffix: "" });
    expect(getDocumentLabel(document.path)).toBe("sample.html");
  });
});

describe("整页结构拆分（缺陷修复：编辑后整页结构丢失）", () => {
  it("完整文档拆出前缀/body/后缀且重组还原原文", () => {
    const full = "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\" />\n  <title>示例</title>\n</head>\n<body>\n  <p>段落</p>\n</body>\n</html>\n";
    const parts = splitDocumentParts(full);
    expect(parts.prefix).toContain("<!doctype html>");
    expect(parts.prefix).toContain("<head>");
    expect(parts.prefix).toContain("charset=\"utf-8\"");
    expect(parts.prefix.endsWith("<body>")).toBe(true);
    expect(parts.body).toBe("\n  <p>段落</p>\n");
    expect(parts.suffix).toBe("</body>\n</html>\n");
    expect(parts.prefix + parts.body + parts.suffix).toBe(full);
  });

  it("body 开标签的属性保留在前缀里", () => {
    const full = "<!DOCTYPE html><html><body class=\"doc\" data-kind=\"x\"><p>内容</p></body></html>";
    const parts = splitDocumentParts(full);
    expect(parts.prefix).toBe("<!DOCTYPE html><html><body class=\"doc\" data-kind=\"x\">");
    expect(parts.body).toBe("<p>内容</p>");
    expect(parts.suffix).toBe("</body></html>");
    expect(parts.prefix + parts.body + parts.suffix).toBe(full);
  });

  it("body 片段（无 body 标签）原样作为 body，前缀后缀为空", () => {
    const fragment = "<p>纯片段</p><div>块</div>";
    const parts = splitDocumentParts(fragment);
    expect(parts).toEqual({ prefix: "", body: fragment, suffix: "" });
  });

  it("缺少 </body> 时后缀为空且 body 收下剩余全部", () => {
    const parts = splitDocumentParts("<html><body><p>未闭合</p>");
    expect(parts.prefix).toBe("<html><body>");
    expect(parts.body).toBe("<p>未闭合</p>");
    expect(parts.suffix).toBe("");
  });

  it("正文中的字面 </body> 文本归入 body（最后一个才是真闭合）", () => {
    const full = "<body><p>文档里有 </body> 字样</p></body></html>";
    const parts = splitDocumentParts(full);
    expect(parts.prefix).toBe("<body>");
    expect(parts.body).toBe("<p>文档里有 </body> 字样</p>");
    expect(parts.suffix).toBe("</body></html>");
    expect(parts.prefix + parts.body + parts.suffix).toBe(full);
  });

  it("新建文档与载荷文档自带前缀/后缀字段且可重组", () => {
    const created = createNewDocument();
    const createdParts = splitDocumentParts(created.content);
    expect(created.documentPrefix).toBe(createdParts.prefix);
    expect(created.documentSuffix).toBe(createdParts.suffix);
    const loaded = documentFromPayload({ path: "K:\\docs\\full.html", content: "<!doctype html><html><head><title>t</title></head><body><p>正文</p></body></html>", baseDir: "K:\\docs" });
    expect(loaded.documentPrefix).toContain("<!doctype html>");
    expect(loaded.documentPrefix).toContain("<title>t</title>");
    expect(loaded.documentSuffix).toBe("</body></html>");
  });
});
