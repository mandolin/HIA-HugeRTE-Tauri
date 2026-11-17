import { describe, expect, it } from "vitest";
import { documentFromPayload } from "./document";
import {
  appendDocumentTab,
  closeTab,
  createUntitledTab,
  MAX_TABS,
  normalizeTabAlias,
  overflowStartIndex,
  setTabAlias,
  setTabPinned,
  summarizeTabs,
  TAB_ALIAS_MAX_LENGTH,
  type TabState
} from "./tabs";

function payloadTab(path: string, dirty = false): TabState["document"] {
  const base = documentFromPayload({ path, content: `<p>${path}</p>`, baseDir: "K:\\docs" });
  return dirty ? { ...base, dirty: true } : base;
}

function fileTab(id: string, path: string, extra: Partial<TabState> = {}): TabState {
  return { id, document: payloadTab(path), pinned: false, alias: null, ...extra };
}

describe("多标签页状态规约", () => {
  it("新建标签页承载未命名文档且互不影响", () => {
    const tab = createUntitledTab();
    expect(tab.document.path).toBeNull();
    expect(tab.document.content).toContain('charset="utf-8"');
    expect(tab.pinned).toBe(false);
    expect(tab.alias).toBeNull();
    const other = createUntitledTab();
    expect(tab.id).not.toBe(other.id);
  });

  it("追加文档标签页并在达到上限时拒绝", () => {
    let tabs: TabState[] = [createUntitledTab()];
    for (let i = 1; i < MAX_TABS; i += 1) {
      tabs = appendDocumentTab(tabs, payloadTab(`K:\\docs\\f${i}.html`))!;
    }
    expect(tabs).toHaveLength(MAX_TABS);
    expect(appendDocumentTab(tabs, payloadTab("K:\\docs\\overflow.html"))).toBeNull();
  });

  it("关闭标签页时活动索引右移、末尾左移、最后一片回退未命名文档", () => {
    const tabs: TabState[] = [
      fileTab("a", "K:\\docs\\a.html"),
      fileTab("b", "K:\\docs\\b.html", { document: payloadTab("K:\\docs\\b.html", true) }),
      fileTab("c", "K:\\docs\\c.html")
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
    // 中文：关闭唯一 Tab → 回退单未命名文档（pinned/alias 归零）。
    // English: Closing the only tab → fall back to a single untitled document (pinned/alias reset).
    const single = closeTab([tabs[0]], "a", 0)!;
    expect(single.tabs).toHaveLength(1);
    expect(single.tabs[0].document.path).toBeNull();
    expect(single.tabs[0].pinned).toBe(false);
    expect(single.tabs[0].alias).toBeNull();
    expect(closeTab(tabs, "missing", 0)).toBeNull();
  });

  it("摘要统计总数与未保存数", () => {
    const tabs: TabState[] = [
      fileTab("a", "K:\\docs\\a.html", { document: payloadTab("K:\\docs\\a.html", true) }),
      fileTab("b", "K:\\docs\\b.html"),
      fileTab("c", "K:\\docs\\c.html", { document: payloadTab("K:\\docs\\c.html", true) })
    ];
    expect(summarizeTabs(tabs)).toEqual({ total: 3, dirty: 2 });
  });

  it("溢出计算返回折叠起点或 null", () => {
    const tabs: TabState[] = Array.from({ length: 5 }, (_, i) => fileTab(`t${i}`, `K:\\docs\\t${i}.html`));
    expect(overflowStartIndex(tabs.slice(0, 3), 0)).toBeNull();
    expect(overflowStartIndex(tabs, 1)).toBe(4);
    expect(overflowStartIndex(tabs, 4)).toBe(1);
  });
});

describe("Tab 固定与别名（W-hrt-P14 F6）", () => {
  it("固定 Tab 不参与溢出折叠且始终可见", () => {
    const tabs: TabState[] = [
      fileTab("a", "K:\\docs\\a.html", { pinned: true }),
      fileTab("b", "K:\\docs\\b.html"),
      fileTab("c", "K:\\docs\\c.html"),
      fileTab("d", "K:\\docs\\d.html"),
      fileTab("e", "K:\\docs\\e.html"),
      fileTab("f", "K:\\docs\\f.html")
    ];
    // 中文：6 片 Tab、1 片固定 → 非固定 5 片 > 4 → 前段满容量可见（b/c/d/e，下标 1–4），
    //       折叠点为第 5 个非固定 Tab（f，下标 5）；a（固定）始终可见。
    // English: 6 tabs with 1 pinned → 5 non-pinned > 4 → the head fills the capacity (b/c/d/e,
    //          indexes 1-4) and the collapse point is the 5th non-pinned tab (f, index 5);
    //          a (pinned) stays visible.
    expect(overflowStartIndex(tabs, 1)).toBe(5);
    // 中文：活动 Tab 本身固定（序数 -1）→ 同样前段满容量，折叠点仍为下标 5。
    // English: The active tab itself is pinned (ordinal -1) → the head again fills the capacity,
    //          so the collapse point stays at index 5.
    expect(overflowStartIndex(tabs, 0)).toBe(5);
    // 中文：非固定只剩 4 片 → 不溢出。
    // English: Only 4 non-pinned tabs remain → no overflow.
    expect(overflowStartIndex(tabs.filter((tab) => tab.id !== "e"), 1)).toBeNull();
  });

  it("setTabPinned 返回新数组且不改原数组、未知 id 原样返回", () => {
    const tabs: TabState[] = [fileTab("a", "K:\\docs\\a.html")];
    const pinned = setTabPinned(tabs, "a", true);
    expect(pinned[0].pinned).toBe(true);
    expect(tabs[0].pinned).toBe(false);
    expect(setTabPinned(tabs, "missing", true)).toBe(tabs);
  });

  it("normalizeTabAlias 去空白、截断 30 字符、空值归 null", () => {
    expect(normalizeTabAlias("  每日日程  ")).toBe("每日日程");
    expect(normalizeTabAlias("甲".repeat(40))).toHaveLength(TAB_ALIAS_MAX_LENGTH);
    expect(normalizeTabAlias("   ")).toBeNull();
    expect(normalizeTabAlias("")).toBeNull();
    expect(normalizeTabAlias(null)).toBeNull();
    expect(normalizeTabAlias(undefined)).toBeNull();
  });

  it("setTabAlias 规整后写入、空串清除别名", () => {
    const tabs: TabState[] = [fileTab("a", "K:\\docs\\a.html")];
    const renamed = setTabAlias(tabs, "a", "  每日日程 ");
    expect(renamed[0].alias).toBe("每日日程");
    const cleared = setTabAlias(renamed, "a", "");
    expect(cleared[0].alias).toBeNull();
    expect(setTabAlias(tabs, "missing", "别名")).toBe(tabs);
  });
});
