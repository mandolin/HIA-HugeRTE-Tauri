#!/usr/bin/env node
/**
 * @lang zh-CN
 * 宣传资产生成器（`T-hrt-PROMOTION`，素材阶段）：驱动 `output/` 下的**真实便携 exe**，走一套
 * 确定性场景，一次产出：
 *   ① 终态截图组（`promo/screenshots/*.png`，中英各一套，1440×900 @2x）② 演示 GIF（`promo/demo-*.gif`）。
 * 产物可复跑：同一 exe + 同一脚本 → 同一场景序列。不使用浏览器模拟页面，**截图即产品**。
 *
 * @lang en
 * Promo asset generator (`T-hrt-PROMOTION`, asset phase): drives the **real portable exe** under
 * `output/` through one deterministic scenario and produces (1) the final screenshot set
 * (`promo/screenshots/*.png`, one set per language, 1440×900 at 2x) and (2) the demo GIFs
 * (`promo/demo-*.gif`). Re-runnable: same exe + same script → same scenario sequence. No simulated
 * browser page is used — **the screenshots are the product**.
 *
 * 用法 / Usage:
 *   node scripts/promo-shots.mjs [--lang zh|en|both] [--exe <path>] [--keep-open] [--port <n>]
 *
 * 约束 / Constraints:
 *   - 需 Node ≥ 22（全局 `WebSocket`）。/ Requires Node ≥ 22 (global `WebSocket`).
 *   - 仅本机使用：调试端口不进入发行物。/ Local only: the debug port never ships.
 *   - 场景文档由本脚本生成到 `C:\Users\Public\HIA-HugeRTE-demo\docs`（中性短路径，理由见
 *     `DOCS_DIR`），不引用任何真实个人文档。/ Scenario documents are generated into
 *     `C:\Users\Public\HIA-HugeRTE-demo\docs` (a neutral short path — see `DOCS_DIR` for why);
 *     no real personal document is referenced.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync, readFileSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

/** @lang zh-CN 仓库根目录（本脚本位于 `scripts/`）。 / @lang en Repository root (this script lives in `scripts/`). */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** @lang zh-CN 公开资产输出目录。 / @lang en Public asset output directory. */
const OUT_DIR = join(ROOT, "promo");
/** @lang zh-CN 运行 exe 的工作目录（`.gitignore` 已忽略 `temp/`）：exe 副本与应用的 `data/` 都落在这里，保证便携数据不污染仓库与发行目录。 / @lang en Working directory for the exe (`temp/` is git-ignored): the exe copy and the app's `data/` land here so portable data never touches the repo or the release directory. */
const RUN_DIR = join(ROOT, "temp", "promo-shots", "run");
/**
 * @lang zh-CN
 * 场景文档目录。**必须在中性短路径**（`C:\Users\Public\HIA-HugeRTE-demo\docs`），不能放在仓库或
 * 用户目录下：侧栏「资源」视图的面包屑会渲染文档的**绝对路径段**（`此电脑 › 盘符 › …`），文档若
 * 在仓库/用户目录下，截图会把本机目录结构泄进公开素材（2026-11-20 实测：`temp/promo-shots` 路径
 * 完整出现在面包屑里，属 AGENTS.md「公开材料不得提及私有路径」红线）。`C:\Users\Public` 是所有
 * 用户可写的标准目录，面包屑里只出现盘符与演示目录名。
 * @lang en
 * Scenario document directory. **Must be a neutral short path** (`C:\Users\Public\HIA-HugeRTE-demo\docs`),
 * never inside the repo or a user profile: the file-tree breadcrumb renders the document's **absolute
 * path segments** (`This PC › drive › …`), so documents under the repo or a user home would leak this
 * machine's directory layout into the public assets (measured 2026-11-20: the `temp/promo-shots` path
 * appeared verbatim in the breadcrumb — a violation of the "no private paths in public material" rule).
 * `C:\Users\Public` is the standard all-users-writable directory, so the breadcrumb only shows the
 * drive letter and the demo folder name.
 */
const DEMO_ROOT = "C:\\Users\\Public\\HIA-HugeRTE-demo";
/** @lang zh-CN 场景文档目录（见 `DEMO_ROOT`）。 / @lang en Scenario document directory (see `DEMO_ROOT`). */
const DOCS_DIR = join(DEMO_ROOT, "docs");
/** @lang zh-CN 面包屑防泄漏断言的黑名单片段：截图画面里绝不许出现的路径片段。 / @lang en Forbidden fragments for the breadcrumb anti-leak assertion: path pieces that must never appear in a frame. */
const BREADCRUMB_FORBIDDEN = [
  "Github_mandolin",
  "HIA-HugeRTE-Tauri",
  "work-zone",
  "promo-shots",
  "pathcheck",
  "\\Users\\admin",
];
/** @lang zh-CN 面包屑防泄漏断言的必备片段：证明文档确实在公开演示目录下。 / @lang en Required fragments proving the documents really sit in the public demo directory. */
const BREADCRUMB_REQUIRED = ["Public", "HIA-HugeRTE-demo"];

/**
 * @lang zh-CN
 * 命令行参数解析：`--lang` 选择素材语言集，`--exe` 指定要驱动的可执行文件，`--port` 指定调试端口，
 * `--keep-open` 结束后保留窗口（便于人工比对）。
 * @lang en
 * CLI parsing: `--lang` selects the asset language set, `--exe` points at the executable to drive,
 * `--port` sets the debug port, `--keep-open` leaves the window open for manual comparison.
 */
function parseArgs(argv) {
  const args = { lang: "both", exe: null, port: 9350, keepOpen: false, verifyAgainst: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lang") args.lang = argv[++i] ?? "both";
    else if (token === "--exe") args.exe = argv[++i] ?? null;
    else if (token === "--port") args.port = Number(argv[++i] ?? 9350);
    else if (token === "--keep-open") args.keepOpen = true;
    else if (token === "--verify-against") args.verifyAgainst = argv[++i] ?? null;
    else throw new Error(`未知参数 / Unknown argument: ${token}`);
  }
  if (!["zh", "en", "both"].includes(args.lang)) throw new Error(`--lang 只接受 zh/en/both / --lang accepts zh|en|both`);
  return args;
}

/**
 * @lang zh-CN
 * 定位要驱动的便携 exe：优先 `--exe`，否则取 `output/` 下版本号最大的
 * `HIA-HugeRTE-<version>-windows-x64/HIA HugeRTE.exe`。找不到即报错——**不允许回退到浏览器模拟**，
 * 否则「截图即产品」的承诺失效。
 * @lang en
 * Locate the portable exe to drive: `--exe` first, otherwise the highest-version
 * `HIA-HugeRTE-<version>-windows-x64/HIA HugeRTE.exe` under `output/`. Failing to find one is an
 * error — **never fall back to a simulated browser page**, which would break the "screenshots are
 * the product" promise.
 */
function resolveExecutable(explicit) {
  if (explicit) {
    const absolute = resolve(explicit);
    if (!existsSync(absolute)) throw new Error(`--exe 不存在 / --exe not found: ${absolute}`);
    return absolute;
  }
  const outputDir = join(ROOT, "output");
  if (!existsSync(outputDir)) throw new Error("缺少 output/ 目录。先运行 npm run portable:zip，或用 --exe 指定 exe。/ Missing output/; run npm run portable:zip or pass --exe.");
  // 版本号按语义比较（0.9.0 < 0.10.0），因此拆成数字段比较而不是字典序。
  const candidates = [];
  for (const entry of readDirNames(outputDir)) {
    const match = /^HIA-HugeRTE-(\d+)\.(\d+)\.(\d+)(?:-[^/]+)?-windows-x64$/.exec(entry);
    if (!match) continue;
    const exePath = join(outputDir, entry, "HIA HugeRTE.exe");
    if (existsSync(exePath)) candidates.push({ version: match.slice(1, 4).map(Number), dir: entry, exePath });
  }
  if (candidates.length === 0) throw new Error("output/ 下没有可用的便携目录。/ No usable portable directory under output/.");
  candidates.sort((a, b) => a.version[0] - b.version[0] || a.version[1] - b.version[1] || a.version[2] - b.version[2]);
  const chosen = candidates[candidates.length - 1];
  console.log(`[exe] 使用 / using: output/${chosen.dir}/HIA HugeRTE.exe`);
  return chosen.exePath;
}

/** @lang zh-CN 读目录名列表（空目录/不存在返回空数组，调用方自行决定是否报错）。 / @lang en Read directory entry names (missing/empty yields an empty array; the caller decides whether that is an error). */
function readDirNames(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * @lang zh-CN
 * 场景文档：三份构造的示例 HTML，覆盖本项目要展示的三类真实用法——带 `<style>` 与表格的产品手册
 * （文档保真）、发布说明（多正在编辑的目录）、常见问题（跨文档搜索的命中目标）。
 * 全部为构造内容，不含任何真实个人/公司资料；保存后会写入 `<title>` 等文档头，正好用于演示保真。
 * @lang en
 * Scenario documents: three constructed sample HTML files covering the three real usages this
 * project demonstrates — a manual with its own `<style>` and a table (document fidelity), release
 * notes (the actively edited document), and an FAQ (the cross-document search target). All content
 * is constructed and contains no real personal or company material; saving rewrites the document
 * head, which is exactly what the fidelity shot demonstrates.
 */
const SCENARIO_DOCS = {
  "manual.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deployment manual &middot; Chapter 3</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 32px auto; line-height: 1.75; color: #24303a; }
    h1 { border-bottom: 2px solid #0969da; padding-bottom: 8px; font-size: 26px; }
    h2 { font-size: 19px; margin-top: 26px; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #cfd8dc; padding: 7px 11px; text-align: left; }
    th { background: #f4f7f9; }
    code { background: #eef2f4; padding: 1px 5px; border-radius: 3px; }
    .note { background: #ddf4ff; border-left: 4px solid #0969da; padding: 10px 16px; margin: 18px 0; }
  </style>
</head>
<body>
  <h1>Chapter 3 &mdash; Installing on an offline machine</h1>
  <p>This chapter covers deployment on a machine that has no internet access. No step below requires a network connection.</p>
  <div class="note">Extract the archive and run <code>HIA HugeRTE.exe</code> directly. Administrator rights are not required.</div>
  <h2>3.1 &nbsp;Prerequisites</h2>
  <p>Confirm the target machine runs Windows 10 or 11 on x64 and has the WebView2 runtime available (Windows 11 ships it).</p>
  <h2>3.2 &nbsp;Extract the archive</h2>
  <p>Unpack the ZIP into any writable directory, for example <code>D:\\Tools\\HIA-HugeRTE</code>.</p>
  <h2>3.3 &nbsp;First launch</h2>
  <p>Double-click the executable. The first launch writes nothing to the registry and changes no system file associations.</p>
  <table>
    <thead><tr><th>Item</th><th>Requirement</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Operating system</td><td>Windows 10 / 11</td><td>x64</td></tr>
      <tr><td>Runtime</td><td>WebView2</td><td>Built into Windows 11</td></tr>
      <tr><td>Disk space</td><td>About 10 MB</td><td>After extraction</td></tr>
    </tbody>
  </table>
  <h2>3.4 &nbsp;Opening documents</h2>
  <p>To open HTML files with this application, register it into the <em>Open with</em> list explicitly from the Settings panel.</p>
</body>
</html>
`,
  "release-notes.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Release notes &middot; Spring 2026</title>
</head>
<body>
  <h1>Spring 2026 release notes</h1>
  <p>This release contains three improvements and two known limitations.</p>
  <h2>New</h2>
  <ul>
    <li>Open several documents at once and switch between them with tabs.</li>
    <li>Switch the sidebar between the file tree, the document outline and cross-document search.</li>
    <li>Restore the previous working set after closing and reopening the application.</li>
  </ul>
  <h2>Fixed</h2>
  <ul>
    <li>Saving no longer drops the encoding declaration from the document head.</li>
    <li>Long paths scroll horizontally in the file tree.</li>
  </ul>
  <h2>Known limitations</h2>
  <p>Only UTF-8 encoded HTML documents are supported, and there is no traditional installer yet.</p>
</body>
</html>
`,
  "faq.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Frequently asked questions</title>
</head>
<body>
  <h1>Frequently asked questions</h1>
  <h2>Installation</h2>
  <p>There is no installer: extract the archive and run the executable.</p>
  <h2>Network access</h2>
  <p>The application makes no network requests and never uploads document content.</p>
  <h2>Encoding</h2>
  <p>UTF-8 encoded .htm and .html files are supported.</p>
</body>
</html>
`,
};

/**
 * @lang zh-CN
 * 极简 CDP 会话：一行 `fetch /json` 取页面 target，用 Node 全局 `WebSocket` 建连，按 id 匹配回包。
 * 只实现本脚本需要的四个能力（求值、截图、画质参数、重载），不引入浏览器自动化框架。
 * @lang en
 * Minimal CDP session: one `fetch /json` to find the page target, a Node global `WebSocket` for the
 * connection, and id-matched replies. Only the four capabilities this script needs are implemented
 * (evaluate, screenshot, viewport metrics, reload) — no browser-automation framework is pulled in.
 */
async function connectCdp(port, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let targets = null;
  // 应用冷启动可能还没开好调试端口：轮询直到超时。
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await response.json();
      if (Array.isArray(list)) {
        targets = list;
        if (list.some((target) => target.type === "page")) break;
      }
    } catch {
      // 端口尚未监听，继续等待。/ Port not listening yet; keep waiting.
    }
    await sleep(300);
  }
  const page = targets?.find((target) => target.type === "page");
  if (!page) throw new Error(`调试端口 ${port} 上找不到页面目标 / no page target on debug port ${port}`);

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let messageId = 0;
  /** @lang zh-CN 未回包请求的等待表：id → {resolve, reject}。 / @lang en Pending-request table: id → {resolve, reject}. */
  const pending = new Map();
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id === undefined) return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(`${data.error.message ?? JSON.stringify(data.error)}`));
    else entry.resolve(data.result);
  };
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = () => resolveOpen();
    socket.onerror = (event) => rejectOpen(new Error(`CDP 连接失败 / CDP connection failed: ${event?.message ?? "unknown"}`));
  });

  /** @lang zh-CN 发一条 CDP 命令并等待结果。 / @lang en Send one CDP command and await its result. */
  const send = (method, params = {}) =>
    new Promise((resolveCall, rejectCall) => {
      const id = (messageId += 1);
      pending.set(id, { resolve: resolveCall, reject: rejectCall });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /**
   * @lang zh-CN 在页面上下文求值。返回 `{value}` 或 `{error}`——脚本表达式写错时报错而不是静默返回 undefined。
   * @lang en Evaluate in the page context. Returns `{value}` or `{error}` — a malformed expression
   * surfaces an error instead of silently yielding undefined.
   */
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      return { error: result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails) };
    }
    return { value: result.result?.value };
  };

  return { socket, send, evaluate };
}

/** @lang zh-CN 简单延时。 / @lang en A plain delay. */
function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * @lang zh-CN
 * 断言工具：任何一条失败都记录并在脚本末尾统一判定退出码——单条失败不中断整轮生成，
 * 便于一次看到全部问题（但**不允许**带着失败结果宣称产物可用）。
 * @lang en
 * Assertion helper: every failure is recorded and judged at the end of the run, so one round surfaces
 * all problems at once (but a run with any failure may **never** be reported as usable output).
 */
function createAssertions() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
    return Boolean(ok);
  };
  return { check, results };
}

/**
 * @lang zh-CN
 * 把场景文档写入运行目录，并清空上一次残留的 `data/`（会话、历史、草稿都会影响画面确定性）。
 * @lang en
 * Write the scenario documents into the run directory and clear any leftover `data/` from a
 * previous run (session, history and drafts would all make the frames non-deterministic).
 */
/**
 * @lang zh-CN
 * 判定两张截图是否「结构等价」，用于「重跑结果一致」的验收。
 *
 * 为什么不是字节相等：WebView2 的文字抗锯齿与布局取整会在同一场景下产生 **RGB 相差 1~9 的个别
 * 像素**（实测：两张 2880×1800 图只差 2~7 个像素，位于大纲行首箭头附近）。字节相等会把这类
 * 渲染抖动误判成「不一致」，而它既不可控、也不影响画面。
 *
 * 判据：差异像素占比极低（< 0.02%）**且**没有任何区域出现成片的差异（任一 64×64 分块的差异占比
 * 也低于阈值）。前者放过抗锯齿噪点，后者保证不会把「真正换了一屏」误判为等价。
 *
 * @lang en
 * Decide whether two screenshots are "structurally equivalent", the acceptance criterion for
 * "re-running yields the same result".
 *
 * Why not byte equality: WebView2's text antialiasing and layout rounding produce a **handful of
 * pixels off by 1–9 in RGB** for the same scene (measured: two 2880×1800 frames differed by only
 * 2–7 pixels, near the outline rows' caret glyphs). Byte equality would report that rendering jitter
 * as a mismatch, even though it is neither controllable nor visible.
 *
 * Criterion: the differing-pixel share is tiny (< 0.02%) **and** no region has a block of differences
 * (every 64×64 tile stays under the same threshold). The first condition tolerates antialiasing
 * noise; the second keeps a genuinely different screen from being called equivalent.
 */
function compareScreenshots(bufferA, bufferB) {
  const a = PNG.sync.read(bufferA);
  const b = PNG.sync.read(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    return { equivalent: false, reason: `尺寸不同 / size differs: ${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  const tileSize = 64;
  /** @lang zh-CN 每个分块的差异像素计数。 / @lang en Differing-pixel count per tile. */
  const tiles = new Map();
  let differing = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const offset = (y * a.width + x) * 4;
      if (a.data[offset] === b.data[offset] && a.data[offset + 1] === b.data[offset + 1] && a.data[offset + 2] === b.data[offset + 2]) continue;
      differing += 1;
      const key = `${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`;
      tiles.set(key, (tiles.get(key) ?? 0) + 1);
    }
  }
  const total = a.width * a.height;
  const share = differing / total;
  const worstTile = tiles.size ? Math.max(...tiles.values()) : 0;
  const tileShare = worstTile / (tileSize * tileSize);
  const equivalent = share < 0.0002 && tileShare < 0.02;
  return {
    equivalent,
    reason: equivalent
      ? `差异 ${differing} 像素（${(share * 100).toFixed(4)}%），最大分块 ${worstTile} 像素`
      : `差异过大 / too different: ${differing} 像素（${(share * 100).toFixed(3)}%），最大分块 ${worstTile} 像素`,
    differing,
    share,
  };
}

/**
 * @lang zh-CN
 * 把便携 exe 复制到运行目录，并把场景文档写进**独立的文档子目录**。
 *
 * 三点都是必需的：
 * 1. **复制 exe 而不是原地运行**：便携版把 `data/`（最近文件、会话、草稿）写在可执行文件旁边，
 *    直接在 `output/` 里跑会污染发布产物目录。
 * 2. **文档放进子目录**：侧栏文件树会列出活动文档所在目录的**全部条目**，若文档与 `data/`（运行时
 *    写入的会话/最近文件/草稿，每次运行内容都不同）同目录，画面就不确定（实测差异只出现在文件树区）。
 * 3. **每次完全重建运行目录**：不留上一轮的任何状态。
 *
 * @lang en
 * Copy the portable exe into the run directory and write the scenario documents into a **separate
 * documents subdirectory**.
 *
 * All three points are required:
 * 1. **Copy the exe rather than running it in place**: the portable build writes `data/` (recent files,
 *    session, drafts) next to the executable, so running inside `output/` pollutes the release artifact
 *    directory.
 * 2. **Keep documents in a subdirectory**: the file tree lists **every entry** of the active document's
 *    directory. Sharing that directory with `data/` — rewritten on each run with session, recent files
 *    and drafts — makes the frames non-deterministic (measured: the only differing pixels were in the
 *    file-tree region).
 * 3. **Rebuild the run directory from scratch** on every run: no state survives.
 */
function prepareScenario(exePath) {
  rmSync(RUN_DIR, { recursive: true, force: true });
  // 中文：文档目录也整体重建——上一轮保存过的文档若残留，会让「编辑 + 保存」场景的起点不干净。
  // English: Rebuild the documents directory wholesale too — a previous run's saved files would make
  //          the "edit then save" scene start from dirty state.
  rmSync(DOCS_DIR, { recursive: true, force: true });
  // 中文：运行目录与文档目录现在互不嵌套（防泄漏），运行目录需显式创建以承接 exe 副本与 data/。
  // English: The run directory and the documents directory no longer nest (anti-leak), so the run
  //          directory must be created explicitly to receive the exe copy and data/.
  mkdirSync(RUN_DIR, { recursive: true });
  mkdirSync(DOCS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(SCENARIO_DOCS)) {
    writeFileSync(join(DOCS_DIR, name), content, "utf8");
  }
  const localExe = join(RUN_DIR, basename(exePath));
  copyFileSync(exePath, localExe);
  return { docPaths: Object.keys(SCENARIO_DOCS).map((name) => join(DOCS_DIR, name)), localExe };
}

/**
 * @lang zh-CN
 * 启动便携 exe 并打开场景文档。调试端口经 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 注入——
 * 这是 WebView2 的标准通道，不修改应用本身、不进入发行物。
 * @lang en
 * Launch the portable exe with the scenario documents. The debug port is injected through
 * `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — WebView2's standard channel; the application itself is
 * untouched and nothing ships.
 */
function launchApp(localExe, docPaths, port) {
  const child = spawn(localExe, docPaths, {
    cwd: RUN_DIR,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: "ignore",
    detached: false,
  });
  child.on("error", (error) => {
    throw new Error(`无法启动 exe / cannot launch exe: ${error.message}`);
  });
  return child;
}

/** @lang zh-CN 结束进程树（便携应用可能派生 WebView2 子进程）。 / @lang en Kill the process tree (the portable app may spawn WebView2 children). */
function killApp(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // 进程可能已自然退出。/ The process may already be gone.
  }
}

/**
 * @lang zh-CN
 * 像素统计：供程序化断言使用（当前模型无法读图，截图正确性必须由数值证明）。
 * 计算整图与指定矩形内的平均亮度、颜色多样性与非背景占比，用来判定「画面不是空白/纯色」。
 * @lang en
 * Pixel statistics for programmatic assertions (the current model cannot view images, so screenshot
 * correctness must be proven numerically). Computes mean luminance, colour diversity and the
 * non-background share for the whole frame and for a given rectangle, to prove the frame is neither
 * blank nor a single flat colour.
 */
function pixelStats(png, region = null) {
  const { width, height, data } = png;
  const x0 = region ? Math.max(0, Math.floor(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y)) : 0;
  const x1 = region ? Math.min(width, Math.ceil(region.x + region.width)) : width;
  const y1 = region ? Math.min(height, Math.ceil(region.y + region.height)) : height;
  /** @lang zh-CN 颜色直方图（粗量化到 5 bit/通道），用于估算色彩多样性。 / @lang en Colour histogram (coarse 5-bit channels) for a diversity estimate. */
  const histogram = new Map();
  let luminanceSum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      // 亮度用 Rec.601 权重——与人眼感知更接近，足以区分「白板」与「有内容」。
      luminanceSum += 0.299 * r + 0.587 * g + 0.114 * b;
      count += 1;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  }
  const topCount = Math.max(...histogram.values());
  return {
    meanLuminance: count ? luminanceSum / count : 0,
    distinctColors: histogram.size,
    // 「非主色占比」= 除最常见颜色外的像素比例——空画面接近 0，有内容时显著大于 0。
    nonDominantShare: count ? 1 - topCount / count : 0,
  };
}

/** @lang zh-CN 取 PNG 宽高。 / @lang en Read the PNG dimensions. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * @lang zh-CN
 * 演示 GIF 的采集与输出尺寸。采集用应用原生窗口尺寸 1200×800（`tauri.conf.json` 的默认窗口），
 * 这样走的是用户真实的布局路径；输出按同比例缩到 1000×667，控制 GIF 体积。
 *
 * 为什么不在 1000 宽直接采集：窄视口会让 HugeRTE 把工具栏项收进溢出菜单，编辑器下拉在重排
 * 期间拿不到稳定 DOM（实测：`--bespoke` 按钮短暂消失），场景会随机失败。用原生宽度采集既避开
 * 这条不稳定路径，也让截图与真实使用一致。
 *
 * @lang en
 * Capture and output sizes for the demo GIFs. Capture uses the application's native window size
 * 1200×800 (the default in `tauri.conf.json`) so the real user layout path is exercised; output is
 * scaled to 1000×667 at the same aspect ratio to keep the GIF small.
 *
 * Why not capture at 1000 wide: a narrow viewport makes HugeRTE fold toolbar items into the overflow
 * menu, and the editor dropdown has no stable DOM while it re-lays out (measured: the `--bespoke`
 * buttons briefly disappear), which made the scenario fail intermittently. Capturing at the native
 * width avoids that unstable path and keeps the frames faithful to real use.
 */
const GIF_CAPTURE = { width: 1200, height: 800 };
const GIF_OUTPUT = { width: 1000, height: 667 };

/**
 * @lang zh-CN
 * 场景步骤表。`name` 同时决定截图文件名与日志；`run(ctx)` 执行交互；`hold` 是 GIF 采样驻留时长；
 * `shot` 标记该步产出终态截图。步骤顺序即 GIF 叙事顺序——**先讲痛点，再讲能力**。
 * @lang en
 * The scenario step list. `name` drives both the screenshot file name and the log; `run(ctx)` performs
 * the interaction; `hold` is how long GIF frames linger; `shot` marks the step that yields a final
 * screenshot. The order is the GIF narrative — **pain first, capability second**.
 */
function buildSteps(lang) {
  /** @lang zh-CN 是否中文集（决定要点击的菜单文案）。 / @lang en Whether this is the Chinese set (drives which menu labels to click). */
  const zh = lang === "zh";
  const menu = {
    view: zh ? "查看" : "View",
    sourceSplit: zh ? "源码并排双栏" : "Source side-by-side",
    tools: zh ? "工具" : "Tools",
  };
  const sidebar = { files: "files", outline: "outline", search: "search" };
  /**
   * @lang zh-CN
   * 跨文档搜索词。场景文档正文是英文（构造的示例内容），因此两套界面语言都用 `network`——
   * 这也更贴近真实用法：界面语言与文档语言本来就互不相干。
   * @lang en
   * The cross-document search term. The scenario documents' bodies are English (constructed sample
   * content), so both UI languages search for `network` — which is also closer to real use: the UI
   * language and the document language are independent.
   */
  const searchTerm = "network";

  return [
    {
      name: "01-main-light",
      hold: 1600,
      shot: "01-main-light.png",
      async run(ctx) {
        // 中文：主界面浅色 + 多标签。先把主题与语言钉死，保证画面确定；侧栏显隐是独立持久化
        //       开关，必须显式展开（否则继承生成机器的历史状态，画面不确定）。
        // English: Main window in the light theme with several tabs. Theme and language are pinned
        //          first so the frame is deterministic; the sidebar's visibility is a separate
        //          persisted toggle and must be pinned explicitly (otherwise it inherits the
        //          generating machine's history and the frame is not deterministic).
        await ctx.applyTheme("light");
        await ctx.ensureExplorerVisible();
        await ctx.setSidebarMode(sidebar.files);
        await ctx.activateTab(0);
        // 中文：面包屑渲染绝对路径段——这是私有路径进公开素材的唯一通道，每轮截图前都验一次。
        // English: The breadcrumb renders absolute path segments — the single channel through which
        //          private paths could enter public assets, so it is verified before every screenshot.
        return await ctx.readBreadcrumbSafety();
      },
    },
    {
      name: "02-dark-toolbar",
      hold: 1500,
      shot: "02-dark-theme.png",
      async run(ctx) {
        // 中文：深色主题——壳与编辑器自身工具栏同步换肤，而文档正文保持自己的样式。
        //       这里不打开任何下拉：只用计算样式断言「编辑器 chrome 真的换了色」，比拍一张飘着的
        //       菜单更可靠——菜单开关状态会受前一步影响，测出来的却是同一个事实。
        // English: Dark theme — the shell and the editor's own toolbar change together while the
        //          document body keeps its own styles. No dropdown is opened here: computed styles
        //          prove the editor chrome really re-skinned, which is more reliable than photographing
        //          a floating menu whose open state depends on the previous step.
        await ctx.applyTheme("nord");
        const chrome = await ctx.readEditorChrome();
        return [
          {
            name: "编辑器工具栏跟随主题（Nord bg2 #343b48）",
            ok: chrome.toolbarBg === "rgb(52, 59, 72)",
            detail: `toolbar=${chrome.toolbarBg} shell=${chrome.shellBg}`,
          },
          {
            name: "文档正文未被主题化",
            ok: chrome.bodyBg === "rgba(0, 0, 0, 0)" || chrome.bodyBg === "rgb(255, 255, 255)",
            detail: `bodyBg=${chrome.bodyBg}`,
          },
        ];
      },
    },
    {
      name: "03-source-split",
      hold: 1500,
      shot: "03-source-split.png",
      async run(ctx) {
        await ctx.closeFloaters();
        await ctx.applyTheme("light");
        // 中文：源码并排双栏 + 同步滚动——讲「手改 HTML 不把文档弄坏」的第一现场。
        // English: Source side by side with sync scrolling — the first scene for "edit HTML by hand
        //          without breaking the document".
        await ctx.clickMenu(menu.view, menu.sourceSplit);
      },
    },
    {
      name: "04-outline",
      hold: 1400,
      shot: "04-outline.png",
      async run(ctx) {
        await ctx.setSourceView("modal");
        await ctx.setSidebarMode(sidebar.outline);
      },
    },
    {
      name: "05-search",
      hold: 1500,
      shot: "05-search.png",
      async run(ctx) {
        // 中文：跨标签搜索——命中按文件分组，带源码行号与高亮片段。
        // English: Cross-tab search — hits grouped per file with source line numbers and highlights.
        await ctx.setSidebarMode(sidebar.search);
        await ctx.typeSearch(searchTerm);
        return await ctx.readSearchSummary();
      },
    },
    {
      name: "06-settings",
      hold: 1500,
      shot: "06-settings.png",
      async run(ctx) {
        await ctx.openSettings();
        // 中文：设置面板的「打开方式」区在已注册时会显示 exe 绝对路径——生成画面必须保持未注册
        //       状态，否则安装路径会泄进公开素材（与面包屑同一条红线）。
        // English: The Settings panel's "Open with" section shows the exe's absolute path once
        //          registered — the generated frames must stay unregistered, otherwise the install
        //          path leaks into public assets (the same red line as the breadcrumb).
        const assoc = await ctx.readAssociationSafety();
        return assoc;
      },
    },
    {
      name: "07-tabs-pinned",
      hold: 1400,
      shot: "07-tabs-pinned.png",
      async run(ctx) {
        // 中文：固定标签 + 显示别名——多文档维护的工作流。
        // English: A pinned tab plus a display alias — the many-documents workflow.
        await ctx.closeSettings();
        await ctx.pinTab(0);
        await ctx.aliasTab(1, zh ? "发布说明" : "Release notes");
      },
    },
    {
      name: "08-edit-save",
      hold: 1800,
      shot: "08-edit-and-save.png",
      async run(ctx) {
        // 中文：编辑 + 保存——保存后 doctype/head/style 仍在（文档保真）。
        // English: Edit then save — the doctype, head and own styles survive the save (fidelity).
        await ctx.activateTab(1);
        await ctx.appendToBody(zh ? "\n<p>审校补充：本节已由文档组复核。</p>" : "\n<p>Editorial note: this section was reviewed by the docs team.</p>");
        await ctx.saveActive();
      },
    },
  ];
}

/**
 * @lang zh-CN
 * 页面内交互封装：全部通过**真实 DOM 点击与真实按键事件**驱动，与人工操作走同一条路径
 * （避免用内部函数直改状态造成「截图与真实行为不一致」）。
 * @lang en
 * In-page interaction wrappers: everything is driven through **real DOM clicks and real key events**,
 * the same path a person takes (never by mutating internal state directly, which would make the
 * screenshots diverge from real behaviour).
 */
function createUiDriver(cdp) {
  const { send, evaluate } = cdp;

  /** @lang zh-CN 求值并断言无异常，返回结果值。 / @lang en Evaluate, assert no exception, return the value. */
  const must = async (expression, label) => {
    const { value, error } = await evaluate(expression);
    if (error) throw new Error(`${label}: ${error}`);
    return value;
  };

  /**
   * @lang zh-CN 按可见文案点击元素（菜单项、切换项）。
   *
   * 比较时**去掉全部空白**再比对：菜单项带 `✓ ` 状态前缀时会被拆成多个文本节点，`textContent` 里
   * 会夹进额外空白，整串精确匹配会漏。先比原样，再比去掉 ✓ 后的形态。
   *
   * @lang en Click an element by its visible label (menu items, toggles).
   *
   * The comparison **strips all whitespace** first: with a `✓ ` state prefix the item is split into
   * several text nodes and `textContent` gains extra spaces, which defeats an exact whole-string
   * match. The original form is compared first, then the ✓-stripped form.
   */
  const clickByLabel = async (selector, label) => {
    const clicked = await must(
      `(() => {
        const items = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const wanted = ${JSON.stringify(label)};
        const squash = (text) => (text || "").replace(/\\s+/g, "");
        const target = items.find((el) => squash(el.textContent) === squash(wanted))
          || items.find((el) => squash((el.textContent || "").replace(/^✓/, "")) === squash(wanted));
        if (!target) return "MISSING";
        target.click();
        return "OK";
      })()`,
      `clickByLabel(${selector}, ${label})`
    );
    if (clicked !== "OK") throw new Error(`找不到要点击的元素 / element not found: ${selector} "${label}"`);
  };

  /** @lang zh-CN 打开顶部菜单栏的某个菜单。 / @lang en Open one of the top menu-bar menus. */
  const openMenu = async (label) => {
    await clickByLabel(".menubar__item", label);
    await sleep(320);
  };

  /**
   * @lang zh-CN
   * 打开菜单并点击其中一项。
   *
   * **必须在一次页面求值里完成「开菜单 + 点项」**：应用菜单用捕获级的 `mousedown` 外点关闭，
   * 而 DOM `click()` 不产生 mousedown。分两次求值看似能工作，但菜单在两次调用之间处于「已打开」
   * 状态，任何落在菜单外的事件都会把它摘掉，导致第二次求值找不到菜单项（本次连续失败的根因）。
   *
   * @lang en
   * Open a menu and click one of its items.
   *
   * **"Open + click" must happen inside a single page evaluation**: app menus close on a capture-phase
   * `mousedown` outside them, and a DOM `click()` emits no mousedown. Splitting it across two
   * evaluations looks workable but leaves the menu open between calls, so any outside event removes
   * it and the second evaluation finds no item (the root cause of this run's repeated failures).
   */
  const clickMenu = async (menuLabel, itemLabel) => {
    const result = await must(
      `(() => {
        const squash = (text) => (text || "").replace(/\\s+/g, "");
        const items = [...document.querySelectorAll(".menubar__item")];
        const menu = items.find((el) => squash(el.textContent) === squash(${JSON.stringify(menuLabel)}));
        if (!menu) return { kind: "NO_MENU" };
        menu.click();
        const wanted = squash(${JSON.stringify(itemLabel)});
        const entries = [...document.querySelectorAll(".app-menu__item")];
        const entry = entries.find((el) => squash(el.textContent) === wanted)
          || entries.find((el) => squash((el.textContent || "").replace(/^✓/, "")) === wanted);
        if (!entry) return { kind: "NO_ITEM", seen: entries.map((el) => squash(el.textContent)) };
        entry.click();
        return { kind: "OK" };
      })()`,
      `clickMenu(${menuLabel}, ${itemLabel})`
    );
    if (result.kind !== "OK") {
      throw new Error(
        result.kind === "NO_MENU"
          ? `菜单不存在 / menu not found: ${menuLabel}`
          : `菜单项不存在 / menu item not found: ${menuLabel} › ${itemLabel}（可见项 / visible: ${(result.seen ?? []).join(" | ")}）`
      );
    }
    await sleep(480);
  };

  return {
    must,
    /** @lang zh-CN 打开顶部菜单并点击其中一项（对场景脚本暴露）。 / @lang en Open a top menu and click one of its items (exposed to scenario steps). */
    clickMenu,
    /** @lang zh-CN 按可见文案点击元素（对场景脚本暴露）。 / @lang en Click an element by visible label (exposed to scenario steps). */
    clickByLabel,
    /**
     * @lang zh-CN 设置主题：直接操作真实的设置面板下拉（而非改 localStorage 后重载），保证截到的就是用户路径。
     * @lang en Set the theme by driving the real Settings dropdown (not localStorage + reload), so the
     * screenshots show the actual user path.
     */
    async applyTheme(themeId) {
      await this.openSettings();
      const ok = await must(
        `(() => { const el = document.getElementById("ui-theme"); if (!el) return "MISSING"; el.value = ${JSON.stringify(themeId)}; el.dispatchEvent(new Event("change", { bubbles: true })); return "OK"; })()`,
        "applyTheme"
      );
      if (ok !== "OK") throw new Error("设置面板里找不到主题下拉 / theme select missing");
      await sleep(700);
      await this.closeSettings();
    },

    /** @lang zh-CN 切换侧栏三态。 / @lang en Switch the sidebar's three views. */
    async setSidebarMode(mode) {
      const ok = await must(
        `(() => { const b = document.querySelector('.explorer__mode[data-mode="${mode}"]'); if (!b) return "MISSING"; if (b.getAttribute("aria-selected") === "true") return "OK"; b.click(); return "OK"; })()`,
        `setSidebarMode(${mode})`
      );
      if (ok !== "OK") throw new Error(`侧栏模式不存在 / sidebar mode missing: ${mode}`);
      await sleep(620);
    },

    /**
     * @lang zh-CN
     * 确保侧栏可见。侧栏显隐是独立于三态的持久化开关（`hia-hugerte.explorer-hidden`），继承自
     * 生成机器的历史状态；不在这里钉死，画面里侧栏可能出现也可能不出现。仅当隐藏时才点工具栏
     * 「目录树」按钮（可见时不点击，避免把它关掉）。
     * @lang en
     * Make sure the sidebar is visible. Its visibility is a separate persisted toggle
     * (`hia-hugerte.explorer-hidden`) inherited from the generating machine's history; without pinning
     * it here, the sidebar may or may not appear in the frames. The toolbar "File tree" button is
     * clicked **only when hidden** (never when visible, which would close it).
     */
    async ensureExplorerVisible() {
      const state = await must(
        `(() => ({
          hidden: document.querySelector("#explorer")?.hidden ?? null,
          toolbarButtons: document.querySelectorAll(".app-toolbar__btn").length,
        }))()`,
        "ensureExplorerVisible.state"
      );
      if (state.hidden === false) return;
      if (state.hidden === null || state.toolbarButtons < 6) {
        throw new Error(`无法确认侧栏开关 / cannot locate the sidebar toggle: ${JSON.stringify(state)}`);
      }
      const clicked = await must(
        `(() => {
          const squash = (text) => (text || "").replace(/\\s+/g, "");
          const buttons = [...document.querySelectorAll(".app-toolbar__btn")];
          const target = buttons.find((b) => ["目录树", "Filetree"].includes(squash(b.textContent)));
          if (!target) return "MISSING";
          target.click();
          return "OK";
        })()`,
        "ensureExplorerVisible.click"
      );
      if (clicked !== "OK") throw new Error("找不到侧栏开关按钮 / sidebar toggle button missing");
      await sleep(900);
      const after = await must(`document.querySelector("#explorer")?.hidden`, "ensureExplorerVisible.after");
      if (after !== false) throw new Error("侧栏未展开 / sidebar still hidden after toggle");
    },

    /**
     * @lang zh-CN
     * 读取面包屑文本并做**防泄漏断言**：面包屑渲染文档的绝对路径段，画面里绝不允许出现仓库、
     * 用户目录等私有路径片段（红线，见 DOCS_DIR 说明）；同时要求必备片段在场，证明文档确实在
     * 公开演示目录下。
     * @lang en
     * Read the breadcrumb text and run the **anti-leak assertion**: the breadcrumb renders the
     * document's absolute path segments, so private fragments (repo, user profile) must never appear
     * in a frame (the red line documented on `DOCS_DIR`); required fragments must be present, proving
     * the documents really sit in the public demo directory.
     */
    async readBreadcrumbSafety() {
      const breadcrumb = await must(
        `document.querySelector("#explorer-breadcrumb")?.textContent ?? ""`,
        "readBreadcrumbSafety.text"
      );
      const forbidden = BREADCRUMB_FORBIDDEN.filter((fragment) => breadcrumb.includes(fragment));
      const missing = BREADCRUMB_REQUIRED.filter((fragment) => !breadcrumb.includes(fragment));
      return [
        {
          name: "面包屑无私有路径泄漏",
          ok: forbidden.length === 0,
          detail: forbidden.length ? `出现 / found: ${forbidden.join(", ")}` : `breadcrumb=${breadcrumb.slice(0, 80)}`,
        },
        {
          name: "面包屑指向公开演示目录",
          ok: missing.length === 0,
          detail: missing.length ? `缺失 / missing: ${missing.join(", ")}` : breadcrumb.slice(0, 80),
        },
      ];
    },

    /** @lang zh-CN 在跨文档搜索框里真实键入（逐字按键，触发与人工一致的 input 事件链）。 / @lang en Type into the cross-document search box with real per-character key events (the same input chain a person triggers). */
    async typeSearch(text) {
      const focused = await must(
        `(() => { const el = document.getElementById("explorer-search-input"); if (!el) return "MISSING"; el.focus(); el.select(); return "OK"; })()`,
        "typeSearch.focus"
      );
      if (focused !== "OK") throw new Error("找不到跨文档搜索输入框 / search input missing");
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
      for (const char of text) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", text: char, key: char, unmodifiedText: char });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: char });
        await sleep(60);
      }
      await sleep(800);
    },

    /** @lang zh-CN 选中第 n 个标签页。 / @lang en Activate the nth tab. */
    async activateTab(index) {
      const ok = await must(
        `(() => { const tabs = [...document.querySelectorAll("#tabbar .tab")]; const t = tabs[${index}]; if (!t) return "MISSING"; t.click(); return "OK"; })()`,
        `activateTab(${index})`
      );
      if (ok !== "OK") throw new Error(`标签页不存在 / tab missing: ${index}`);
      await sleep(900);
    },

    /** @lang zh-CN 固定第 n 个标签页（点 chip 上的 📌 入口）。 / @lang en Pin the nth tab (click the 📌 entry on the chip). */
    async pinTab(index) {
      const ok = await must(
        `(() => { const t = document.querySelectorAll("#tabbar .tab")[${index}]; if (!t) return "MISSING"; const p = t.querySelector(".tab__pin--hover") || t.querySelector(".tab__pin"); if (!p) return "NO_PIN"; if (t.classList.contains("tab--pinned")) return "OK"; p.click(); return "OK"; })()`,
        `pinTab(${index})`
      );
      if (ok === "MISSING" || ok === "NO_PIN") throw new Error(`无法固定标签页 / cannot pin tab: ${index} (${ok})`);
      await sleep(700);
    },

    /** @lang zh-CN 给第 n 个标签页设置显示别名（双击名称 → 输入 → Enter）。 / @lang en Give the nth tab a display alias (double-click the name, type, Enter). */
    async aliasTab(index, alias) {
      await must(
        `(() => { const t = document.querySelectorAll("#tabbar .tab")[${index}]; if (!t) return "MISSING"; const n = t.querySelector(".tab__name"); if (!n) return "MISSING"; n.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return "OK"; })()`,
        `aliasTab.open(${index})`
      );
      await sleep(420);
      const typed = await must(
        `(() => { const input = document.querySelector(".tab__edit"); if (!input) return "MISSING"; input.value = ${JSON.stringify(alias)}; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return "OK"; })()`,
        "aliasTab.commit"
      );
      if (typed !== "OK") throw new Error("别名输入框未出现 / alias input did not appear");
      await sleep(700);
    },

    /**
     * @lang zh-CN
     * 展开 HugeRTE 自身工具栏的下拉（本项目关闭了编辑器菜单栏，因此改用工具栏的「段落/Paragraph」
     * 下拉）。用途是让截图拍到编辑器 chrome（工具栏、下拉面板）确实跟随主题。
     * @lang en
     * Expand a dropdown of HugeRTE's own toolbar (this project disables the editor menu bar, so the
     * toolbar's Paragraph dropdown is used instead). Its purpose is to make the screenshot show the
     * editor chrome — toolbar and dropdown panel — actually following the theme.
     */
    async openEditorMenu(kind) {
      // 中文：块格式下拉的**可见文案会随光标所在块变化**（正文显示「段落」、标题里显示「一级标题」），
      //       因此不能按文案匹配。`aria-label` 恒定以 "Block " 开头（中英文界面都一样），是稳定锚点。
      // English: The block-format dropdown's **visible label follows the block at the caret** ("段落"
      //          in a paragraph, "一级标题" inside a heading), so text matching is wrong. Its
      //          `aria-label` always starts with "Block " (same in both UI languages) — the stable
      //          anchor.
      void kind;
      const pattern = "/^Block\\\\b/";
      // 中文：两次尝试——第一次按文案匹配；失败时打印当时工具栏的真实内容，便于定位窄视口下的差异。
      // English: Two attempts — label match first; on failure, print what the toolbar actually contains
      //          so a narrow-viewport difference is diagnosable instead of a bare "missing".
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const state = await must(
          `(() => {
            const matches = (b) => ${pattern}.test((b.getAttribute("aria-label") || "").trim());
            const btn = [...document.querySelectorAll(".tox-tbtn--bespoke")].find(matches);
            if (btn) { btn.click(); return "CLICKED"; }
            // 中文：折叠态下块格式按钮被收进溢出区——先展开「显示更多工具栏项」，其 aria-expanded 会变 true。
            // English: When collapsed, the block-format buttons fold into the overflow region — expand
            //          "show more toolbar items" first; its aria-expanded flips to true.
            const overflow = [...document.querySelectorAll(".tox-tbtn")]
              .find((b) => (b.getAttribute("aria-label") || "").includes("additional toolbar"));
            if (overflow && overflow.getAttribute("aria-expanded") !== "true") { overflow.click(); return "OVERFLOW"; }
            return "MISSING";
          })()`,
          "openEditorMenu"
        );
        if (state === "OVERFLOW") { await sleep(900); continue; }
        if (state === "CLICKED") {
          await sleep(900);
          const items = await must(`document.querySelectorAll(".tox-collection__item").length`, "openEditorMenu.items");
          if (items > 0) return;
        }
        await sleep(400);
      }
      const dump = await must(
        `JSON.stringify({
          bespoke: [...document.querySelectorAll(".tox-tbtn--bespoke")].map((b) => (b.textContent || "").trim()),
          buttons: [...document.querySelectorAll(".tox-tbtn")].map((b) => ({
            text: (b.textContent || "").trim().slice(0, 12),
            aria: (b.getAttribute("aria-label") || "").slice(0, 24),
            cls: b.className
          })),
          editors: document.querySelectorAll(".tox-edit-area__iframe").length,
          width: innerWidth, height: innerHeight,
          panels: document.querySelectorAll(".tox-collection__item").length
        })`,
        "openEditorMenu.dump"
      );
      throw new Error(`编辑器工具栏下拉不可用 / editor toolbar dropdown unusable: ${dump}`);
    },

    /** @lang zh-CN 读取编辑器 chrome 与文档正文的实际取色（用于「主题是否真的作用到编辑器」的数值断言）。 / @lang en Read the actual colours of the editor chrome and the document body (numeric evidence for "the theme really reached the editor"). */
    async readEditorChrome() {
      return await must(
        `(() => {
          const pick = (el) => (el ? getComputedStyle(el).backgroundColor : "MISSING");
          const iframe = document.querySelector(".tox-edit-area__iframe");
          return {
            toolbarBg: pick(document.querySelector(".tox-toolbar__primary")),
            shellBg: pick(document.querySelector(".application-shell")),
            headerBg: pick(document.querySelector(".app-header")),
            bodyBg: iframe && iframe.contentDocument ? pick(iframe.contentDocument.body) : "NO_IFRAME",
            theme: document.documentElement.getAttribute("data-theme") || "none",
          };
        })()`,
        "readEditorChrome"
      );
    },

    /** @lang zh-CN 读取跨文档搜索结果的摘要，形成截图前的断言（命中为 0 的画面没有宣传价值）。 / @lang en Read the cross-document search summary into assertions taken before the screenshot (a frame with zero hits has no promotional value). */
    async readSearchSummary() {
      const summary = await must(
        `(() => ({
          groups: [...document.querySelectorAll(".explorer__search-group-name")].map((el) => el.textContent.trim()),
          hits: document.querySelectorAll(".explorer__search-hit").length,
          empty: !!document.querySelector(".explorer__search-empty"),
        }))()`,
        "readSearchSummary"
      );
      return [
        {
          name: `搜索「network」有命中（分组 ${summary.groups.length} 个 / 命中 ${summary.hits} 处）`,
          ok: summary.hits > 0 && summary.groups.length > 0,
          detail: `groups=${summary.groups.join(",")} hits=${summary.hits} empty=${summary.empty}`,
        },
      ];
    },

    /** @lang zh-CN 关闭任何浮层（菜单/设置面板/编辑器下拉）。 / @lang en Close any floating surface (menus, Settings panel, editor dropdown). */
    async closeFloaters() {
      // 中文：连按两次 Esc 再点页面空白——应用菜单用捕获级 Esc，HugeRTE 的下拉用自身 Esc 处理，
      //       两者不是同一层，一次按键未必都关掉。
      // English: Press Esc twice and then click blank page space — app menus handle Esc at capture
      //          level while HugeRTE's dropdowns handle it in their own layer, so one press may not
      //          close both.
      for (let i = 0; i < 2; i += 1) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await sleep(220);
      }
      await this.closeSettings();
      // 中文：点顶栏品牌区（无交互、无副作用）以关闭编辑器下拉与任何残留浮层。
      // English: Click the header brand area (inert, side-effect free) to dismiss the editor dropdown
      //          and any residual floater.
      const box = await must(
        `(() => { const el = document.querySelector(".app-brand"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
        "closeFloaters.brand"
      );
      if (box) {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
      await sleep(420);
    },

    /** @lang zh-CN 打开设置面板（点击真实齿轮按钮）。 / @lang en Open the Settings panel (click the real gear button). */
    async openSettings() {
      const opened = await must(
        `(() => { if (document.querySelector(".settings-panel")) return "OK"; const b = document.getElementById("settings-button"); if (!b) return "MISSING"; b.click(); return "OK"; })()`,
        "openSettings"
      );
      if (opened !== "OK") throw new Error("找不到设置按钮 / settings button missing");
      await sleep(900);
    },

    /**
     * @lang zh-CN
     * 读取设置面板「打开方式」区的注册状态并做防泄漏断言：已注册会显示 exe 绝对路径，生成画面
     * 必须是未注册 + 路径为空。
     * @lang en
     * Read the Settings panel's "Open with" registration state and assert it cannot leak: the frames
     * must show unregistered with an empty path (registered state displays the exe's absolute path).
     */
    async readAssociationSafety() {
      const assoc = await must(
        `(() => {
          const panel = document.querySelector(".settings-panel");
          if (!panel) return null;
          return {
            state: panel.querySelector(".settings-panel__state")?.textContent ?? "",
            path: panel.querySelector(".settings-panel__path")?.textContent ?? "",
            pathHidden: panel.querySelector(".settings-panel__path")?.hidden ?? true,
          };
        })()`,
        "readAssociationSafety"
      );
      if (!assoc) throw new Error("设置面板未打开 / settings panel not open");
      const registered = /已注册|Registered/.test(assoc.state);
      return [
        {
          name: "设置面板不泄漏安装路径",
          ok: !registered && assoc.pathHidden && assoc.path.trim() === "",
          detail: `state=${assoc.state.trim()} path="${assoc.path.trim()}" hidden=${assoc.pathHidden}`,
        },
      ];
    },

    /** @lang zh-CN 关闭设置面板。 / @lang en Close the Settings panel. */
    async closeSettings() {
      const closed = await must(
        `(() => { if (!document.querySelector(".settings-panel")) return "OK"; const b = document.getElementById("settings-button"); if (!b) return "NO_BUTTON"; b.click(); return "OK"; })()`,
        "closeSettings"
      );
      if (closed !== "OK") throw new Error("无法关闭设置面板 / cannot close Settings panel");
      await sleep(560);
    },

    /**
     * @lang zh-CN
     * 设置源码视图形态（与 `src/main.ts` 的 `SourceViewMode` 一致）。只走菜单入口——与用户路径一致。
     * 菜单项是**切换语义**：点击当前形态会退回模态，因此当前形态不等于目标时直接点目标形态即可。
     * @lang en
     * Set the source view form (matching `SourceViewMode` in `src/main.ts`). Only the menu entry is
     * used — the user path. Menu items **toggle**: clicking the active form returns to the modal, so
     * whenever the current form differs from the target, clicking the target's entry suffices.
     */
    async setSourceView(mode) {
      const current = await must(`document.getElementById("workbench")?.dataset.sourceView || "modal"`, "setSourceView.current");
      if (current === mode) return;
      // 中文：菜单名与项名**都按当前界面语言只取一个**。若同时试中英两套，第一次失败会把菜单留在
      //       打开状态，第二次点菜单按钮反而把它关掉——本次连续失败的根因。
      // English: Take exactly one menu label and one item label, both from the current UI language.
      //          Trying both language sets leaves the menu open after the first miss, and the second
      //          click toggles it shut — the root cause of this run's repeated failures.
      const zhUi = (await must(`document.querySelector(".menubar__item")?.textContent.trim() || ""`, "setSourceView.menubar")) === "文件";
      const viewMenu = zhUi ? "查看" : "View";
      const labelFor = (form) =>
        form === "split"
          ? (zhUi ? "源码并排双栏" : "Source side-by-side")
          : (zhUi ? "源码整区切换" : "Source full-area");
      const targetForm = mode === "modal" ? current : mode;
      try {
        await clickMenu(viewMenu, labelFor(targetForm));
      } catch (error) {
        throw new Error(
          `无法${mode === "modal" ? "退回模态视图" : `切换到源码视图 ${mode}`} / cannot switch source view (current=${current}): ${error.message}`
        );
      }
      await sleep(700);
    },

    /** @lang zh-CN 在正文末尾追加一段内容（真实按键逐字输入，触发编辑器 Change 事件）。 / @lang en Append a paragraph at the body end with real per-character key events (triggers the editor's Change event). */
    async appendToBody(text) {
      await must(
        `(() => {
          const frame = document.querySelector(".tox-edit-area__iframe");
          const doc = frame && frame.contentDocument;
          if (!doc || !doc.body) return "MISSING";
          const range = doc.createRange();
          range.selectNodeContents(doc.body);
          range.collapse(false);
          const selection = doc.defaultView.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          doc.body.focus();
          return "OK";
        })()`,
        "appendToBody.caret"
      );
      // 中文：逐字发送——`Input.insertText` 走 IME 路径，**不触发** HugeRTE 的 wordCountUpdate，
      //       会让状态栏字数停在旧值（实测教训，见 T-hrt-PROMOTION 台账）。
      // English: Send per character — `Input.insertText` takes the IME path and does **not** trigger
      //          HugeRTE's wordCountUpdate, leaving the status-bar counts stale (a measured lesson,
      //          recorded in the T-hrt-PROMOTION ledger).
      for (const char of text) {
        if (char === "\n") {
          await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        } else {
          await send("Input.dispatchKeyEvent", { type: "keyDown", text: char, key: char, unmodifiedText: char });
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: char });
        }
        await sleep(28);
      }
      await sleep(700);
    },

    /** @lang zh-CN 保存当前文档（点工具栏「保存」按钮，走真实保存命令）。 / @lang en Save the active document (click the toolbar Save button, the real save command). */
    async saveActive() {
      const ok = await must(
        `(() => {
          const btn = [...document.querySelectorAll(".app-toolbar__btn")].find((b) => /^(保存|Save)$/.test(b.textContent.trim()));
          if (!btn) return "MISSING";
          btn.click();
          return "OK";
        })()`,
        "saveActive"
      );
      if (ok !== "OK") throw new Error("找不到保存按钮 / save button missing");
      await sleep(1600);
    },
  };
}

/**
 * @lang zh-CN
 * 一次语言集 pass：重设视口 → 逐步执行场景 → 采样 GIF 帧 → 在标记步产出终态截图。
 * `viewport` 与 `deviceScaleFactor` 分开传入，截图 pass 用 2x 保证高清、GIF pass 用 1x 省体积。
 * @lang en
 * One language-set pass: set the viewport, run the scenario step by step, sample GIF frames, and
 * write final screenshots at the marked steps. `viewport` and `deviceScaleFactor` are separate so
 * the screenshot pass can use 2x for crispness while the GIF pass stays at 1x for size.
 */
async function runPass(cdp, { lang, steps, viewport, deviceScaleFactor, shotDir, collectFrames, assertions }) {
  const ui = createUiDriver(cdp);
  const { send } = cdp;

  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor,
    mobile: false,
  });
  await sleep(600);
  // 中文：每轮开始先清掉上一轮遗留的浮层——编辑器下拉、设置面板、应用菜单都会遮住或拦截后续点击。
  //       视口尺寸变化会让 HugeRTE 重新布局工具栏，这里再等一拍，避免在重建中途操作。
  // English: Clear leftovers before each pass — an editor dropdown, the Settings panel or an app menu
  //          left open would cover or intercept the next interactions. A viewport change also makes
  //          HugeRTE re-layout its toolbar, so give it one more beat before interacting.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  await ui.closeFloaters();
  await sleep(500);

  const frames = [];
  for (const step of steps) {
    // 中文：步骤可以返回内联断言（`[{name, ok, detail}]`），统一并入断言结果。
    // English: A step may return inline assertions (`[{name, ok, detail}]`), folded into the results.
    const inlineChecks = await step.run(ui);
    if (Array.isArray(inlineChecks)) {
      for (const item of inlineChecks) assertions.check(`${lang} ${item.name}`, item.ok, item.detail ?? "");
    }
    if (collectFrames) {
      // 中文：在驻留期内按 ~5fps 采样，让过渡动画播完再截下一帧。
      // English: Sample at ~5 fps during the hold so transitions finish before the next frame.
      const sampleCount = Math.max(1, Math.round(step.hold / 200));
      for (let i = 0; i < sampleCount; i += 1) {
        await sleep(step.hold / sampleCount);
        const shot = await send("Page.captureScreenshot", { format: "png" });
        frames.push(Buffer.from(shot.data, "base64"));
      }
    } else if (step.shot) {
      // 中文：截图前把焦点移出文本区域，让插入光标不出现——光标以约 1 Hz 闪烁，否则两次运行可能
      //       截到不同相位。焦点交给 inert 的品牌区，不改变任何界面状态。
      // English: Move focus out of the text surfaces before capturing so the insertion caret is absent —
      //          it blinks at about 1 Hz, so two runs could otherwise catch different phases. Focus goes
      //          to the inert brand area, which changes no UI state.
      await cdp.evaluate(
        `(() => {
          const brand = document.querySelector(".app-brand");
          if (brand) { brand.setAttribute("tabindex", "-1"); brand.focus(); }
          return "OK";
        })()`
      );
      await sleep(420);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const buffer = Buffer.from(shot.data, "base64");
      mkdirSync(shotDir, { recursive: true });
      writeFileSync(join(shotDir, step.shot), buffer);
      const size = pngSize(buffer);
      console.log(`  [shot][${lang}] ${step.shot}  ${size.width}×${size.height}  ${(buffer.length / 1024).toFixed(0)} KB`);
      assertions.check(
        `${lang} 截图尺寸 ${step.shot}`,
        size.width === viewport.width * deviceScaleFactor && size.height === viewport.height * deviceScaleFactor,
        `${size.width}×${size.height}（期望 ${viewport.width * deviceScaleFactor}×${viewport.height * deviceScaleFactor}）`
      );
      // 中文：非空白断言——整图色彩多样性与非主色占比都必须显著大于 0。
      // English: Non-blank assertion — both colour diversity and the non-dominant share must be well
      //          above zero.
      const png = PNG.sync.read(buffer);
      const stats = pixelStats(png);
      assertions.check(
        `${lang} 截图非空白 ${step.shot}`,
        stats.distinctColors > 24 && stats.nonDominantShare > 0.05,
        `colors=${stats.distinctColors} nonDominant=${stats.nonDominantShare.toFixed(3)} luminance=${stats.meanLuminance.toFixed(0)}`
      );
    }
  }
  return frames;
}

/**
 * @lang zh-CN
 * 把 PNG 帧序列编码成 GIF：每帧最近邻降采样到目标尺寸后独立量化（主题色随场景变化，
 * 全局共用调色板会串色），延迟 200ms ≈ 5fps。
 * @lang en
 * Encode a PNG frame sequence into a GIF: nearest-neighbour downscale to the target size, then a
 * per-frame palette (the theme changes across the scene, so a shared global palette would bleed),
 * with a 200 ms delay ≈ 5 fps.
 */
function encodeGif(frames, { width, height }) {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const png = PNG.sync.read(frame);
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(png.height - 1, Math.round((y * png.height) / height));
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(png.width - 1, Math.round((x * png.width) / width));
        const sourceOffset = (sourceY * png.width + sourceX) * 4;
        const targetOffset = (y * width + x) * 4;
        rgba[targetOffset] = png.data[sourceOffset];
        rgba[targetOffset + 1] = png.data[sourceOffset + 1];
        rgba[targetOffset + 2] = png.data[sourceOffset + 2];
        rgba[targetOffset + 3] = 255;
      }
    }
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, width, height, { palette, delay: 200 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

/**
 * @lang zh-CN 主流程：解析参数 → 准备场景 → 启动 exe → 按语言集依次跑截图 pass 与 GIF pass → 断言汇总。
 * @lang en Main flow: parse args → prepare the scenario → launch the exe → run the screenshot pass and
 * then the GIF pass per language set → summarise assertions.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const exePath = resolveExecutable(args.exe);
  const { docPaths, localExe } = prepareScenario(exePath);
  const langs = args.lang === "both" ? ["zh", "en"] : [args.lang];
  const assertions = createAssertions();

  console.log(`[run] source exe: ${exePath}`);
  console.log(`[run] run dir: ${RUN_DIR}`);
  console.log(`[run] scenario docs: ${docPaths.length} 份 / ${docPaths.length} files`);
  console.log(`[run] languages: ${langs.join(", ")}`);

  const child = launchApp(localExe, docPaths, args.port);
  let cdp = null;
  try {
    cdp = await connectCdp(args.port);
    const ui = createUiDriver(cdp);

    // 中文：等编辑器实例就绪再开始——HugeRTE 初始化是异步的，过早操作会点不到菜单。
    // English: Wait for the editor instance before starting — HugeRTE initialises asynchronously and
    //          early interactions miss the menus.
    const readyDeadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      const { value } = await cdp.evaluate(`!!document.querySelector(".tox-edit-area__iframe") && document.querySelectorAll("#tabbar .tab").length >= 2`);
      if (value === true) { ready = true; break; }
      await sleep(400);
    }
    assertions.check("应用就绪（编辑器 + 多标签）", ready, ready ? "" : "30s 内未就绪 / not ready within 30s");
    if (!ready) throw new Error("应用未就绪，终止生成 / application not ready, aborting");

    // 中文：启动即把语言与主题钉到目标值，避免上一次运行残留的偏好影响画面。
    // English: Pin language and theme at startup so preferences left by a previous run cannot shift
    //          the frames.
    for (const lang of langs) {
      const language = lang === "zh" ? "zh-Hans" : "en";
      await ui.openSettings();
      const switched = await cdp.evaluate(
        `(() => { const el = document.getElementById("ui-language"); if (!el) return "MISSING"; if (el.value === ${JSON.stringify(language)}) return "ALREADY"; el.value = ${JSON.stringify(language)}; el.dispatchEvent(new Event("change", { bubbles: true })); return "OK"; })()`
      );
      if (switched.error) throw new Error(`语言切换失败 / language switch failed: ${switched.error}`);
      if (switched.value === "OK") {
        // 中文：语言切换会销毁并重建编辑器实例，等待重建完成。
        // English: The language switch destroys and rebuilds the editor; wait for the rebuild.
        const rebuildDeadline = Date.now() + 20000;
        while (Date.now() < rebuildDeadline) {
          const check = await cdp.evaluate(`!!document.querySelector(".tox-edit-area__iframe")`);
          if (check.value === true) break;
          await sleep(400);
        }
        await sleep(1600);
      }
      await ui.closeSettings();
      // 中文：断言语言真的生效（防「点了但没切」的静默失败）。
      // English: Assert the language actually took effect (guards against a silent no-op click).
      const actual = await cdp.evaluate(
        `[...document.querySelectorAll(".menubar__item")].map((m) => m.textContent.trim())[0]`
      );
      const expectedFirst = lang === "zh" ? "文件" : "File";
      assertions.check(`${lang} 界面语言生效`, actual.value === expectedFirst, `menubar[0]=${actual.value}`);

      const steps = buildSteps(lang);

      // Pass A：终态截图（1440×900 @2x）。先重置一次视图状态（侧栏 files、源码 modal）。
      // <lang en>Pass A: final screenshots at 1440×900 @2x, after resetting view state.</lang>
      await ui.setSourceView("modal");
      await ui.setSidebarMode("files");
      const shotDir = lang === "zh" ? join(OUT_DIR, "screenshots") : join(OUT_DIR, "screenshots", "en");
      const shotFrames = await runPass(
        cdp,
        { lang, steps, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, shotDir, collectFrames: false, assertions }
      );
      void shotFrames;

      // Pass B：GIF 帧（原生 1200×800 @1x，编码时缩到 1000×667）。场景与 Pass A 完全相同。
      // <lang en>Pass B: GIF frames at the native 1200×800 @1x, scaled to 1000×667 on encode —
      //   identical scenario, no final screenshots.</lang>
      await ui.setSourceView("modal");
      await ui.setSidebarMode("files");
      const frames = await runPass(
        cdp,
        {
          lang,
          steps,
          viewport: { width: GIF_CAPTURE.width, height: GIF_CAPTURE.height },
          deviceScaleFactor: 1,
          shotDir,
          collectFrames: true,
          assertions,
        }
      );
      const gifBuffer = encodeGif(frames, GIF_OUTPUT);
      const gifName = lang === "zh" ? "demo.gif" : "demo-en.gif";
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, gifName), gifBuffer);
      const seconds = (frames.length * 0.2).toFixed(1);
      console.log(`  [gif][${lang}] ${gifName}  ${frames.length} 帧/frames  ${seconds}s  ${(gifBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      assertions.check(`${lang} GIF 帧数合理`, frames.length >= 40, `${frames.length} 帧`);
      assertions.check(`${lang} GIF 体积可控`, gifBuffer.length < 8 * 1024 * 1024, `${(gifBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    }

    // 中文：最后校验保存保真——合同冻结 §1 要求保存后 doctype/head/style 仍在。
    // English: Finally verify save fidelity — contract-freeze §1 requires the doctype, head and own
    //          styles to survive a save.
    const savedPath = join(DOCS_DIR, "release-notes.html");
    const saved = existsSync(savedPath) ? readFileSync(savedPath, "utf8") : "";
    assertions.check("保存后 doctype 保留", /^<!doctype html>/i.test(saved), saved.slice(0, 40).replace(/\n/g, " "));
    assertions.check("保存后 head 保留", /<head>/i.test(saved) && /<meta charset="utf-8"\s*\/?>/i.test(saved), "");
    assertions.check("保存后 title 保留", /<title>Release notes/i.test(saved), "");
    // 中文：两套语言集写入的补充段落不同，因此两个标记都要认。
    // English: The two language sets append different paragraphs, so both markers count.
    assertions.check(
      "保存后编辑内容落盘",
      saved.includes("审校补充") || saved.includes("Editorial note"),
      ""
    );

    // 中文：`--verify-against <目录>` 复跑比对——把本轮产物与给定目录里的同名文件做结构等价判定，
    //       这是「同一版本重跑结果一致」的可复现证据（判据见 `compareScreenshots`）。
    // English: `--verify-against <dir>` compares this run's outputs with the same-named files in the
    //          given directory, producing reproducible evidence that "the same version re-runs to the
    //          same result" (criterion documented on `compareScreenshots`).
    if (args.verifyAgainst) {
      const referenceDir = resolve(args.verifyAgainst);
      const relPaths = [];
      for (const lang of langs) {
        const sub = lang === "zh" ? "" : "en";
        for (const step of buildSteps(lang)) {
          if (step.shot) relPaths.push(join("screenshots", sub, step.shot));
        }
      }
      for (const relPath of relPaths) {
        const currentPath = join(OUT_DIR, relPath);
        const referencePath = join(referenceDir, relPath);
        if (!existsSync(referencePath)) {
          assertions.check(`复跑一致 ${relPath}`, false, `基准文件缺失 / reference missing: ${referencePath}`);
          continue;
        }
        const verdict = compareScreenshots(readFileSync(currentPath), readFileSync(referencePath));
        assertions.check(`复跑一致 ${relPath}`, verdict.equivalent, verdict.reason);
      }
    }
  } finally {
    if (!args.keepOpen) {
      killApp(child);
      // 中文：收尾清理 Public 下的演示目录——生成是临时动作，不在用户机器上留目录；
      //       `--keep-open` 时保留（人工比对需要文档仍在）。
      // English: Clean up the demo directory under Public afterwards — generation is transient and
      //          should not leave folders behind; kept when `--keep-open` is set (manual comparison
      //          needs the documents in place).
      rmSync(DEMO_ROOT, { recursive: true, force: true });
    }
    cdp?.socket?.close();
  }

  const failed = assertions.results.filter((result) => !result.ok);
  console.log(`\n=== 生成结果 / result: ${assertions.results.length - failed.length}/${assertions.results.length} 通过 / passed ===`);
  if (failed.length > 0) {
    console.log("失败项 / failed:");
    for (const item of failed) console.log(`  - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log(`产物 / outputs: ${OUT_DIR}`);
    for (const file of ["demo.gif", "demo-en.gif"]) {
      const path = join(OUT_DIR, file);
      if (existsSync(path)) console.log(`  ${file}  ${(statSync(path).size / 1024).toFixed(0)} KB`);
    }
  }
}

main().catch((error) => {
  console.error(`\n[error] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
