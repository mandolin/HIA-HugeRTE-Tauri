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
    tokens: { bg: "#fdf6e3", bg2: "#fffaf0", bg3: "#eee8d5", fg: "#586e75", fg2: "#657b83", fg3: "#93a1a1", accent: "#1f6fa8", sel: "#eee8d5", bd: "#d8cfae", bd2: "#e6dcc0", banner: "#eee8d5", bannerFg: "#586e75" } },
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
    `.tox .tox-tbtn { color: ${tokens.fg} !important; }`,
    `.tox .tox-tbtn:hover, .tox .tox-tbtn:focus { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-tbtn--disabled, .tox .tox-tbtn--disabled:hover { color: ${tokens.fg3} !important; background-color: transparent !important; }`,
    `.tox .tox-tbtn--select, .tox .tox-tbtn--select:hover { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-toolbar__primary { border-bottom: 1px solid ${tokens.bd2} !important; }`,
    `.tox .tox-edit-area__iframe { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-statusbar { border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-menu { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; border-color: ${tokens.bd2} !important; }`,
    `.tox .tox-menu .tox-menu-item { color: ${tokens.fg} !important; }`,
    `.tox .tox-collection__item { color: ${tokens.fg} !important; }`,
    `.tox .tox-collection__item--active { background-color: ${tokens.sel} !important; color: ${tokens.fg} !important; }`,
    `.tox .tox-dialog, .tox .tox-dialog__body, .tox .tox-dialog__footer { background-color: ${tokens.bg2} !important; color: ${tokens.fg} !important; }`
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
