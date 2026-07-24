# Application boundary

## v0.1.0 release scope

The first release will be a Windows local HTML editor. It will create a new document, open an existing `.htm` or `.html` file, edit it using HugeRTE, and save the result. It will also accept document paths from Windows Explorer and document files dropped into its window.

The release target is an extractable ZIP containing a runnable application directory. In Windows **Open with**, browse to the extracted executable; Windows passes the selected document path to the application. The portable application does not silently register file associations or change the default handler.

## Safety boundary

Opening a document does not imply that its scripts, network requests, embedded frames or local-file references are trusted. The application will distinguish the editor shell from document preview behavior, keep filesystem access behind explicit native commands, and document any supported preview mode and its limitations.

## Out of scope for the first release

- Cloud synchronization, accounts and collaboration.
- Automatic document execution, arbitrary shell execution or remote-content download.
- A traditional installer, auto-update channel, file-type ownership takeover, or multi-platform release.
- Full fidelity guarantees for every HTML feature outside the tested HugeRTE editing contract.
