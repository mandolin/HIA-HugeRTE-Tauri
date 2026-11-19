# Promo assets

Screenshots and demo animations used in announcements about HIA HugeRTE.

Everything here is **generated**, not hand-captured: `scripts/promo-shots.mjs` drives the real
portable executable through a fixed scenario and writes these files. Re-running it against the same
build produces the same scene sequence.

| File | Content |
| --- | --- |
| `screenshots/01-main-light.png` … `08-edit-and-save.png` | Chinese interface, 1440×900 at 2× (2880×1800) |
| `screenshots/en/01-main-light.png` … `08-edit-and-save.png` | English interface, same scenes |
| `demo.gif` | Chinese demo, 63 frames, 12.6 s, 1000×667 |
| `demo-en.gif` | English demo, same scenario |

## Scenes

1. `01-main-light` — main window, light theme, several documents open
2. `02-dark-theme` — dark theme; shell and editor chrome follow, document body does not
3. `03-source-split` — source side by side with synchronized scrolling
4. `04-outline` — document outline
5. `05-search` — cross-document search with per-file groups and line numbers
6. `06-settings` — Settings panel
7. `07-tabs-pinned` — pinned tab and a display alias
8. `08-edit-and-save` — edit then save; the document head and its own styles survive

## Regenerating

```powershell
npm run promo:shots
```

Requires Node.js 22 or newer (the script uses the built-in `WebSocket` to drive the app's WebView2
debug port) and a portable build under `output/` (`npm run portable:zip`). Options:

| Flag | Meaning |
| --- | --- |
| `--lang zh\|en\|both` | Which asset set to produce (default `both`) |
| `--exe <path>` | Drive a specific executable instead of the newest under `output/` |
| `--port <n>` | Debug port (default 9350) |
| `--verify-against <dir>` | Compare this run's screenshots with a previous set and assert they match structurally |
| `--keep-open` | Leave the app running afterwards, for manual comparison |

The scenario documents are constructed samples written to `C:\Users\Public\HIA-HugeRTE-demo\docs` —
a neutral short path, chosen deliberately: the file-tree breadcrumb renders the document's absolute
path, so generating under the repo or a user profile would leak this machine's directory layout into
the public frames. No personal document is used. The generator copies the executable into the repo's
git-ignored `temp/` so the portable `data/` folder never lands in `output/`.

## Using these assets

The project is MIT licensed; the screenshots are free to use when writing about HIA HugeRTE. Please
do not present them as screenshots of a different application, and do not crop them in a way that
suggests capabilities the project does not have (see `docs/application-boundary.md`).
