# Application boundary

## Current release scope

The `v0.2.x` workspace release line is a Windows local HTML editor built around HugeRTE and Tauri. It creates new documents, opens existing `.htm` or `.html` files, edits them in multiple tabs within one window, and saves the result. It also accepts document paths from Windows Explorer, from drag-drop, and from recent-file history. The release target is an extractable ZIP containing a runnable application directory. In Windows **Open with**, browse to the extracted executable; Windows passes the selected document path to the application. The portable application does not silently register file associations or change the default handler.

## Safety boundary

Opening a document does not imply that its scripts, network requests, embedded frames or local-file references are trusted. The application distinguishes the editor shell from document content: document resources are resolved through scoped, read-only native commands (see the graded boundary table), the filesystem stays behind explicit native commands, and no document content ever gains arbitrary filesystem or network permissions. Any change to this boundary is a major change requiring an architecture decision record and a prominent CHANGELOG note.

## Boundary grading

Boundaries are graded rather than listed as permanent exclusions: **A (hard boundary)** conflicts with the project's positioning, security or compliance baseline and is excluded; **B (deferred)** is not implemented now but is scheduled for re-evaluation with documented restart conditions; **C (extension candidate)** is out of the product's body but may live in a future independent extension.

| Grade | Boundary | Notes / restart conditions |
| --- | --- | --- |
| **A** | Document content never gains arbitrary filesystem or network permissions; scripts in opened documents are never auto-executed as trusted code. | Enforced by scoped, read-only resolution commands and path canonicalization (document directory parent scope for content references). |
| **A** | No silent file-association takeover; the registry is never written by the portable build. | Explicit, user-initiated association registration is **not** itself excluded — it is graded B below; what is excluded is doing it silently or without user control. |
| **A** | No automatic document execution, arbitrary shell execution or remote-content download. | Core trust model. |
| **B** | File-association registration (authorized, user-initiated, reversible) | **Implemented (ADR-0001 2026-11-12 revision; UI confirmed 2026-11-13):** the Settings panel registers the app as a per-user candidate in the system "Open with" list — explicit, one-click removable, never setting the default; `UserChoice` is never read for writing nor modified (verified by a registry before/after regression). |
| **B** | Automatic update channel | **Implemented in its zero-network form (ADR-0001 revision item 2; maintainer decision 2026-11-13):** the Settings panel shows the current version and opens the download page in the system browser. The app never requests the network, never downloads, and never replaces itself; no HTTP capability was added. |
| **B** | Traditional installer packaging | Restart condition: distribution research (the portable ZIP remains the primary form). |
| **B** | Legacy (non-UTF-8) encoding support | Deferred; UTF-8-only is a stated limitation of the alpha. |
| **B** | Multi-platform release | Windows x64 is the target; other platforms are not planned for the current horizon. |
| **B** | Explorer management operations (rename/new/delete) | Deferred per the explorer ADR; requires a scoped write-authorization design and explicit maintainer confirmation. |
| **B** | Session restore (reopening the last tab set) | Deferred per the tabbed-documents ADR; restart condition: privacy design consistent with the recent-files record. |
| **C** | Cloud synchronization, accounts and collaboration | Out of the local portable editor's body; candidate for a future independent extension. |
| **C** | Multi-instance editing of large documents (one iframe per tab) | Deferred alternative per the tabbed-documents ADR; re-evaluate only if large-document concurrent editing demand appears. |

## Compatibility commitments

- Only UTF-8-encoded `.htm` / `.html` documents are supported; legacy encodings are neither detected nor converted.
- No lossless round-trip is promised for HTML features outside the tested HugeRTE editing contract; editor output follows HugeRTE behaviour and the registered compatibility configuration.
