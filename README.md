# HIA HugeRTE Tauri

HIA HugeRTE Tauri is a Windows desktop HTML editor built around HugeRTE and packaged with Tauri.

The current workspace release line (`v1.2.0`) provides a focused local-document workflow:

- Create, open and save UTF-8 `.htm` / `.html` documents; edit them with HugeRTE.
- Edit multiple documents at once: every opened file gets its own tab, with dirty markers, close confirmation for modified tabs and an overflow menu (up to 20 tabs per window).
- Edit the HTML source directly in three switchable views: side-by-side with the rendered document, full-area, or the classic dialog — with a frozen document-format contract (the doctype and `<head>` are preserved on save).
- Browse the opened document's directory in a read-only explorer sidebar with three switchable views (Files / Outline / Search; the chosen view is remembered): the files view shows a Windows-Explorer-style breadcrumb (clickable segments, sibling-folder dropdowns, Up button) with mouse-wheel horizontal scrolling for long paths; the outline view lists the document's h1–h6 hierarchy with indentation guides, collapsible sections and click-to-jump; the search view looks through all open tabs, groups matches by file with source line numbers and highlighted snippets, and clicking a result jumps to the text. A drag-to-resize separator (arrow keys work too) and a show/hide toggle next to the toolbar complete the sidebar.
- Reopen recent files from the **History** menu, with a no-record mode and a clear-history confirmation; records are stored portable-first next to the executable (`data/recent-files.json`) and never touch the registry.
- Rely on the frozen `1.0.0` contracts — document format, shortcuts, output, data files and state keys are documented in [docs/contract-freeze.md](docs/contract-freeze.md).
- Configure integration from the **Settings** panel: register the application into the Windows **Open with** list as a per-user candidate (explicit, one-click removable, never setting the default) and see the current version with a link to the download page — the app never checks for updates over the network and never updates itself.
- Accept file paths supplied by Windows Explorer or **Open with**, or dropped onto the application window; the portable build does not silently modify Windows associations.
- Restore your workspace after a restart: file tabs (with their pinned state and display aliases) reopen automatically, and unsaved work survives a crash — drafts are written to the portable `data/` folder and offered back on the next launch through a non-modal banner.
- Pin tabs so they cannot be closed by accident and stay visible when the strip overflows; give any tab a display alias (double-click its name) without renaming the file.
- Switch the interface between **Chinese and English** at runtime from the Settings panel: every shell label, menu, dialog and status message follows immediately, and the editor's own toolbar rebuilds in the chosen language without losing your content, caret or scroll position.
- Choose from **18 built-in colour themes** (9 light, 9 dark, including Solarized, Gruvbox, Catppuccin Latte, Rosé Pine Dawn, GitHub, One, Nord, Dracula, Tokyo Night and VS Code families) plus a **Follow system** option that tracks the Windows light/dark setting live. The theme applies to the application shell and the editor's toolbar, menus, dialogs and floating panels; the edited document keeps its own styles untouched.
- Pick a **system or HIA open-source font stack** for both the shell and the editor, independent of the theme.
- Ship as a portable ZIP: extract it to a directory and run the executable without a traditional installer.

The current alpha supports UTF-8 `.htm` and `.html` documents only. It is not a browser sandbox and does not promise safe execution of arbitrary document scripts or preservation of legacy encodings.

## Intended platform

The first cycle targets Windows 10/11 x64 and uses the system WebView2 runtime required by Tauri on Windows. Development versions are pinned in `package-lock.json` and `src-tauri/Cargo.lock`.

## Release status

`v0.1.0` was the completed `W-hrt-P1` baseline; `v0.2.0` added the multi-tab workspace, the read-only explorer sidebar and recent-file history; `v0.3.0` added the Settings panel with authorized "Open with" registration and the version/download-page info; `v0.4.0` added the application menu bar and icon toolbar, the About dialog, in-editor find-and-replace with a bilingual character/word count, and split interface vs editor font sizing; `v1.0.0` added source/sidebar/menu-bar view modes, the integrated status bar, session restore, tab pinning with display aliases, autosave drafts and the frozen contract set; `v1.2.0` added runtime Chinese/English switching, 18 colour themes with a follow-system option, and selectable font stacks (see [CHANGELOG](CHANGELOG.md) for the full release line). Every release carries automated build/test evidence, portable-archive smoke evidence and a recorded Windows regression baseline. The portable build deliberately does not install or silently change Windows file associations: use **Open with** to select the extracted executable. See [docs](docs/README.md) for public-facing project information, including the graded application boundary.

## Build and portable package

After installing the pinned Node.js dependencies and Rust toolchain:

```powershell
npm install
npm run check
npm run portable:zip
```

The ZIP is written under `output/` and is intentionally not versioned. Its included Chinese README describes extraction, WebView2 and **Open with** steps.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before making changes. Do not add application dependencies, distributable fonts, icons or code copied from reference projects without recording their source and license. Version and release rules are documented in [docs/versioning.md](docs/versioning.md).

## License

This project is licensed under the [MIT License](LICENSE). Direct runtime dependency notices are maintained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
