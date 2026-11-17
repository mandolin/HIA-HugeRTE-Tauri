import { describe, expect, it } from "vitest";
import { buildSessionRecord, draftTitle, nextDraftId, normalizeSessionRecord, SESSION_TAB_LIMIT } from "./session";

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
