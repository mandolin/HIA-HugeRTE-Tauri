# Contract freeze (1.0.0)

This page records the contracts HIA HugeRTE freezes for its `1.0.0` line: what integrators, scripts and downstream tooling may rely on, and what is explicitly not promised. The scope follows the project decision that "1.0" means **feature-complete and contract-stable at the same time**.

Each contract lists its guarantee, the automated evidence guarding it, and the change policy. Anything not listed here is not a contract.

## 1. Document format

**Guaranteed**

- Documents are UTF-8 encoded HTML with the `.htm` or `.html` extension (case-insensitive). Files without a supported extension are rejected rather than guessed.
- Opening a complete HTML document and saving it — **even with no edits** — preserves the document's full structure: the doctype, `<head>` (including `<meta charset>` and `<title>`), the `<body …>` open tag with its attributes, and everything after `</body>` (typically `</body></html>`).
- The editor surface carries the document **body** only; document-level head content is preserved separately and reassembled on save. Editing the head/doctype is possible through the source views.
- Tabs may carry a display alias; the alias is **never** written into the file or used as a file name.

**Not guaranteed**

- Byte-for-byte preservation of formatting whitespace, attribute ordering, or attribute quoting. Content is re-serialized by the editor.
- Legacy encodings (GBK/GB18030/UTF-16) and non-HTML document types.
- Execution of scripts inside documents (the editor is not a browser sandbox).

**Evidence**: `src/document.test.ts` (whole-document split/reassembly invariants), `src/tabs.test.ts` (alias normalization never touches paths).

## 2. Keyboard shortcuts

**Guaranteed** — the following shortcuts keep their meaning for the whole `1.0.x` line:

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New tab (untitled document) |
| `Ctrl+O` | Open an HTML file |
| `Ctrl+S` | Save the active document |
| `Ctrl+F` | Find and replace inside the editor |
| `Esc` | Close the open modal, dropdown or inline editor (the safe, non-committing default) |

**Policy**: adding shortcuts is allowed in a minor release when it does not conflict with the table above; **changing or removing** an entry requires a major version and a CHANGELOG note.

**Evidence**: menu definitions in `src/main.ts` (shortcut strings) and the Windows regression suite.

## 3. Output contract

The editor's HTML output contract is documented in [output compatibility](output-compatibility.md) and remains in force: checklist semantics, the pinned character set, the pinned font/size sets and the normalized comparison rules. The dynamic-identifier normalization is a *comparison* tool only; it never rewrites user documents.

**Evidence**: `src/editor/hugerte-compatibility.test.ts`, `src/editor/html-output-normalizer.test.ts`.

## 4. On-disk data files

All application data lives beside the executable when that directory is writable, and otherwise under `%APPDATA%\HIA-HugeRTE\`. Nothing is uploaded and no network capability exists.

| File | Content | Written by |
| --- | --- | --- |
| `data/recent-files.json` | Recent-file list: path + last-opened timestamp (max 50, newest first) | Every successful open |
| `data/session.json` | Restorable tab group: path, pinned flag, alias, active index (max 20) | Tab-structure changes |
| `data/autosave/drafts.json` + `data/autosave/draft-<n>.html` | Unsaved-draft index and bodies (max 20) | Debounced edits (1 s) |

**Guaranteed**: the file names, locations and top-level shapes above. Unknown fields in these files are ignored when reading (forward compatibility); corrupt or missing files degrade to empty state instead of failing startup.

**Not guaranteed**: internal field ordering, or that a future minor release adds no new optional fields.

**Security boundary**: the draft id is the only path-adjacent value the frontend may supply, and it must match `draft-<digits>`; the native layer builds every path itself. Drafts and sessions are plaintext on the local machine, at the same privacy level as the recent-files list.

**Evidence**: `src-tauri/src/lib.rs` tests (`草稿_id_白名单拒绝路径穿越`, `会话保存截断到上限且活动索引夹取`, `会话与草稿结构可往返序列化`), `src/session.test.ts`.

## 5. Interface state persistence

Interface preferences persist in the WebView profile (`localStorage`) under these keys. They are a compatibility promise for `1.0.x`: a key is never silently repurposed, and renaming requires a migration note.

| Key | Meaning |
| --- | --- |
| `hia-hugerte.ui-font-scale` | Interface font scale (shell only) |
| `hia-hugerte.editor-font-size` | Editor body font size |
| `hia-hugerte.explorer-hidden` | Explorer visibility |
| `hia-hugerte.explorer-width` | Explorer width (px) |
| `hia-hugerte.sidebar-mode` | Sidebar view (`files` / `outline` / `search`) |
| `hia-hugerte.source-view` | Source view form (`modal` / `split` / `full`) |
| `hia-hugerte.source-width` | Source pane width (px) |
| `hia-hugerte.source-sync-scroll` | Source split sync-scroll toggle |
| `hia-hugerte.menubar-mode` | Menu bar mode (`full` / `compact` / `hidden`) |
| `hia-hugerte.history-disabled` | Recent-files no-record mode |
| `hia-hugerte.session-restore` | Session restore toggle |
| `hia-hugerte.autosave` | Autosave-drafts toggle |
| `hia-hugerte.language` | Interface language (`zh-Hans` default / `en`) |
| `hia-hugerte.theme` | Colour theme (`system` default, or one of the built-in theme ids) |
| `hia-hugerte.font-stack` | Font stack (`system` default / `hia`) |

**Evidence**: the read/write sites are centralised in `src/main.ts` and `src/ui/themes.ts`; the constants are asserted by the browser structure probe described in the release evidence and by `src/contract-freeze.test.ts`.

## 6. Not contracted

Explicitly outside the freeze: visual styling details (colours, spacing, icon shapes), the internal module layout, the exact wording of status messages, and anything the source views expose beyond the document-format guarantee in §1.
