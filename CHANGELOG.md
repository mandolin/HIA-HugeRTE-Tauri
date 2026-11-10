# Changelog

All notable public changes will be documented in this file.

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
