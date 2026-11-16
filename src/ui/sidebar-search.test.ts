import { describe, expect, it } from "vitest";
import { scanContentLineHits } from "./sidebar-search";

describe("侧栏搜索扫描（W-hrt-P14 F2）", () => {
  it("空查询与空白查询返回空结果", () => {
    expect(scanContentLineHits("<p>日程</p>", "")).toEqual({ hits: [], truncated: false });
    expect(scanContentLineHits("<p>日程</p>", "   ")).toEqual({ hits: [], truncated: false });
  });

  it("大小写不敏感且 match 保留行内原始大小写", () => {
    const result = scanContentLineHits("<P>Schedule Plan</P>", "schedule");
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].line).toBe(1);
    expect(result.hits[0].match).toBe("Schedule");
    expect(result.hits[0].before).toBe("<P>");
    expect(result.hits[0].after).toBe(" Plan</P>");
    expect(result.truncated).toBe(false);
  });

  it("按行号报告每行首个命中且多行各成一条", () => {
    const content = "<ul>\n  <li>会议记录一</li>\n  <li>其他事项</li>\n  <li>会议记录二</li>\n</ul>";
    const result = scanContentLineHits(content, "会议");
    expect(result.hits.map((hit) => hit.line)).toEqual([2, 4]);
    expect(result.hits[0].match).toBe("会议");
    expect(result.hits[1].after).toBe("记录二</li>");
  });

  it("上下文超出行边界时以省略号标注", () => {
    // 中文：命中前超窗（24 字符）——before 以「…」开头且长度不超窗口；行尾超长——after 带「…」。
    // English: The pre-hit context exceeds the window (24 chars) — before starts with an ellipsis
    //          and never exceeds the window; the tail is long — after carries an ellipsis.
    const longTail = `<p>${"甲".repeat(80)}目标${"乙".repeat(80)}</p>`;
    const result = scanContentLineHits(longTail, "目标");
    expect(result.hits[0].before.startsWith("…")).toBe(true);
    expect(result.hits[0].before.length).toBeLessThanOrEqual(1 + 24);
    expect(result.hits[0].after.endsWith("…")).toBe(true);
    expect(result.hits[0].after.length).toBeLessThanOrEqual(1 + 48);
    // 中文：命中紧贴行首（前文不足窗口）——before 无省略号。
    // English: The hit sits at the line start (context under the window) — no leading ellipsis.
    const resultStart = scanContentLineHits("<p>目标甲乙</p>", "目标");
    expect(resultStart.hits[0].before).toBe("<p>");
    // 中文：命中在行尾（后文不足窗口）——after 无省略号。
    // English: The hit sits at the line end (context under the window) — no trailing ellipsis.
    const resultEnd = scanContentLineHits("<p>前言目标</p>", "目标");
    expect(resultEnd.hits[0].after).toBe("</p>");
  });

  it("命中行数超过 maxHits 时截断并置 truncated", () => {
    const content = Array.from({ length: 8 }, (_, index) => `<p>第${index}行关键字</p>`).join("\n");
    const result = scanContentLineHits(content, "关键字", 3);
    expect(result.hits).toHaveLength(3);
    expect(result.hits.map((hit) => hit.line)).toEqual([1, 2, 3]);
    expect(result.truncated).toBe(true);
  });

  it("处理 CRLF 与孤立 CR 行尾", () => {
    const result = scanContentLineHits("<p>一</p>\r\n<p>目标甲</p>\r<p>目标乙</p>", "目标");
    expect(result.hits.map((hit) => hit.line)).toEqual([2, 3]);
  });
});
