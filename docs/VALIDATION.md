# Validation scope

LocalFlow's automated tests exercise actual PNG, JPEG, and WebP bytes with a native Canvas adapter under Node.js. They check output dimensions, pixels, encoding signatures, ZIP entries, schema validation, filenames, cancellation, and resource release.

Run the same checks used by CI:

```sh
npm ci
npm run check
```

The CI workflow runs type checking, lint, tests, and a static build on Ubuntu and Windows with Node.js 22. Its current status is shown by the repository's Actions badge.

## Automated coverage

- Geometry order, crop anchors, all quarter-turn rotations, both flips, aspect ratio, and upscaling limits.
- JPEG alpha background, PNG transparency, actual encoding formats, encoder fallback and failure handling.
- Invalid, oversized, MIME-less, and animated inputs.
- Cancellation before and during reads, decoding, and encoding; decoded-image and canvas cleanup.
- Unicode recipe sharing, invalid schema rejection, imported step-ID collisions, portable filenames, and duplicate ZIP entries.
- Source EXIF marker omission in newly encoded JPEG output. This test is not a complete metadata-forensics assessment.

## Browser validation

Real-browser interaction, screenshot, responsiveness, accessibility, and offline-network tests have not yet been completed for 0.1.0. Build and native Canvas results must not be presented as evidence of browser compatibility.

Before declaring broad browser support, check:

- File chooser/drop, samples, step editing/reordering, previews, cancellation, and individual/ZIP downloads.
- Recipe save/import/export/share, disabled storage, Unicode fragments, and links received while processing.
- Keyboard navigation, visible focus, dialog dismissal, screen-reader labels, 320–1440 px layouts, and 200% zoom.
- EXIF orientations 1–8, alpha edges, large-image memory behavior, and browser encoder/color differences.
- No image upload requests and continued processing after disconnecting a fully loaded application.

Record the exact browser version and observed result when contributing a compatibility report. Current Chrome/Edge, Firefox, and Safari are validation targets, not a claimed tested-support matrix.
