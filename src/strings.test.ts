import { describe, expect, it } from "vitest";
import mainSource from "./main.ts?raw";
import documentSource from "./document.ts?raw";
import { enDictionary, t, tf } from "./ui/strings";

/**
 * @lang zh-CN
 * i18n 机制的**静态覆盖断言**（W-hrt-P15）：①源码中所有 t()/tf() 使用的键都有英译
 * （缺失即英文界面出现中文回退）；②字典键集与源码键集一致（无孤儿键）。行为断言
 * （切换后菜单文案等）由浏览器探针承载（见 W-hrt-P15 账本）。
 * @lang en
 * **Static coverage assertions** for the i18n mechanism (W-hrt-P15): ① every t()/tf() key used
 * in source has an English translation (a missing one would surface Chinese in the English UI);
 * ② the dictionary keys match the source keys (no orphan entries). Behavioural assertions
 * (menu copy after switching) live in the browser probe (see the W-hrt-P15 ledger).
 */

/** @lang zh-CN 从源码文本提取 t("...") / tf("...") 的键，并做转义还原（反斜杠与引号）。 / @lang en Extract t("…")/tf("…") keys from source text, unescaping backslashes and quotes. */
function extractKeys(source: string): string[] {
  const keys: string[] = [];
  const pattern = /\b(?:t|tf)\("((?:[^"\\]|\\.)*)"(?:,\s*\{[^}]*\})?\)/g;
  for (const match of source.matchAll(pattern)) {
    // 中文：用 JSON.parse 还原运行时键值——JS 字符串与 JSON 的转义语义一致（\\ → 反斜杠、
    //       \" → 引号）；naive 的逐对替换会把「反斜杠 + 非转义字符」误当转义吃掉反斜杠
    //       （实测：%APPDATA%\\HIA 的键被剥成 %APPDATA%HIA——2026-11-18 覆盖测试抓到）。
    // English: Restore the runtime key via JSON.parse — JS string escaping matches JSON (\\ to a
    //       backslash, \" to a quote); a naive pairwise replace would treat "backslash + any char"
    //       as an escape and eat the backslash (measured: the %APPDATA%\\HIA key was stripped to
    //       %APPDATA%HIA — caught by the coverage test on 2026-11-18).
    keys.push(JSON.parse('"' + match[1] + '"'));
  }
  return keys;
}

describe("i18n 字典覆盖（W-hrt-P15）", () => {
  const en = enDictionary();
  const keys = [...extractKeys(mainSource), ...extractKeys(documentSource)];

  it("每个使用的键都有英译（缺失即英文界面回退中文）", () => {
    const missing = keys.filter((key) => en[key] === undefined);
    expect(missing).toEqual([]);
  });

  it("字典无孤儿键（所有英译键都被源码使用）", () => {
    const orphan = Object.keys(en).filter((key) => !keys.includes(key));
    expect(orphan).toEqual([]);
  });

  it("取词与参数替换按预期工作（zh-Hans 原样返回键）", () => {
    expect(t("已保存")).toBe("已保存");
    expect(tf("已恢复 {restored} 个文档", { restored: 3 })).toBe("已恢复 3 个文档");
  });
});
