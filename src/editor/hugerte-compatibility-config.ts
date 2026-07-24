import { VAULT_CUSTOM_CHARACTER_MAP } from "./hugerte-vault-character-profile";

/** 中文：与维护者指定 Vault 一致的默认特殊字符分组。 */
const DEFAULT_CHARACTER_GROUPS = [
  ["Common symbols", [["✓", "Check mark"], ["✗", "Ballot X"], ["※", "Reference mark"], ["§", "Section sign"], ["¶", "Paragraph sign"], ["★", "Black star"], ["☆", "White star"], ["•", "Bullet"], ["…", "Ellipsis"]]],
  ["Arrows", [["←", "Left arrow"], ["→", "Right arrow"], ["↑", "Up arrow"], ["↓", "Down arrow"], ["↔", "Left right arrow"], ["↕", "Up down arrow"], ["⇒", "Right double arrow"], ["⇐", "Left double arrow"], ["⇔", "Left right double arrow"]]],
  ["Box drawing", [["─", "Box drawings light horizontal"], ["│", "Box drawings light vertical"], ["┌", "Box drawings light down and right"], ["┐", "Box drawings light down and left"], ["└", "Box drawings light up and right"], ["┘", "Box drawings light up and left"], ["├", "Box drawings vertical and right"], ["┤", "Box drawings vertical and left"], ["┬", "Box drawings down and horizontal"], ["┴", "Box drawings up and horizontal"], ["┼", "Box drawings vertical and horizontal"]]],
  ["Shapes", [["■", "Black square"], ["□", "White square"], ["◆", "Black diamond"], ["◇", "White diamond"], ["●", "Black circle"], ["○", "White circle"], ["▲", "Black up triangle"], ["▼", "Black down triangle"]]],
  ["Math", [["±", "Plus-minus sign"], ["×", "Multiplication sign"], ["÷", "Division sign"], ["≈", "Almost equal to"], ["≠", "Not equal to"], ["≤", "Less-than or equal to"], ["≥", "Greater-than or equal to"], ["∞", "Infinity"], ["√", "Square root"]]],
  ["OneNote tags", [["○", "Open task circle"], ["✅", "Done check"], ["❗", "Important mark"], ["❓", "Question mark"], ["💡", "Idea bulb"], ["📌", "Pin"], ["🔖", "Bookmark"], ["⚑", "Flag"]]]
] as const;

export const HUGERTE_COMPATIBILITY_CONTENT_STYLE = [
  "body{font-family:var(--font-text,'Inter','Noto Sans SC','Source Han Sans SC','Sarasa Gothic SC',sans-serif);font-size:16px;line-height:1.5;margin:12px;}",
  "table{border-collapse:collapse;}",
  "td,th{border:1px solid #999;padding:4px 8px;}",
  "th{font-weight:700;}",
  "ul.tox-checklist,ul.htmlv-checklist{list-style:none;list-style-type:none;margin:0;padding-left:0;}",
  "ul.tox-checklist li,ul.htmlv-checklist li{list-style:none;list-style-type:none;}",
  ".tox-checklist-item{position:relative;display:flex;align-items:flex-start;gap:.5em;min-height:1.5em;margin:0;padding:.1em 0;list-style:none;}",
  ".tox-checklist-item::before{content:'';display:inline-block;flex:0 0 auto;width:1em;height:1em;margin-top:.2em;border:1px solid #4c4c4c;border-radius:2px;background:#fff;box-sizing:border-box;cursor:pointer;}",
  ".tox-checklist-item[data-checked='true']::before{border-color:#4099ff;background:#4099ff;box-shadow:inset 0 0 0 2px #4099ff;}",
  ".tox-checklist-item[data-checked='true']{text-decoration:line-through;color:var(--text-muted,#666);}"
].join(" ");

export const HUGERTE_FONT_SIZE_FORMATS = "8pt 9pt 10pt 11pt 12pt 14pt 15pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt";

export const HUGERTE_FONT_FAMILY_FORMATS = [
  "Inter=Inter,'Noto Sans',sans-serif", "Noto Sans SC='Noto Sans SC','Source Han Sans SC',sans-serif", "思源黑体 SC='Source Han Sans SC','Noto Sans SC',sans-serif", "更纱黑体 SC='Sarasa Gothic SC','Noto Sans SC',sans-serif", "Noto Serif SC='Noto Serif SC','Source Han Serif SC',serif", "思源宋体 SC='Source Han Serif SC','Noto Serif SC',serif", "等距更纱黑体 SC='Sarasa Mono SC','Noto Sans Mono CJK SC',monospace", "Noto Sans Mono='Noto Sans Mono','Noto Sans Mono CJK SC','Sarasa Mono SC',monospace", "JetBrains Mono='JetBrains Mono','Fira Code',monospace", "Fira Code='Fira Code','JetBrains Mono',monospace", "霞鹜文楷等宽='LXGW WenKai Mono','Sarasa Mono SC',monospace"
].join("; ");

/** 中文：与参考 HugeRTE 编辑路径一致的原生插件集合。 */
export const HUGERTE_COMPATIBILITY_PLUGINS = "advlist autolink lists link image media table code fullscreen checklist charmap";

/** 中文：不含 Obsidian 宿主专用剪贴板按钮的兼容工具栏。 */
export const HUGERTE_COMPATIBILITY_TOOLBAR = "undo redo | htmlvCut htmlvCopy htmlvPaste htmlvPasteText htmlvSelectAll | blocks fontfamily fontsize | bold italic underline strikethrough forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist checklist | outdent indent | link image media table | charmap | removeformat code fullscreen";

/** 中文：返回与参考编辑器默认启用组等价的 HugeRTE charmap 配置。 */
export function buildDefaultCharacterMap(): [number, string][] {
  const characterMap: [number, string][] = [];
  for (const [groupName, entries] of DEFAULT_CHARACTER_GROUPS) {
    for (const [character, name] of entries) {
      const codePoint = character.codePointAt(0);
      if (codePoint) characterMap.push([codePoint, `${groupName}: ${name}`]);
    }
  }
  for (const entry of VAULT_CUSTOM_CHARACTER_MAP) {
    const codePoint = entry.char.codePointAt(0);
    if (codePoint && entry.name.trim()) characterMap.push([codePoint, entry.name.trim()]);
  }
  return characterMap;
}
