# Documentation

This directory contains public documentation for users and contributors.

Current documents:

- [Application boundary](application-boundary.md): current release scope, platform target, safety boundary and the graded (A/B/C) boundary table.
- [Output compatibility contract](output-compatibility.md): what the editor's HTML output guarantees (checklist, special characters, fonts/sizes, normalization) and what it does not.
- [Versioning and release](versioning.md): version numbers, CHANGELOG discipline and release gates (Chinese).
- [Portable user guide](../packaging/portable/README.md): extraction, WebView2, tabs, explorer sidebar, history, open and save instructions (Chinese).
- [Contributing guide](../CONTRIBUTING.md): environment, quality gates and submission conventions (Chinese).
- [CHANGELOG](../CHANGELOG.md): user-visible changes per release (English).

The `v0.4.0` line is the current workspace release: multi-tab editing, a read-only explorer sidebar with breadcrumb navigation, recent-file history, a Settings panel with authorized "Open with" registration and version info, an application menu bar with an icon toolbar, an About dialog, and in-editor find-and-replace with a character/word count. It remains a manual-association portable application: Windows **Open with** may point to the extracted executable, but the application does not silently register or take over file associations.
