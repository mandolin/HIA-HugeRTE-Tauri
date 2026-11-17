import { describe, expect, it } from "vitest";
import mainSource from "./main.ts?raw";
import documentSource from "./document.ts?raw";
import rustSource from "../src-tauri/src/lib.rs?raw";

/**
 * @lang zh-CN
 * 契约冻结的**静态断言**（W-hrt-P14 F8，`docs/contract-freeze.md`）：直接读取源码文本，校验
 * 公开承诺的常量与键名仍然存在。目的不是覆盖行为（行为由各自单测与 WIN 用例覆盖），而是在
 * 有人重命名/删除受冻结的键或快捷键时立刻失败——契约破裂必须是有意识的版本决策，而不是
 * 顺手改动。允许新增，禁止静默改名。
 * @lang en
 * **Static assertions** for the contract freeze (W-hrt-P14 F8, `docs/contract-freeze.md`):
 * read the source text and assert the publicly promised constants and key names still exist. The
 * goal is not behavioural coverage (unit tests and the Windows suite cover behaviour) but failing
 * immediately when someone renames or drops a frozen key or shortcut — breaking a contract must be
 * a deliberate version decision, never an incidental edit. Additions are allowed; silent renames
 * are not.
 */

/** @lang zh-CN 说明：源码文本经 Vite `?raw` 导入（项目未引入 @types/node，不做文件系统读取）。 / @lang en Note: source text comes in via Vite's `?raw` import (the project has no @types/node, so no filesystem reads). */

describe("契约冻结：界面状态键（docs/contract-freeze.md §5）", () => {
  const frozenKeys = [
    "hia-hugerte.ui-font-scale",
    "hia-hugerte.editor-font-size",
    "hia-hugerte.explorer-hidden",
    "hia-hugerte.explorer-width",
    "hia-hugerte.sidebar-mode",
    "hia-hugerte.source-view",
    "hia-hugerte.source-width",
    "hia-hugerte.source-sync-scroll",
    "hia-hugerte.menubar-mode",
    "hia-hugerte.history-disabled",
    "hia-hugerte.session-restore",
    "hia-hugerte.autosave"
  ];

  it.each(frozenKeys)("冻结键仍被使用：%s", (key) => {
    expect(mainSource).toContain(key);
  });
});

describe("契约冻结：快捷键（docs/contract-freeze.md §2）", () => {

  it("菜单冻结的四个快捷键仍绑定到对应动作", () => {
    // 中文：Ctrl+N/O/S 与 Ctrl+F 的菜单条目文案（含快捷键字符串）必须仍在；动作映射由菜单
    //       定义保证——此处只固定"承诺存在"，语义改动需走版本决策。
    // English: The Ctrl+N/O/S and Ctrl+F menu entries (including their shortcut strings) must
    //          remain; the action mapping lives in the menu definition — this pins "the promise
    //          exists", and semantic changes go through a version decision.
    expect(mainSource).toContain('shortcut: "Ctrl+N"');
    expect(mainSource).toContain('shortcut: "Ctrl+O"');
    expect(mainSource).toContain('shortcut: "Ctrl+S"');
    expect(mainSource).toContain('shortcut: "Ctrl+F"');
  });
});

describe("契约冻结：数据文件（docs/contract-freeze.md §4）", () => {

  it("会话与草稿文件路径与上限仍与契约一致", () => {
    expect(rustSource).toContain('"session.json"');
    expect(rustSource).toContain('"drafts.json"');
    expect(rustSource).toContain('"recent-files.json"');
    expect(rustSource).toContain("const SESSION_TAB_LIMIT: usize = 20;");
    expect(rustSource).toContain("const DRAFT_LIMIT: usize = 20;");
    expect(rustSource).toContain("const RECENT_FILES_LIMIT: usize = 50;");
  });

  it("草稿 id 白名单仍在原生层执行", () => {
    // 中文：路径相关的唯一前端输入仍受白名单约束——这是 §4 安全边界的实现锚点。
    // English: The only path-adjacent frontend input stays whitelisted — the implementation anchor
    //          of the §4 security boundary.
    expect(rustSource).toContain("fn is_valid_draft_id");
    expect(rustSource).toContain('strip_prefix("draft-")');
  });
});

describe("契约冻结：文档格式（docs/contract-freeze.md §1）", () => {

  it("整页拆分不变量与扩展名白名单仍存在", () => {
    expect(documentSource).toContain("export function splitDocumentParts");
    expect(documentSource).toContain("documentPrefix");
    expect(documentSource).toContain("documentSuffix");
    expect(documentSource).toContain('export const HTML_DOCUMENT_EXTENSIONS = ["htm", "html"] as const;');
  });
});
