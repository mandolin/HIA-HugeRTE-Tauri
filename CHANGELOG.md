# Changelog

All notable public changes will be documented in this file.

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
