# HIA HugeRTE Tauri

HIA HugeRTE Tauri is a Windows desktop HTML editor built around HugeRTE and packaged with Tauri.

`v0.1.0` provides a focused local-document workflow:

- Create, open and save HTML/HTM documents.
- Open `.htm` and `.html` files passed from Windows Explorer or dropped onto the application window.
- Accept file paths supplied by Windows Explorer or **Open with**; the portable build does not silently modify Windows associations.
- Ship as a portable ZIP: extract it to a directory and run the executable without a traditional installer.

The current alpha supports UTF-8 `.htm` and `.html` documents only. It is not a browser sandbox and does not promise safe execution of arbitrary document scripts or preservation of legacy encodings.

## Intended platform

The first cycle targets Windows 10/11 x64 and uses the system WebView2 runtime required by Tauri on Windows. Development versions are pinned in `package-lock.json` and `src-tauri/Cargo.lock`.

## Release status

`v0.1.0` is the completed `W-hrt-P1` baseline. It has automated build/test evidence, portable-archive smoke evidence, and an accepted Windows release workflow. The portable build deliberately does not install or silently change Windows file associations: use **Open with** to select the extracted executable. See [docs](docs/README.md) for public-facing project information.

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
