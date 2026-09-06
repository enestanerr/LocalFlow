# Changelog

## 0.1.0 — 2026-09-07

First public release of LocalFlow.

### Features

- Browser-local PNG, JPEG, and WebP processing with six configurable step types.
- Ordered resize, crop, rotate, and flip operations; conversion, quality, and rename controls at export.
- Actual encoded preview, sequential batch processing, cancellation, individual downloads, and ZIP export.
- Versioned recipe import/export, URL sharing, local persistence, three presets, and generated sample images.
- Input limits, animation rejection, filename collision handling, and per-file error isolation.

### Release hardening

- Prevented imported recipe IDs from colliding with newly added steps.
- Stopped unnecessary decode/canvas work when cancellation occurs during inspection or decoding.
- Added cross-platform CI, contribution templates, security reporting guidance, and reproducible recipe examples.

### Known limitations

- Animated formats and offline page reload are not supported.
- Browser-specific EXIF orientation, color management, interface behavior, and accessibility still require browser validation.
- Source metadata is not copied during encoding; this is not a forensic sanitization guarantee.
