import { describe, expect, it } from "vitest";
import { createNewDocument, documentFromPayload } from "./document";
import { appendDocumentTab, closeTab, createUntitledTab, MAX_TABS, overflowStartIndex, summarizeTabs, type TabState } from "./tabs";

function payloadTab(path: string, dirty = false): TabState["document"] {
  const base = documentFromPayload({ path, content: `<p>${path}</p>`, baseDir: "K:\\docs" });
  return dirty ? { ...base, dirty: true } : base;
}

describe("多标签页状态规约", () => {
  it("新建标签页承载未命名文档且互不影响", () => {
    const tab = createUntitledTab();
    expect(tab.document.path).toBeNull();
    expect(tab.document.content).toContain('charset="utf-8"');
    const other = createUntitledTab();
    expect(tab.id).not.toBe(other.id);
  });

  it("追加文档标签页并在达到上限时拒绝", () => {
    let tabs: TabState[] = [{ id: createUntitledTab().id, document: createNewDocument() }];
    for (let i = 1; i < MAX_TABS; i += 1) {
      tabs = appendDocumentTab(tabs, payloadTab(`K:\\docs\\f${i}.html`))!;
    }
    expect(tabs).toHaveLength(MAX_TABS);
    expect(appendDocumentTab(tabs, payloadTab("K:\\docs\\overflow.html"))).toBeNull();
  });

  it("关闭标签页时活动索引右移、末尾左移、最后一片回退未命名文档", () => {
    const tabs: TabState[] = [
      { id: "a", document: payloadTab("K:\\docs\\a.html") },
      { id: "b", document: payloadTab("K:\\docs\\b.html", true) },
      { id: "c", document: payloadTab("K:\\docs\\c.html") }
    ];
    // 中文：关闭活动 Tab（索引 1 的 b）→ 活动 Tab 右移到 c（索引 1）。
    // English: Close the active tab (b at index 1) → active moves right to c (index 1).
    expect(closeTab(tabs, "b", 1)).toEqual({ tabs: [tabs[0], tabs[2]], activeIndex: 1 });
    // 中文：关闭尾 Tab（c，索引 2）→ 活动左移到 b（索引 1）。
    // English: Close the tail tab (c at index 2) → active moves left to b (index 1).
    expect(closeTab(tabs, "c", 2)!.activeIndex).toBe(1);
    // 中文：关闭前面的 Tab（a，索引 0）→ 活动索引跟着前移。
    // English: Closing an earlier tab (a at index 0) shifts the active index left.
    expect(closeTab(tabs, "a", 1)!.activeIndex).toBe(0);
    // 中文：关闭唯一 Tab → 回退单未命名文档。
    // English: Closing the only tab → fall back to a single untitled document.
    const single = closeTab([tabs[0]], "a", 0)!;
    expect(single.tabs).toHaveLength(1);
    expect(single.tabs[0].document.path).toBeNull();
    expect(closeTab(tabs, "missing", 0)).toBeNull();
  });

  it("摘要统计总数与未保存数", () => {
    const tabs: TabState[] = [
      { id: "a", document: payloadTab("K:\\docs\\a.html", true) },
      { id: "b", document: payloadTab("K:\\docs\\b.html") },
      { id: "c", document: payloadTab("K:\\docs\\c.html", true) }
    ];
    expect(summarizeTabs(tabs)).toEqual({ total: 3, dirty: 2 });
  });

  it("溢出计算返回折叠起点或 null", () => {
    const tabs: TabState[] = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, document: payloadTab(`K:\\docs\\t${i}.html`) }));
    expect(overflowStartIndex(tabs.slice(0, 3), 0)).toBeNull();
    expect(overflowStartIndex(tabs, 1)).toBe(4);
    expect(overflowStartIndex(tabs, 4)).toBe(1);
  });
});
