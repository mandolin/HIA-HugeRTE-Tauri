# HIA HugeRTE Tauri

HIA HugeRTE Tauri is a Windows desktop HTML editor built around HugeRTE and packaged with Tauri.

The current workspace release line (`v0.2.x`) provides a focused local-document workflow:

- Create, open and save UTF-8 `.htm` / `.html` documents; edit them with HugeRTE.
- Edit multiple documents at once: every opened file gets its own tab, with dirty markers, close confirmation for modified tabs and an overflow menu (up to 20 tabs per window).
- Browse the opened document's directory in a read-only explorer sidebar: a Windows-Explorer-style breadcrumb (clickable segments, sibling-folder dropdowns, Up button), mouse-wheel horizontal scrolling for long paths, a drag-to-resize separator (arrow keys work too) and a show/hide toggle next to the toolbar.
- Reopen recent files from the **History** menu, with a no-record mode and a clear-history confirmation; records are stored portable-first next to the executable (`data/recent-files.json`) and never touch the registry.
- Accept file paths supplied by Windows Explorer or **Open with**, or dropped onto the application window; the portable build does not silently modify Windows associations.
- Ship as a portable ZIP: extract it to a directory and run the executable without a traditional installer.

The current alpha supports UTF-8 `.htm` and `.html` documents only. It is not a browser sandbox and does not promise safe execution of arbitrary document scripts or preservation of legacy encodings.

## Intended platform

The first cycle targets Windows 10/11 x64 and uses the system WebView2 runtime required by Tauri on Windows. Development versions are pinned in `package-lock.json` and `src-tauri/Cargo.lock`.

## Release status

`v0.1.0` was the completed `W-hrt-P1` baseline; `v0.2.0` added the multi-tab workspace, the read-only explorer sidebar and recent-file history (see [CHANGELOG](CHANGELOG.md) for the full release line). Every release carries automated build/test evidence, portable-archive smoke evidence and a recorded Windows regression baseline. The portable build deliberately does not install or silently change Windows file associations: use **Open with** to select the extracted executable. See [docs](docs/README.md) for public-facing project information, including the graded application boundary.

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
