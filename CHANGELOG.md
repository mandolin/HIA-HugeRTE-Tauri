# Changelog

All notable public changes will be documented in this file.

## v1.2.0 - 2026-11-19

Adds interface internationalisation and a full colour-theme system.

- Added **runtime Chinese / English switching** (Settings → Language). Every shell surface — menu bar, toolbar, tab strip, side panel, status bar, settings panel, dialogs and status messages — updates immediately. The editor's own toolbar is rebuilt in the chosen language while preserving the current document, caret position and scroll offset; no restart is needed.
- Added **18 built-in colour themes** (Settings → Theme): ten light (Light, GitHub Light, Solarized Light, One Light, Gruvbox Light, Catppuccin Latte, Rosé Pine Dawn, Quiet Light, Tokyo Night Day, Ayu Light) and eight dark (Dark · VS Code, GitHub Dark, Solarized Dark, Nord, Dracula, One Dark, Monokai and Dimmed), plus **Follow system**, which tracks the Windows light/dark setting and updates live when that setting changes.
- The theme applies consistently to the application shell and to the editor's own chrome — toolbar, overflow drawer, split-button dropdowns, format menus, context menu, dialogs, popovers, table grid picker, colour picker, form fields and their focus/disabled states — including icon glyphs, which follow the themed text colour.
- **The edited document is never themed.** Theme colours never reach the document's own styles or background; the editing area shows exactly the document's own HTML and CSS.
- Added a **font-stack choice** (Settings → Font): the OS default stack or the HIA open-source stack, applied to both the shell and the editor independently of the theme.
- Fixed the banner using the theme's accent colour instead of its dedicated banner colour, which made several light themes look unchanged after switching.

## v1.0.0 - 2026-11-18

The `1.0.0` line freezes the public contracts: document format, keyboard shortcuts, the editor output contract, on-disk data files and interface-state keys are documented in [docs/contract-freeze.md](docs/contract-freeze.md) and guarded by contract tests. From this line onward, changing a frozen contract requires a major version and a migration note.

- Added three switchable source-code views: **side-by-side** (visual left, source right, draggable separator, sync-scroll toggle), **full-area switch** and the existing modal dialog (Format → Source code). Line numbers in search results share the source view's coordinates.
- Added three sidebar views — files, **document outline** (hierarchy guides, collapsible, click-to-jump) and **cross-tab search** (grouped by file, source line numbers, highlighted matches, click-to-jump) — switched by a mode strip; the chosen view is remembered.
- Added three menu-bar modes: full, compact (folded into a "☰ Menu" grouped dropdown) and hidden; switchable from Settings and remembered.
- Added an integrated application status bar: save state, character/word count, cursor line-column and UTF-8 encoding (replacing HugeRTE's built-in status bar).
- Added **session restore**: file tabs (with pinned state and display aliases) reopen after a restart; startup arguments take priority.
- Added **tab pinning** (pinned tabs cannot be closed accidentally and stay visible when the strip overflows) and **display aliases** (double-click a tab name; the file is never renamed).
- Added **autosave drafts**: unsaved edits are written to the portable `data/autosave/` folder (1 s debounce) and offered back through a non-modal banner after a crash; saved documents clear their draft automatically.
- Fixed document fidelity: opening and saving a complete HTML file — even with zero edits — preserves the doctype, `<head>`, `<meta charset>` and `<title>` (previously the editor pipeline dropped document-level head content after the first edit).
- Fixed the tab strip leaving a stray blank "untitled" tab behind when files were opened through startup arguments or restored from a session.
- All IPC commands that may block (registry queries, disk writes) now run off the main thread; floating surfaces close on `Esc` consistently.

## v0.4.0 - 2026-11-16

- Added an application-level menu bar and toolbar (classic Windows shell layout): the banner keeps the brand and document summary with reserved space for future modules and only a Settings gear on the right; below it a menu bar (File / Edit / View / Insert / Format / Tools / Help) and a toolbar with icons (New / Open / Save / Save as / History | Tree).
- Menus behave like a native Windows menu bar: hovering an adjacent menu switches the open dropdown, Escape or an outside click closes it, and the first item receives focus when opened from the keyboard.
- Added an About dialog (Help → About HIA HugeRTE) showing the version, technical base, licence notes and the local-only privacy boundary.
- Split font sizing into two independent settings: **interface font size** (menu bar, toolbar, panels, status text) and **editor font size** (document text only). Changing the interface size no longer alters the edited document's text.
- Added in-editor find and replace plus a live character/word count in the status bar (bilingual Chinese display), built from HugeRTE's bundled plugins.
- Floating surfaces (History dropdown, Settings panel, breadcrumb dropdown, menus) now close when clicking anywhere outside them — including inside the editor area — while clicking the entry again still toggles them.
- Icons use Tabler Icons (MIT) inlined as SVG path data with no new dependency; see THIRD_PARTY_NOTICES.

## v0.3.0 - 2026-11-13

- Added a Settings panel (header "设置 ▾"): register the application into the Windows **Open with** list as a per-user candidate — explicit, reversible, never setting the default and never touching the system's protected default-selection keys; a helper button opens the Windows default-apps settings for users who want to pick a default themselves. The panel also shows the registered executable path and offers one-click removal.
- The Settings panel shows the current version and can open the download page in the system browser. The application performs no update check over the network, never downloads, and never replaces itself; no HTTP capability was added.
- Both actions are covered by a Windows regression that compares the registry before and after (candidate entries appear and are removed symmetrically; the protected default-selection key is never modified).

## v0.2.1-fix.1 - 2026-11-12

- Fixed the default context menu: the WebView2 menu (Back/Reload/Print/Save-as) no longer appears over the application shell (explorer tree, tabs, header); inside the editor the native menu is suppressed through HugeRTE's `contextmenu_never_use_native` option while HugeRTE's own context menu (links/images/tables) is preserved.
- Fixed breadcrumb address-bar wheel scrolling: on deep paths the sidebar grid column was blown out to the breadcrumb's content width (measured row=505px vs panel=260px), which silently disabled scrolling; the column is now pinned with `minmax(0, 1fr)`.
- Hidden the breadcrumb scrollbar; wheel scrolling and auto-positioning on the current segment are unchanged.

## v0.2.1 - 2026-11-11

Snapshot release carrying the post-`v0.2.0` explorer improvements (version designated by the maintainer; see `docs/versioning.md` for the `0.x` snapshot exception):

- Explorer sidebar navigation now matches Windows Explorer: a clickable breadcrumb address bar (jump to any path segment, sibling-folder dropdown per segment, Up button) replaces the fixed document-directory root; the tree, expansion state, selection and asset previews all work on absolute paths. Document-content references stay bound by the original document-directory scope (ADR-0003 revised).
- The address bar scrolls horizontally with the mouse wheel when overlong and auto-positions on the current segment after navigation.
- The sidebar is resizable: drag the separator between the sidebar and the editor, or focus the separator and use the arrow keys; the chosen width is remembered.
- Added a show/hide toggle for the explorer tree next to the toolbar; the choice is remembered across sessions while a document is open.

## v0.2.0 - 2026-11-10

- Added multi-tab editing: files from startup arguments, drag-drop or the Open dialog each open in their own tab within one window; the tab strip shows dirty markers, close buttons and an overflow menu; closing a modified tab asks via the in-app confirmation modal; a 20-tab cap guards memory.
- Added a read-only explorer sidebar: the current document's directory tree (scope = the document directory's parent, per ADR-0002/0003) with real expand/collapse buttons, asset preview and "insert relative reference" actions.
- Added recent-file history: a "History ▾" menu listing recently opened files, with a no-record mode, clearing behind the confirmation modal, and portable-first storage next to the executable (falling back to `%APPDATA%` when not writable) — the registry is never touched.
- Native side gained scoped, read-only `list_directory_tree` and recent-files commands with negative tests; `serde_json` is a new direct dependency (MIT, recorded in THIRD_PARTY_NOTICES).

## v0.1.0-fix.2 - 2026-11-10

- Fixed unsaved-changes confirmation: replaced the JavaScript `confirm` dialog (unavailable in release builds, which silently blocked New/Open actions on a modified document) with an in-app confirmation modal matching the confirmed prototype — Escape or Cancel keeps the document, and focus returns to the invoking control.
- Fixed the new-document template emitting an invalid backtick-quoted `charset` attribute.
- Aligned version metadata across `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and recorded the missing `v0.1.0-fix.1` entry above.

## v0.1.0-fix.1 - 2026-08-04

- Fixed local relative image display: relative `img` sources are inlined as data URIs in memory only, and restored to their original relative paths on save; source files on disk are never rewritten.
- Added scoped asset resolution on the native side (document directory parent scope, canonicalized path checks) with negative tests for path traversal.

## v0.1.0 - 2026-07-25

- Released the Windows x64 portable HugeRTE HTML editor baseline.
- Added new, open, save and save-as workflows for UTF-8 `.htm` and `.html` files.
- Added Explorer path arguments, Windows **Open with** guidance and window drag-drop handling.
- Aligned HugeRTE toolbar/configuration, checklist behavior and special-character profile with the scoped editor reference configuration.
- Added portable ZIP packaging, native GUI-subsystem release executable, notices and MIT licensing.
