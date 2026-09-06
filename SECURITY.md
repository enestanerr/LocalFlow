# Security policy

## Supported versions

Security fixes are developed against the latest `main` branch. Tagged 0.x releases are early releases; there is no separate long-term support branch.

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/enestanerr/LocalFlow/security/advisories/new) for security findings. Include reproduction steps, affected versions, the expected impact, and a minimal nonsensitive test file when needed.

If private reporting is unavailable, contact [@enestanerr](https://github.com/enestanerr) to arrange a private channel. Do not publish exploit details, credentials, or personal images in an issue.

There is no guaranteed response time or bug bounty program. Fixes will be documented in the changelog when available.

## Scope and trust boundaries

- LocalFlow processes images in the browser. It does not include an image upload endpoint, analytics, or a remote image-processing service.
- Imported recipe JSON is untrusted input and is validated before use. Share links include recipe settings and custom filename text, but no images.
- Output filenames are flattened, bounded, and deduplicated before ZIP creation.
- Input limits reduce memory pressure; they are not a guarantee against every browser memory failure.
- Browser codecs and third-party dependencies are part of the processing chain. Native Canvas tests cannot establish identical behavior in every browser.
- Re-encoding omits source metadata, but LocalFlow is not a forensic metadata sanitization guarantee.

Image data is not stored in local storage. Recipes are stored there when storage is available. Closing the page releases application references to the files; this does not claim secure erasure from device memory.
