/**
 * @lang zh-CN
 * 应用级 UI 图标（内联 SVG 路径数据）。来源：Tabler Icons（MIT，Copyright (c) 2020-2026 Paweł Kuna），
 * 取自其仓库 `icons/outline/*.svg` 的路径数据，内联为源码——不引入 npm 依赖、不打包字体文件。
 * 采用审计与再分发影响见 `work-zone/dev/audits/icon-set-tabler-2026-11-16.md`；许可声明登记于
 * `THIRD_PARTY_NOTICES.md`。
 * 使用约定：统一 24×24 视图框、`stroke` 描边风格、`stroke-width` 由调用方通过 CSS 控制；图标仅作
 * 视觉提示，语义由按钮的 `title`/`aria-label` 承担（不依赖图标可读性）。
 * @lang en
 * Application-level UI icons (inline SVG path data). Source: Tabler Icons (MIT, Copyright (c)
 * 2020-2026 Paweł Kuna), taken from the repository's `icons/outline/*.svg` path data and inlined as
 * source — no npm dependency and no font files bundled. Adoption audit and redistribution impact:
 * `work-zone/dev/audits/icon-set-tabler-2026-11-16.md`; the licence notice is recorded in
 * `THIRD_PARTY_NOTICES.md`.
 * Usage contract: uniform 24×24 view box and `stroke` style; `stroke-width` is controlled by the
 * caller through CSS. Icons are visual hints only — semantics come from the button's
 * `title`/`aria-label` (never rely on the icon alone for meaning).
 */

/** @lang zh-CN 图标名到 SVG 路径数据的映射（每个值为一组 `d` 属性）。 / @lang en Icon name to SVG path data (each value is a list of `d` attributes). */
const ICON_PATHS = {
  /** 新建：文件加号 */
  "file-plus": [
    "M14 3v4a1 1 0 0 0 1 1h4",
    "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",
    "M12 11l0 6",
    "M9 14l6 0"
  ],
  /** 打开：打开的文件夹 */
  "folder-open": [
    "M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2"
  ],
  /** 保存：软盘 */
  "device-floppy": [
    "M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2",
    "M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
    "M14 4l0 4l-6 0l0 -4"
  ],
  /** 另存为：文件加下箭头 */
  "file-download": [
    "M14 3v4a1 1 0 0 0 1 1h4",
    "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",
    "M12 17v-6",
    "M9.5 14.5l2.5 2.5l2.5 -2.5"
  ],
  /** 历史：带指针的时钟 */
  "history": [
    "M12 8l0 4l2 2",
    "M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"
  ],
  /** 目录树显隐：左侧栏折叠 */
  "layout-sidebar-left-collapse": [
    "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12",
    "M9 4v16",
    "M15 10l-2 2l2 2"
  ],
  /** 目录树显隐：左侧栏展开 */
  "layout-sidebar-left-expand": [
    "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12",
    "M9 4v16",
    "M14 10l2 2l-2 2"
  ],
  /** 设置：齿轮 */
  "settings": [
    "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065",
    "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"
  ]
} as const;

/** @lang zh-CN 图标名（受 `ICON_PATHS` 约束，拼错即编译期报错）。 / @lang en Icon names (constrained by `ICON_PATHS`; typos become compile errors). */
export type IconName = keyof typeof ICON_PATHS;

/**
 * @lang zh-CN
 * 构建一个内联 SVG 图标元素：`aria-hidden`（语义由按钮承担）、`focusable=false`（不被 Tab 聚焦）、
 * 统一 24×24 视图框、`currentColor` 描边（随父级文字色）。返回的 SVG 可直接插入按钮。
 * @lang en
 * Build an inline SVG icon element: `aria-hidden` (semantics live on the button), `focusable=false`
 * (not tab-focusable), a uniform 24x24 view box and `currentColor` stroke (follows the parent's text
 * colour). The returned SVG can be appended directly to a button.
 */
export function createIcon(name: IconName, size = 16): SVGSVGElement {
  // 中文：命名空间必须显式指定，否则 createElementNS 产物在 HTML 文档中不会被识别为 SVG。
  // English: The namespace must be explicit; otherwise the createElementNS product is not recognised
  //          as SVG inside an HTML document.
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("app-icon");
  // 中文：每条路径单独建元素，保留原始多段结构（便于与上游 SVG 对照）。
  // English: One element per path, preserving the upstream multi-path structure (easy to diff
  //          against the source SVGs).
  for (const pathData of ICON_PATHS[name]) {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  }
  return svg;
}
