# Third-party notices

The `v0.1.0` portable release contains the following direct runtime components. Exact resolved dependency graphs and integrity information are locked in `package-lock.json` and `src-tauri/Cargo.lock`.

| Component | Resolved version | License | Source / role |
| --- | --- | --- | --- |
| HugeRTE | 1.0.12 | MIT | Local HTML editor bundle from npm; includes the selected theme, icons and plugins. |
| Tauri Rust runtime | 2.11.5 | MIT OR Apache-2.0 | Native desktop host compiled into the Windows executable. |
| Tauri JavaScript API | 2.11.1 | MIT OR Apache-2.0 | Local frontend bridge package. |
| Tauri Dialog plugin | 2.7.2 | MIT OR Apache-2.0 | Native open/save dialog integration. |

Microsoft Edge WebView2 Runtime is not included in the portable ZIP; it is a system dependency. The portable package includes no third-party fonts, images or copied reference-project assets.

The project source is distributed under the MIT License; see [LICENSE](LICENSE). This notice records direct runtime components of the portable release. Future releases must reconcile bundled transitive components and required notice text against their final artifacts.
