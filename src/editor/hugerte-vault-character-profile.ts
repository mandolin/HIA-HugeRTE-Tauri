export interface CharacterMapEntry {
  char: string;
  name: string;
}

/** 中文：从维护者指定 Vault 的 html-v-editor 设置迁入的自定义特殊字符。 */
export const VAULT_CUSTOM_CHARACTER_MAP: readonly CharacterMapEntry[] = `
⬜|White Large Square
✅|Check Mark Button
❗|Exclamation Mark
🟥|Red Square
🟦|Blue Square
🟨|Yellow Square
✔|Check Mark
❓|Question Mark
💡|Light Bulb
⚓|Anchor
㊙|Japanese Secret Button
✏|Pencil
🔗|Link
🟧|Orange Square
🟩|Green Square
🟪|Purple Square
🟫|Brown Square
🟢|Green Circle
🟣|Purple Circle
🟤|Brown Circle
🟠|Orange Circle
🟡|Yellow Circle
🔴|Red Circle
🔵|Blue Circle
🔲|Black Square Button
🔳|White Square Button
🔶|Large Orange Diamond
🔷|Large Blue Diamond
🔸|Small Orange Diamond
🔹|Small Blue Diamond
🔺|Red Triangle Pointed Up
🔻|Red Triangle Pointed Down
🔼|Up Button
🔽|Down Button
💙|Blue Heart
💚|Green Heart
💛|Yellow Heart
💜|Purple Heart
🤍|White Heart
🤎|Brown Heart
🧡|Orange Heart
🩵|Light Blue Heart
🩶|Grey Heart
🩷|Pink Heart
💟|Heart Decoration
❎|Cross Mark Button
💻|Laptop
💽|Computer Disk
💾|Floppy Disk
📋|Clipboard
💿|Optical Disk
📀|DVD
📁|File Folder
📂|Open File Folder
📃|Page With Curl
📄|Page Facing Up
📑|Bookmark Tabs
📜|Scroll
📅|Calendar
📆|Tear Off Calendar
📈|Chart Increasing
📉|Chart Decreasing
📊|Bar Chart
📌|Pushpin
📍|Round Pushpin
📒|Ledger
📓|Notebook
📔|Notebook With Decorative Cover
📖|Open Book
📚|Books
📕|Closed Book
📗|Green Book
📘|Blue Book
📙|Orange Book`
  .trim()
  .split("\n")
  .map((line) => {
    const [char, name] = line.split("|", 2);
    return { char: char ?? "", name: name ?? "" };
  });
