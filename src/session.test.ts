import { describe, expect, it } from "vitest";
import { buildSessionRecord, draftTitle, nextDraftId, normalizeSessionRecord, resolveRestoredActiveOrdinal, SESSION_TAB_LIMIT } from "./session";

function sourceTab(path: string | null, pinned = false, alias: string | null = null) {
  return { pinned, alias, document: { path } };
}

describe("会话记录规约（W-hrt-P14 F5）", () => {
  it("只收录有路径的 Tab 并以过滤后位置重算活动索引", () => {
    const tabs = [sourceTab(null), sourceTab("K:\\docs\\a.html"), sourceTab("K:\\docs\\b.html", true, "乙")];
    // 中文：活动 Tab 是索引 2（b）→ 过滤掉未命名后它在保留序列里排第 1。
    // English: The active tab is index 2 (b) → after dropping the untitled tab it sits at 1.
    const record = buildSessionRecord(tabs, 2);
    expect(record.tabs.map((tab) => tab.path)).toEqual(["K:\\docs\\a.html", "K:\\docs\\b.html"]);
    expect(record.activeIndex).toBe(1);
    expect(record.tabs[1].pinned).toBe(true);
    expect(record.tabs[1].alias).toBe("乙");
    expect(record.version).toBe(1);
  });

  it("活动 Tab 为未命名时活动索引归 0", () => {
    const record = buildSessionRecord([sourceTab("K:\\docs\\a.html"), sourceTab(null)], 1);
    expect(record.tabs).toHaveLength(1);
    expect(record.activeIndex).toBe(0);
  });

  it("超过上限截断且活动索引夹取", () => {
    const tabs = Array.from({ length: 25 }, (_, index) => sourceTab(`K:\\docs\\f${index}.html`));
    const record = buildSessionRecord(tabs, 24);
    expect(record.tabs).toHaveLength(SESSION_TAB_LIMIT);
    expect(record.activeIndex).toBe(SESSION_TAB_LIMIT - 1);
  });

  it("无任何文件 Tab 时返回空记录（调用方据此清档）", () => {
    const record = buildSessionRecord([sourceTab(null)], 0);
    expect(record.tabs).toHaveLength(0);
    expect(record.activeIndex).toBe(0);
  });

  it("规整损坏/越界的会话数据", () => {
    expect(normalizeSessionRecord(null)).toBeNull();
    expect(normalizeSessionRecord({ tabs: "nope" })).toBeNull();
    expect(normalizeSessionRecord({ tabs: [] })).toBeNull();
    const normalized = normalizeSessionRecord({
      tabs: [{ path: "K:\\a.html", pinned: "yes", alias: "  别名  " }, { path: "" }, { path: 5 }],
      activeIndex: 99
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.tabs).toHaveLength(1);
    expect(normalized!.tabs[0]).toEqual({ path: "K:\\a.html", pinned: false, alias: "别名" });
    expect(normalized!.activeIndex).toBe(0);
  });
});

describe("会话恢复的活动 Tab 定位（缺陷回归防护 2026-11-17）", () => {
  it("全部成功时活动序号原样保留", () => {
    expect(resolveRestoredActiveOrdinal([true, true, true], 0)).toBe(0);
    expect(resolveRestoredActiveOrdinal([true, true, true], 2)).toBe(2);
  });

  it("失效项被跳过时活动 Tab 落在正确文档上（不串到相邻）", () => {
    // 中文：存档 [a, b, c]，b 失效，活动是 c（序号 2）→ 成功序列 [a, c] 内 c 的序号是 1。
    //       这正是重启后「显示成另一篇」缺陷的最小复现：若按原下标推算会得到 out-of-range 或 0。
    // English: Archive [a, b, c] with b missing and c active (ordinal 2) → within the successful
    //          sequence [a, c] the answer is 1. This is the minimal reproduction of the "shows a
    //          different document after restart" defect: naive index arithmetic yields out-of-range
    //          or 0.
    expect(resolveRestoredActiveOrdinal([true, false, true], 2)).toBe(1);
  });

  it("活动项本身失效时夹取到它之前的最后一个成功项", () => {
    expect(resolveRestoredActiveOrdinal([true, true, false], 2)).toBe(1);
    expect(resolveRestoredActiveOrdinal([true, false, false], 1)).toBe(0);
  });

  it("无成功项返回 -1，越界序号夹取", () => {
    expect(resolveRestoredActiveOrdinal([false, false], 0)).toBe(-1);
    expect(resolveRestoredActiveOrdinal([], 0)).toBe(-1);
    expect(resolveRestoredActiveOrdinal([true, true], 99)).toBe(1);
    expect(resolveRestoredActiveOrdinal([true, true], -5)).toBe(0);
  });
});

describe("草稿规约（W-hrt-P14 F7）", () => {
  it("草稿 id 单调递增并避开非法格式", () => {
    expect(nextDraftId([])).toBe("draft-1");
    expect(nextDraftId([{ id: "draft-3", origin: null, title: "t", savedAt: "" }])).toBe("draft-4");
    expect(nextDraftId([
      { id: "draft-2", origin: null, title: "t", savedAt: "" },
      { id: "draft-9", origin: null, title: "t", savedAt: "" },
      { id: "bogus", origin: null, title: "t", savedAt: "" }
    ])).toBe("draft-10");
  });

  it("草稿标题取文件名或未命名文档", () => {
    expect(draftTitle("K:\\docs\\日程.html")).toBe("日程.html");
    expect(draftTitle("K:/docs/index.html")).toBe("index.html");
    expect(draftTitle(null)).toBe("未命名文档");
  });
});
