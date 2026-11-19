/**
 * @lang zh-CN
 * 主题注册表与解析逻辑（W-hrt-P16）。设计要点：
 * - 每套主题只定义 **12 个基础 token**（bg/bg2/bg3/fg/fg2/fg3/accent/sel/bd/bd2/banner/bannerFg），
 *   其余语义变量（hover 底、更浅边框、派生文字等）由 styles.css 用 `color-mix()` 从基础 token
 *   派生——18 套主题 × 12 值即可覆盖全部 31 个原硬编码色的视觉职责。
 * - `system` 档位不是一套主题，而是**解析规则**：按 `prefers-color-scheme` 选 `light`（缺省浅色）
 *   或 `dark`（VS Code Dark）；监听系统变化实时跟随。
 * - 编辑器侧：HugeRTE 皮肤无 CSS 变量（58 个硬编码色，2026-11-18 实测），因此编辑器主题由
 *   main.ts 的 `applyEditorTheme()` 注入覆盖样式表实现（本模块只提供每套主题的编辑器色值）。
 * @lang en
 * Theme registry and resolution logic (W-hrt-P16). Design notes:
 * - Each theme defines only **12 base tokens** (bg/bg2/bg3/fg/fg2/fg3/accent/sel/bd/bd2/banner/
 *   bannerFg); the remaining semantic variables (hover backgrounds, softer borders, derived text)
 *   are derived in styles.css from these via `color-mix()` — 18 themes × 12 values cover all 31
 *   original hard-coded colours.
 * - `system` is not a theme but a **resolution rule**: pick `light` (the default light) or `dark`
 *   (VS Code Dark) by `prefers-color-scheme`, and follow live changes.
 * - Editor side: the HugeRTE skin has no CSS variables (58 hard-coded colours, measured
 *   2026-11-18), so editor theming is done by main.ts's `applyEditorTheme()` injecting an override
 *   stylesheet; this module supplies each theme's editor colours.
 */

/** @lang zh-CN 主题的基础 12 token（壳与编辑器共用一套值）。 / @lang en The 12 base tokens of a theme (shared by shell and editor). */
export interface ThemeTokens {
  bg: string;
  bg2: string;
  bg3: string;
  fg: string;
  fg2: string;
  fg3: string;
  accent: string;
  sel: string;
  bd: string;
  bd2: string;
  banner: string;
  bannerFg: string;
}

/** @lang zh-CN 一套完整主题：id、显示名（中英）、明暗归属、基础 token。 / @lang en A full theme: id, display names (zh/en), light/dark kind, base tokens. */
export interface ThemeDef {
  id: string;
  label: string;
  labelEn: string;
  dark: boolean;
  tokens: ThemeTokens;
}

/** @lang zh-CN 18 套固定主题（浅色 10 / 深色 8）；色值取自各上游项目官方调色板，全部实测 WCAG AA ≥4.5（详见设计稿 hrt-themes-2026-11-18）。 / @lang en The 18 fixed themes (10 light / 8 dark); colours come from the upstream official palettes, all measured WCAG AA ≥4.5 (see design draft hrt-themes-2026-11-18). */
export const THEMES: ReadonlyArray<ThemeDef> = [
  { id: "light", label: "浅色（默认）", labelEn: "Light (default)", dark: false,
    tokens: { bg: "#f5f7f8", bg2: "#ffffff", bg3: "#e9eef1", fg: "#15202b", fg2: "#425466", fg3: "#7d939f", accent: "#034661", sel: "#e1fdf9", bd: "#b8c7ce", bd2: "#d4dde1", banner: "#034661", bannerFg: "#ffffff" } },
  { id: "dark", label: "深色 · VS Code", labelEn: "Dark · VS Code", dark: true,
    tokens: { bg: "#1e1e1e", bg2: "#252526", bg3: "#2d2d30", fg: "#d4d4d4", fg2: "#a8a8a8", fg3: "#808080", accent: "#4daafc", sel: "#264f78", bd: "#3c3c3c", bd2: "#333333", banner: "#2d2d30", bannerFg: "#d4d4d4" } },
  { id: "github-light", label: "GitHub 浅色", labelEn: "GitHub Light", dark: false,
    tokens: { bg: "#ffffff", bg2: "#f6f8fa", bg3: "#eaeef2", fg: "#1f2328", fg2: "#59636e", fg3: "#818b98", accent: "#0969da", sel: "#ddf4ff", bd: "#d1d9e0", bd2: "#e6eaef", banner: "#24292f", bannerFg: "#ffffff" } },
  { id: "github-dark", label: "GitHub 深色", labelEn: "GitHub Dark", dark: true,
    tokens: { bg: "#0d1117", bg2: "#161b22", bg3: "#21262d", fg: "#e6edf3", fg2: "#9198a1", fg3: "#6e7681", accent: "#4493f8", sel: "#1f3a5f", bd: "#30363d", bd2: "#21262d", banner: "#161b22", bannerFg: "#e6edf3" } },
  { id: "solarized-light", label: "Solarized 浅色", labelEn: "Solarized Light", dark: false,
    // 中文：2026-11-19 修正——旧值 bg2 #fffaf0 近乎纯白，整壳与默认浅色肉眼无法区分
    //       （维护者三次反馈"壳没有变"的最终感知根因）。现按 Solarized 正典色阶：
    //       页面 base2 #fdf6e3、表面 base3 #eee8d5（明确的奶油色）、软层 #e3dcc3；
    //       Banner 用 base01 #586e75 灰青 + 奶油前景，与其他浅色主题的深 Banner 一致，
    //       一眼可辨。
    // English: 2026-11-19 correction — the old bg2 #fffaf0 was near-white, making the whole
    //       shell visually indistinguishable from the default light theme (the perceptual root
    //       cause behind three "shell didn't change" reports). Now follows the canonical
    //       Solarized ramp: page base2 #fdf6e3, surface base3 #eee8d5 (clearly cream), soft
    //       #e3dcc3; the banner uses base01 #586e75 slate-teal with a cream foreground, matching
    //       the dark banners of the other light themes so the theme reads at a glance.
    tokens: { bg: "#fdf6e3", bg2: "#eee8d5", bg3: "#e3dcc3", fg: "#586e75", fg2: "#657b83", fg3: "#93a1a1", accent: "#1f6fa8", sel: "#e3dcc3", bd: "#d8cfae", bd2: "#e6dcc0", banner: "#586e75", bannerFg: "#fdf6e3" } },
  { id: "solarized-dark", label: "Solarized 深色", labelEn: "Solarized Dark", dark: true,
    tokens: { bg: "#002b36", bg2: "#073642", bg3: "#0b4453", fg: "#93a1a1", fg2: "#839496", fg3: "#657b83", accent: "#4aa8de", sel: "#0d5064", bd: "#0b4453", bd2: "#073642", banner: "#073642", bannerFg: "#93a1a1" } },
  { id: "nord", label: "Nord", labelEn: "Nord", dark: true,
    tokens: { bg: "#2e3440", bg2: "#343b48", bg3: "#3b4252", fg: "#eceff4", fg2: "#d8dee9", fg3: "#8f9bab", accent: "#88c0d0", sel: "#434c5e", bd: "#434c5e", bd2: "#3b4252", banner: "#3b4252", bannerFg: "#eceff4" } },
  { id: "dracula", label: "Dracula", labelEn: "Dracula", dark: true,
    tokens: { bg: "#282a36", bg2: "#2f3140", bg3: "#363849", fg: "#f8f8f2", fg2: "#c8c8d0", fg3: "#9b9bac", accent: "#bd93f9", sel: "#44475a", bd: "#44475a", bd2: "#3a3c4d", banner: "#44475a", bannerFg: "#f8f8f2" } },
  { id: "one-dark", label: "One Dark", labelEn: "One Dark", dark: true,
    tokens: { bg: "#282c34", bg2: "#2f333d", bg3: "#353b45", fg: "#abb2bf", fg2: "#8b929e", fg3: "#6b727e", accent: "#61afef", sel: "#3e4451", bd: "#3e4451", bd2: "#353b45", banner: "#21252b", bannerFg: "#abb2bf" } },
  { id: "monokai", label: "Monokai", labelEn: "Monokai", dark: true,
    tokens: { bg: "#272822", bg2: "#2e2f28", bg3: "#3a3b32", fg: "#f8f8f2", fg2: "#c5c5bd", fg3: "#96968e", accent: "#f56b8b", sel: "#49483e", bd: "#49483e", bd2: "#3a3b32", banner: "#3a3b32", bannerFg: "#f8f8f2" } },
  { id: "dimmed", label: "Dimmed 低对比", labelEn: "Dimmed", dark: true,
    tokens: { bg: "#22272e", bg2: "#2d333b", bg3: "#373e47", fg: "#adbac7", fg2: "#909dab", fg3: "#768390", accent: "#539bf5", sel: "#2d4a6b", bd: "#444c56", bd2: "#373e47", banner: "#2d333b", bannerFg: "#adbac7" } },
  { id: "one-light", label: "One 浅色", labelEn: "One Light", dark: false,
    tokens: { bg: "#fafafa", bg2: "#f0f0f1", bg3: "#e5e5e6", fg: "#383a42", fg2: "#696c77", fg3: "#a0a1a7", accent: "#1a5fd0", sel: "#dbe6fb", bd: "#c9c9ca", bd2: "#dcdcdd", banner: "#383a42", bannerFg: "#fafafa" } },
  { id: "gruvbox-light", label: "Gruvbox 浅色", labelEn: "Gruvbox Light", dark: false,
    tokens: { bg: "#fbf1c7", bg2: "#f2e5bc", bg3: "#ebdbb2", fg: "#3c3836", fg2: "#504945", fg3: "#928374", accent: "#af3a03", sel: "#f0d9a8", bd: "#d5c4a1", bd2: "#e0cfa8", banner: "#3c3836", bannerFg: "#fbf1c7" } },
  { id: "latte", label: "Catppuccin Latte", labelEn: "Catppuccin Latte", dark: false,
    tokens: { bg: "#eff1f5", bg2: "#e6e9ef", bg3: "#dce0e8", fg: "#4c4f69", fg2: "#6c6f85", fg3: "#9ca0b0", accent: "#1660d8", sel: "#ccd8f5", bd: "#ccd0da", bd2: "#dce0e8", banner: "#4c4f69", bannerFg: "#eff1f5" } },
  { id: "rose-dawn", label: "Rosé Pine Dawn", labelEn: "Rosé Pine Dawn", dark: false,
    tokens: { bg: "#faf4ed", bg2: "#f2e9e1", bg3: "#f4ede8", fg: "#575279", fg2: "#797593", fg3: "#9893a5", accent: "#286983", sel: "#e4dfe8", bd: "#dfdad9", bd2: "#f0e9e3", banner: "#575279", bannerFg: "#faf4ed" } },
  { id: "quiet", label: "Quiet Light", labelEn: "Quiet Light", dark: false,
    tokens: { bg: "#f5f5f5", bg2: "#ececec", bg3: "#e0e0e0", fg: "#333333", fg2: "#5a5a5a", fg3: "#999999", accent: "#7a3e9d", sel: "#e6dcf0", bd: "#cfcfcf", bd2: "#dedede", banner: "#333333", bannerFg: "#f5f5f5" } },
  { id: "tokyo-day", label: "Tokyo Night Day", labelEn: "Tokyo Night Day", dark: false,
    tokens: { bg: "#e1e2e7", bg2: "#d7d8e3", bg3: "#cdd0dd", fg: "#3760bf", fg2: "#6172b0", fg3: "#8990b8", accent: "#1a5cbf", sel: "#c3d0ee", bd: "#b8bcd0", bd2: "#cdd0dd", banner: "#3760bf", bannerFg: "#e1e2e7" } },
  { id: "ayu-light", label: "Ayu 浅色", labelEn: "Ayu Light", dark: false,
    tokens: { bg: "#fafafa", bg2: "#f0f0f0", bg3: "#e6e6e6", fg: "#5c6166", fg2: "#787b80", fg3: "#a0a3a8", accent: "#b3541a", sel: "#f5e0d0", bd: "#c8c8c8", bd2: "#dedede", banner: "#5c6166", bannerFg: "#fafafa" } }
];

/** @lang zh-CN 主题设置持久化键（contract-freeze §5 增量键）。 / @lang en The theme persistence key (additive key in contract-freeze §5). */
export const THEME_KEY = "hia-hugerte.theme";

/** @lang zh-CN 主题档位：固定 id 或 `system`（跟随 prefers-color-scheme）。 / @lang en Theme setting: a fixed theme id or `system` (follow prefers-color-scheme). */
export type ThemeSetting = string;

/** @lang zh-CN 读取持久化的主题档位；非法值回落 `system`。 / @lang en Read the persisted theme setting; invalid values fall back to `system`. */
export function getThemeSetting(): ThemeSetting {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored !== null && (stored === "system" || THEMES.some((theme) => theme.id === stored))) return stored;
  } catch {
    // 非浏览器环境（单测）——回落 / Non-browser context (unit tests) — fall back.
  }
  return "system";
}

/**
 * @lang zh-CN
 * 把档位解析为**具体主题**：`system` 按 `prefers-color-scheme` 选 light/dark；
 * 其他值按 id 查表，查不到回落 light。
 * @lang en
 * Resolve a setting into a **concrete theme**: `system` picks light/dark by
 * `prefers-color-scheme`; other values are looked up by id, falling back to light.
 */
export function resolveTheme(setting: ThemeSetting): ThemeDef {
  if (setting === "system") {
    const prefersDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
    return THEMES.find((theme) => theme.id === (prefersDark ? "dark" : "light")) ?? (THEMES[0] as ThemeDef);
  }
  return THEMES.find((theme) => theme.id === setting) ?? THEMES[0];
}

/**
 * @lang zh-CN
 * 把基础 token 展开为**编辑器覆盖样式**的 CSS 文本（作用于 HugeRTE 注入主文档的 .tox 树与
 * iframe 正文）：调用方（main.ts）把结果写进一个 `<style>`，主题切换时更新内容即可——
 * 不重建编辑器实例。
 * @lang en
 * Expand base tokens into the **editor override stylesheet** CSS text (targeting the .tox tree
 * HugeRTE injects into the main document plus the iframe body); the caller (main.ts) writes the
 * result into a `<style>` and updates its content on switch — no editor rebuild needed.
 */
export function editorThemeCss(tokens: ThemeTokens): string {
  return [
    `.tox, .tox .tox-editor-header, .tox .tox-toolbar-overlord, .tox .tox-toolbar__primary,`,
    `.tox .tox-toolbar__overflow, .tox .tox-sidebar, .tox .tox-view-wrap, .tox .tox-view-wrap__slot-container,`,
    `.tox .tox-statusbar { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox { border-color: ${tokens.bd2} !important; }`,
    // 中文：普通 .tox-tbtn（button/span/split-button 各部件）基础态必须显式透明——皮肤不给
    //       基础态背景，`<button>`/`<span role=presentation>` 会吃 UA 默认白底（暗色主题下
    //       呈白色 chip，2026-11-19 维护者四张截图的最终根因）。
    // English: The base state of plain .tox-tbtn (button/span/split-button parts) must be
    //       explicitly transparent — the skin sets no base background, so <button>/<span>
    //       elements fall back to the UA default white (white chips on dark themes — the final
    //       root cause behind the maintainer's four 2026-11-19 screenshots).
    `.tox .tox-tbtn { background-color: transparent !important; color: ${tokens.fg} !important; }`,
    // 中文：图标 SVG 的 fill 由皮肤硬编码为深色（不走 currentColor），暗色主题下黑图标不可见——
    //       强制所有 .tox-icon/.tox-tbtn 内的 svg 跟随所在容器文字色（2026-11-19 维护者反馈）。
    // English: The skin hardcodes icon SVG fills to a dark colour (not currentColor), leaving black
    //       icons invisible on dark themes — force every .tox-icon/.tox-tbtn svg to follow the
    //       container's text colour (2026-11-19 maintainer feedback).
    `.tox .tox-tbtn svg, .tox .tox-icon svg { fill: currentColor !important; }`,
    `.tox .tox-tbtn:hover, .tox .tox-tbtn:focus { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-tbtn:active, .tox .tox-tbtn--active, .tox .tox-tbtn--active:hover { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    // 中文：--enabled（如加粗持续生效态）与 :focus-visible（点两次箭头后残留的焦点态）同样
    //       需要主题化，否则皮肤给出浅色底/白底（维护者截图 2）。
    // English: The --enabled state (e.g. bold toggled on) and :focus-visible (the residual focus
    //       state after clicking a chevron twice) must be themed too, or the skin paints light or
    //       white chips (maintainer screenshot 2).
    `.tox .tox-tbtn--enabled, .tox .tox-tbtn--enabled:hover { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-tbtn:focus-visible, .tox .tox-split-button:focus-visible, .tox .tox-split-button:focus-visible .tox-tbtn { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    // 中文：split-button **根容器**的状态也要主题化——皮肤给根容器焦点/展开态白底，箭头连点两次
    //       后根元素变白（2026-11-19 维护者截图 2 的直接来源，本轮复现确认 rootBg=rgb(255,255,255)）。
    // English: The split-button **root container** states must be themed too — the skin paints the
    //       root white on focus/expanded states, turning the whole chip white after two chevron
    //       clicks (the direct source of maintainer screenshot 2; reproduced this round with
    //       rootBg = rgb(255,255,255)).
    `.tox .tox-split-button { background-color: transparent !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-split-button:hover, .tox .tox-split-button:focus, .tox .tox-split-button:focus-visible, .tox .tox-split-button:focus-within { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-tbtn--disabled, .tox .tox-tbtn--disabled:hover { color: ${tokens.fg3} !important; background-color: transparent !important; }`,
    `.tox .tox-tbtn--select, .tox .tox-tbtn--select:hover { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-toolbar__primary { border-bottom: 1px solid ${tokens.bd2} !important; }`,
    `.tox .tox-edit-area__iframe { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-statusbar { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-menu { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-menu .tox-menu-item { color: ${tokens.fg} !important; }`,
    `.tox .tox-collection__item { color: ${tokens.fg} !important; }`,
    // 中文：菜单条目的全部"高亮态"变体（悬停/激活/enacted 当前值/选中）统一用 sel——避免皮肤
    //       残留的深色高亮脱离主题（维护者截图 1：段落 ✓ 当前值行颜色不对）。
    // English: Every highlighted variant of menu items (hover/active/enacted current
    //       value/selected) uses sel uniformly — so no leftover skin highlight escapes the theme
    //       (maintainer screenshot 1: the miscoloured "段落 ✓" current-value row).
    `.tox .tox-collection__item--active, .tox .tox-collection__item--enacted, .tox .tox-collection__item--selected, .tox .tox-collection__item:hover { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-dialog, .tox .tox-dialog__body, .tox .tox-dialog__footer { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    // 中文：对话框标题栏有自己的皮肤白底，须单独覆盖背景（2026-11-19 表格属性对话框截图）。
    // English: The dialog header carries its own skin white background and needs its own override
    //       (2026-11-19 table-properties dialog screenshot).
    `.tox .tox-dialog__header { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-dialog__title { color: ${tokens.fg} !important; }`,
    // 中文：模态遮罩改为暗色半透明——皮肤默认 rgba(255,255,255,.75) 会把整个暗色壳洗白。
    // English: The modal backdrop becomes dark translucent — the skin default rgba(255,255,255,.75)
    //       washes out the whole dark shell.
    `.tox .tox-dialog-wrap__backdrop { background-color: rgba(0, 0, 0, 0.5) !important; }`,
    `.tox .tox-toolbar__overflow .tox-toolbar { background-color: transparent !important; }`,
    `.tox .tox-pop { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-pop__dialog { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-dropzone { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-insert-table-picker { background-color: ${tokens.bg2} !important; }`,
    `.tox .tox-color-picker-container { background-color: ${tokens.bg2} !important; }`,
    // 中文：下拉列表框（对话框内的对齐/类列表）也要显式底色，否则吃 UA 白底。
    // English: Listboxes (alignment/classes inside dialogs) also need an explicit backdrop or they
    //       fall back to the UA white.
    `.tox .tox-listbox, .tox .tox-listbox--select { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-selectfield select { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    // 中文：表单控件必须同时覆盖**边框色**——皮肤给 `.tox-textfield, .tox-toolbar-textfield,
    //       .tox-listboxfield .tox-listbox--select, .tox-textarea, .tox-selectfield select` 统一
    //       设了 `border-color: #eeeeee`，只改背景会留下刺眼的浅灰描边（2026-11-19 维护者截图：
    //       插入链接对话框的目标窗口下拉框上下两条 1px 白线，实测 rgb(238,238,238)）。
    // English: Form controls need their **border colour** overridden too — the skin sets
    //       `border-color: #eeeeee` across `.tox-textfield, .tox-toolbar-textfield,
    //       .tox-listboxfield .tox-listbox--select, .tox-textarea, .tox-selectfield select`; changing
    //       only the background leaves a jarring pale stroke (2026-11-19 screenshot: the two 1px
    //       lines above/below the target-window listbox in the insert-link dialog, measured
    //       rgb(238,238,238)).
    `.tox .tox-textfield, .tox .tox-textarea, .tox .tox-toolbar-textfield,`,
    `.tox .tox-listbox, .tox .tox-listbox--select, .tox .tox-selectfield select,`,
    `.tox .tox-textarea-wrap { border-color: ${tokens.bd} !important; }`,
    `.tox .tox-textfield, .tox .tox-textarea { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd} !important; }`,
    `.tox .tox-search-dialog { background-color: ${tokens.bg2} !important; }`,
    `.tox .tox-menu .tox-collection__item--active { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-block-wrap { color: ${tokens.fg} !important; }`,
    `.tox .tox-bubble { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-notification { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-dialog__body-content { color: ${tokens.fg} !important; }`,
    `.tox .tox-button { background-color: ${tokens.bg3} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd} !important; }`,
    // 中文：次要按钮的边框与底色同源（皮肤 #f0f0f0/#e3e3e3/#d6d6d6/#a8c8ed），必须一起覆盖，
    //       否则暗色主题下按钮周围出现浅灰描边（2026-11-19 截图实测 rgb(240,240,240)）。
    // English: Secondary buttons share the same colour for border and fill (skin
    //       #f0f0f0/#e3e3e3/#d6d6d6/#a8c8ed); both must be overridden together or pale strokes
    //       appear around buttons on dark themes (measured rgb(240,240,240) in the 2026-11-19
    //       screenshot).
    `.tox .tox-button--secondary { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd} !important; }`,
    `.tox .tox-input-group { color: ${tokens.fg} !important; }`,
    `.tox .tox-label { color: ${tokens.fg2} !important; }`,
    // ===== 以下为按皮肤 CSS 清单逐条补齐的"状态变体"覆盖（2026-11-19 第三轮）=====
    // 中文：皮肤为大量元素准备了**独立的浅色状态规则**（:focus / :hover / [disabled] /
    //       --enabled / 分组标题 / 数字输入框 / bespoke 按钮 / 颜色选择器 / 缩略图列表），
    //       每条都可能把暗色主题打回浅色。这里按 oxide/skin.css 的实际清单逐条对照覆盖。
    // English: The skin ships **separate light rules for many states** (:focus / :hover /
    //       [disabled] / --enabled / group headings / number input / bespoke buttons / colour
    //       picker / swatch grid); any one of them can restore a light surface on a dark theme.
    //       Every rule below is checked one-by-one against oxide/skin.css.
    // 中文：输入框/列表框/下拉框的 :focus 与 [disabled] 态（皮肤给 #fff / #f2f2f2）。
    // English: :focus and [disabled] states of text fields / listboxes / selects (the skin paints
    //       #fff / #f2f2f2).
    `.tox .tox-textfield:focus, .tox .tox-textarea:focus, .tox .tox-textarea-wrap:focus-within,`,
    `.tox .tox-listboxfield .tox-listbox--select:focus, .tox .tox-selectfield select:focus {`,
    `  background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; border-color: ${tokens.accent} !important; }`,
    `.tox .tox-textfield[disabled], .tox .tox-textarea[disabled], .tox .tox-textfield--disabled,`,
    `.tox .tox-listboxfield .tox-listbox--select[disabled], .tox .tox-selectfield select[disabled] {`,
    `  background-color: ${tokens.bg3} !important; color: ${tokens.fg3} !important; border-color: ${tokens.bd2} !important; }`,
    // 中文：菜单分组标题（#fcfcfc）与水平集合容器（#fff）的底色。
    // English: Menu group headings (#fcfcfc) and the horizontal collection container (#fff).
    `.tox .tox-collection__group-heading { background-color: ${tokens.bg3} !important; color: ${tokens.fg3} !important; }`,
    `.tox .tox-collection--horizontal, .tox .tox-collection--list .tox-collection__group { background-color: ${tokens.bg2} !important; border-color: ${tokens.bd2} !important; }`,
    // 中文：菜单里"当前生效值"条目（皮肤给纯白）与工具栏集合的 active 态。
    // English: The "currently effective value" item in menus (skin paints pure white) and the
    //       toolbar collection's active state.
    `.tox .tox-collection--list .tox-collection__item--enabled { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-collection--toolbar .tox-collection__item--active,`,
    `.tox .tox-collection--toolbar .tox-collection__item--active:hover,`,
    `.tox .tox-collection--grid .tox-collection__item--active:not(.tox-collection__item--state-disabled) {`,
    `  background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-collection--list .tox-collection__item--active:not(.tox-collection__item--state-disabled) { color: ${tokens.fg} !important; }`,
    // 中文：数字输入框与 bespoke 按钮（皮肤 #f7f7f7）及其内部按钮/输入状态。
    // English: Number input and bespoke buttons (skin #f7f7f7) plus their inner button/input states.
    `.tox .tox-number-input, .tox .tox-number-input:focus, .tox .tox-tbtn--bespoke, .tox .tox-tbtn--bespoke:focus { background-color: ${tokens.bg3} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-number-input input, .tox .tox-number-input button { background-color: transparent !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-number-input input:hover, .tox .tox-number-input button:hover { background-color: ${tokens.sel} !important; }`,
    `.tox .tox-number-input input:disabled, .tox .tox-number-input button:disabled { background-color: transparent !important; color: ${tokens.fg3} !important; }`,
    // 中文：菜单栏按钮（.tox-mbtn）各态——皮肤给 #fff / #f0f0f0。
    // English: Menubar buttons (.tox-mbtn) in all states — the skin paints #fff / #f0f0f0.
    `.tox .tox-mbtn { background-color: transparent !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-mbtn:hover:not(:disabled):not(.tox-mbtn--active), .tox .tox-mbtn:focus:not(:disabled), .tox .tox-mbtn--active { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-mbtn[disabled] { background-color: transparent !important; color: ${tokens.fg3} !important; }`,
    // 中文：颜色选择器——色板悬停底、色相滑块拇指（皮肤给白色）、色相条本身是彩虹渐变
    //       （内容本身，保留），滑动面板边框改主题色。
    // English: Colour picker — swatch hover backdrop, hue-slider thumb (skin paints white), the hue
    //       strip itself stays a rainbow (that IS the content), and slider/palette borders are
    //       themed.
    `.tox .tox-swatches__picker-btn:hover, .tox .tox-swatches__picker-btn:focus { background-color: ${tokens.sel} !important; }`,
    `.tox .tox-hue-slider-thumb { background-color: ${tokens.fg} !important; border-color: ${tokens.bg2} !important; }`,
    `.tox .tox-sv-palette-inner-thumb, .tox .tox-color-input span::before { border-color: ${tokens.fg} !important; }`,
    `.tox .tox-slider__rail { border-color: ${tokens.bd2} !important; }`,
    // 中文：表格网格选择器的单元格边框（皮肤 #eeeeee，暗底上刺眼）。
    // English: Insert-table grid cell borders (skin #eeeeee, glaring on a dark backdrop).
    `.tox .tox-insert-table-picker > div { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-insert-table-picker .tox-insert-table-picker__selected { border-color: ${tokens.accent} !important; background-color: ${tokens.sel} !important; }`,
    // 中文：对话框底部/整框边框、pop 箭头描边、状态栏与 well 等容器边框统一主题化。
    // English: Dialog footer/frame borders, pop arrow outlines, status bar and well borders are
    //       themed uniformly.
    `.tox .tox-dialog__footer { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-dialog { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-pop__dialog { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-pop.tox-pop--bottom::after { border-color: ${tokens.bg2} transparent transparent transparent !important; }`,
    `.tox .tox-pop.tox-pop--bottom::before { border-color: ${tokens.bd2} transparent transparent transparent !important; }`,
    `.tox .tox-pop.tox-pop--top::after { border-color: transparent transparent ${tokens.bg2} transparent !important; }`,
    `.tox .tox-pop.tox-pop--top::before { border-color: transparent transparent ${tokens.bd2} transparent !important; }`,
    `.tox .tox-pop.tox-pop--left::after { border-color: transparent ${tokens.bg2} transparent transparent !important; }`,
    `.tox .tox-pop.tox-pop--left::before { border-color: transparent ${tokens.bd2} transparent transparent !important; }`,
    `.tox .tox-pop.tox-pop--right::after { border-color: transparent transparent transparent ${tokens.bg2} !important; }`,
    `.tox .tox-pop.tox-pop--right::before { border-color: transparent transparent transparent ${tokens.bd2} !important; }`,
    `.tox .tox-statusbar { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-well, .tox .tox-view__pane_panel, .tox .tox-custom-editor { border-color: ${tokens.bd2} !important; background-color: ${tokens.bg2} !important; }`,
    // 中文：对话框内按钮的 :focus / :hover / :active / [disabled] 态（皮肤给 #f0f0f0/#e3e3e3/
    //       #d6d6d6），以及次要按钮的禁用态。
    // English: Dialog button :focus / :hover / :active / [disabled] states (skin #f0f0f0/#e3e3e3/
    //       #d6d6d6) plus the secondary button's disabled state.
    `.tox .tox-button:hover:not(:disabled), .tox .tox-button:focus:not(:disabled) { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-button:active:not(:disabled) { background-color: ${tokens.bg2} !important; }`,
    `.tox .tox-button[disabled], .tox .tox-button--secondary[disabled], .tox .tox-button--secondary:hover:not(:disabled), .tox .tox-button--secondary:focus:not(:disabled), .tox .tox-button--secondary:active:not(:disabled) { background-color: ${tokens.bg3} !important; color: ${tokens.fg3} !important; }`,
    // 中文：通知条（成功/警告/错误/信息）的皮肤浅色底改为主题软层，前景保持主题文字色。
    // English: Notification banners (success/warn/error/info) switch from the skin's pale tints to
    //       the theme's soft layer, keeping themed text.
    `.tox .tox-notification--success, .tox .tox-notification--error, .tox .tox-notification--warn,`,
    `.tox .tox-notification--warning, .tox .tox-notification--info { background-color: ${tokens.bg3} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd} !important; }`,
    // 中文：编辑器外框（.tox-hugerte 的 2px 浅灰边）、工具栏内联文本框、split-button 禁用态、
    //       数字输入框内部包装——均为自动核查查出的真实遗漏项。
    // English: The editor frame (.tox-hugerte's 2px pale border), the toolbar inline text field, the
    //       split-button disabled state, and the number input's inner wrapper — all real omissions
    //       the automated check surfaced.
    `.tox.tox-hugerte, .tox-hugerte { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-toolbar-textfield { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd} !important; }`,
    `.tox .tox-split-button.tox-tbtn--disabled:hover, .tox .tox-split-button.tox-tbtn--disabled:focus,`,
    `.tox .tox-split-button.tox-tbtn--disabled:focus-visible { background-color: transparent !important; }`,
    `.tox .tox-number-input:focus:not(:active) > .tox-input-wrapper, .tox .tox-number-input:focus:not(:active) > button { background-color: ${tokens.bg3} !important; }`,
    // 中文：次要按钮的 --enabled 态（皮肤给蓝色，改主题强调色淡底）与菜单栏激活+焦点组合态。
    // English: Secondary button --enabled (skin paints blue; use a tinted accent) and the menubar's
    //       active+focus combination.
    `.tox .tox-button--secondary.tox-button--enabled, .tox .tox-button--secondary.tox-button--enabled[disabled] { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-mbtn:not(:disabled).tox-mbtn--active:focus { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-collection--toolbar .tox-collection__item--enabled.tox-collection__item--active { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    // 中文：编辑器自带菜单栏（.tox-menubar，工具栏之上）的底色——皮肤给纯白，此前遗漏。
    // English: The editor's own menubar (.tox-menubar, above the toolbar) — the skin paints it pure
    //       white; previously missed.
    `.tox .tox-menubar { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`,
    // 中文：无障碍检查器内嵌提示条（编辑无障碍内容时出现的警告/错误块）——皮肤给黄/红色底，
    //       改主题软层并保留文字可读性。
    // English: The accessibility-checker inline banners (warn/error blocks that appear when editing
    //       accessible content) — the skin paints yellow/red; switch to the theme's soft layer while
    //       keeping text readable.
    `.tox .tox-dialog__body-content .accessibility-issue--warn a.tox-button--naked.tox-button--icon,`,
    `.tox .tox-dialog__body-content .accessibility-issue--warn a.tox-button--naked.tox-button--icon:hover,`,
    `.tox .tox-dialog__body-content .accessibility-issue--warn a.tox-button--naked.tox-button--icon:active,`,
    `.tox .tox-dialog__body-content .accessibility-issue--error a.tox-button--naked.tox-button--icon { background-color: ${tokens.bg3} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-navobj-bordered::before, .tox.tox-inline-edit-area { border-color: ${tokens.bd2} !important; }`,
    // 中文：对话框内的**分页标签栏**（表格属性对话框的「一般 / 高级」）——皮肤把选中项写死为
    //       蓝色 #006ce7、未选中项写死为半透明深灰 #222f3e，在暗色底上几乎不可见（2026-11-19
    //       维护者红框：实测未选中项与背景对比度 = 0）。
    // English: The **tab strip inside dialogs** (the General/Advanced tabs of the table-properties
    //       dialog) — the skin hardcodes the selected tab as blue #006ce7 and unselected tabs as
    //       translucent dark #222f3e, which is nearly invisible on a dark surface (2026-11-19 red
    //       box: the unselected tab measured contrast 0 against its background).
    `.tox .tox-dialog__body-nav { background-color: ${tokens.bg2} !important; border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-dialog__body-nav-item { color: ${tokens.fg2} !important; border-color: transparent !important; }`,
    `.tox .tox-dialog__body-nav-item:hover { color: ${tokens.fg} !important; }`,
    `.tox .tox-dialog__body-nav-item--active { color: ${tokens.accent} !important; border-color: ${tokens.accent} !important; }`,
    // 中文：对话框正文里的链接与表单分组标题（皮肤写死深色 #222f3e / 蓝色系）。
    // English: Links and form-group headings inside dialog bodies (the skin hardcodes dark #222f3e
    //       and blues).
    `.tox .tox-dialog__body-content a { color: ${tokens.accent} !important; }`,
    `.tox .tox-dialog__body-content a:hover, .tox .tox-dialog__body-content a:focus { color: ${tokens.accent} !important; }`,
    `.tox .tox-dialog__body-content .tox-form__group h1, .tox .tox-dialog__body-content .tox-form__group h2 { color: ${tokens.fg} !important; }`,
    // 中文：`--naked` 按钮（无底色图标/文字按钮）的文字色与悬停底——皮肤同样写死深色。
    // English: `--naked` buttons (chrome-less icon/text buttons) — the skin likewise hardcodes dark
    //       text and a dark hover backdrop.
    `.tox .tox-button--naked, .tox .tox-button--naked:hover:not(:disabled),`,
    `.tox .tox-button--naked:focus:not(:disabled), .tox .tox-button--naked:active:not(:disabled) { color: ${tokens.fg} !important; }`,
    `.tox .tox-button--naked:hover:not(:disabled), .tox .tox-button--naked:focus:not(:disabled) { background-color: ${tokens.sel} !important; }`,
    // 中文：对话框正文的默认文字色（皮肤在 `.tox-dialog__body` 写死 #222f3e）。
    // English: The dialog body's default text colour (the skin hardcodes #222f3e on
    //       `.tox-dialog__body`).
    `.tox .tox-dialog__body, .tox .tox-dialog__body-content, .tox .tox-form, .tox .tox-form__group { color: ${tokens.fg} !important; }`
  ].join("\n");
}

/** @lang zh-CN 字体栈持久化键（contract-freeze §5 增量键）。 / @lang en The font-stack persistence key (additive key in contract-freeze §5). */
export const FONT_STACK_KEY = "hia-hugerte.font-stack";

/** @lang zh-CN 字体栈两档：`system`（系统缺省栈）/ `hia`（HIA 开源字体栈）。 / @lang en The two font stacks: `system` (the OS default stack) / `hia` (the HIA open-source stack). */
export type FontStack = "system" | "hia";

/** @lang zh-CN 读取持久化的字体栈；非法值回落 `system`。 / @lang en Read the persisted font stack; invalid values fall back to `system`. */
export function getFontStack(): FontStack {
  try {
    const stored = localStorage.getItem(FONT_STACK_KEY);
    return stored === "hia" ? "hia" : "system";
  } catch {
    return "system";
  }
}

/** @lang zh-CN 持久化字体栈。 / @lang en Persist the font stack. */
export function setFontStack(stack: FontStack): void {
  try {
    localStorage.setItem(FONT_STACK_KEY, stack);
  } catch {
    // 非浏览器环境：跳过持久化 / Non-browser context: skip persistence.
  }
}

/**
 * @lang zh-CN
 * 把字体栈写到根元素 CSS 变量 `--font-ui`（壳各处 `font-family` 引用该变量）。两档：
 * `system` = `system-ui, sans-serif`（OS 缺省）；`hia` = 开源字体栈（Inter / Noto Sans SC /
 * Source Han Sans SC / Sarasa Gothic SC——均已核验开源许可，专有字体仅作回退链末位兼容）。
 * @lang en
 * Write the font stack to the root CSS variable `--font-ui` (the shell's `font-family` references
 * it). Two stacks: `system` = `system-ui, sans-serif` (OS default); `hia` = the open-source stack
 * (Inter / Noto Sans SC / Source Han Sans SC / Sarasa Gothic SC — all verified open-source;
 * proprietary fonts only appear as late fallbacks for compatibility).
 */
export function applyFontStack(): FontStack {
  const stack = getFontStack();
  const value = stack === "hia"
    ? "'Inter', 'Noto Sans SC', 'Source Han Sans SC', 'Sarasa Gothic SC', sans-serif"
    : "system-ui, sans-serif";
  document.documentElement.style.setProperty("--font-ui", value);
  return stack;
}

/** @lang zh-CN 持久化主题档位（`system` 或固定主题 id）。 / @lang en Persist the theme setting (`system` or a fixed theme id). */
export function setThemeSetting(setting: ThemeSetting): void {
  try {
    localStorage.setItem(THEME_KEY, setting);
  } catch {
    // 非浏览器环境：跳过持久化 / Non-browser context: skip persistence.
  }
}
