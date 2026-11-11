# Output compatibility contract

This page describes the public contract for the HTML output produced by HIA HugeRTE's editor, so integrators and downstream tooling know what to rely on and what not to.

## What is contracted

The editor is built on [HugeRTE](https://hugerte.org/) with a pinned configuration. The following behaviours are fixed by that configuration and guarded by automated tests (the contract strings live in `src/editor/hugerte-compatibility-config.ts` and are asserted in `src/editor/hugerte-compatibility.test.ts`):

- **Checklist behaviour**: checklist list items follow the reference configuration's rendering and toggling semantics; dynamic checklist IDs are the only generated identifiers.
- **Special characters**: the character set exposed by the special-character picker is pinned by the configuration.
- **Fonts and sizes**: the font family and size options offered by the editor are the pinned sets.
- **Toolbar composition**: the toolbar layout (alignment of undo/redo, clipboard, block format, font selection and the overflow toggle) follows the pinned reference configuration.

## Normalization rules

Editor output passes through a narrow normalizer (`src/editor/html-output-normalizer.ts`, guarded by `html-output-normalizer.test.ts`) with two guarantees:

1. Only known dynamic checklist identifiers are rewritten; no other user markup is touched.
2. Normalization never rewrites ordinary document content — it is scoped to the checklist contract above.

## What is not promised

- No lossless round-trip is guaranteed for HTML features outside the contracts above; editor output follows HugeRTE behaviour where the contract is silent.
- Documents are supported as UTF-8 `.htm` / `.html` only; legacy encodings are not detected or converted.
- Inline preview of local resources follows the scoped resolution described in [application-boundary.md](application-boundary.md); references are stored verbatim (relative paths are preserved on save, per the `convert_urls: false` configuration).

## Versioning of this contract

Contract changes accompany a release entry in [CHANGELOG.md](CHANGELOG.md). Behaviour pinned here is verified by the test suite on every change (`npm run check`).
