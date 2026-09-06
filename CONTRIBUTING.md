# Contributing to LocalFlow

Small, focused improvements are welcome. LocalFlow is a browser image tool: keeping files on the user's device and keeping workflows predictable are core requirements.

## Development

1. Fork and clone the repository.
2. Use Node.js 22.13+ and run `npm ci`.
3. Run `npm run dev -- --port 4318` and open `http://localhost:4318`.
4. Create a branch for one focused change.
5. Run `npm run check` before opening a pull request.

Use `npm run format` to format source files. Follow the existing TypeScript, React, and CSS conventions. Keep dependency changes separate unless required by the fix.

## Changes worth discussing first

Open a feature request before introducing a new file format, backend service, large dependency, or a change to the recipe schema. Describe a concrete workflow and why the current controls cannot achieve it.

## Pull requests

- Explain the user-visible problem, the resulting behavior, and how you checked it.
- For image-processing fixes, add a regression test with a small generated fixture. Assert actual dimensions, pixels, or output bytes where relevant.
- Keep imported recipes backward compatible within version 1. Reject invalid input before processing.
- For interface changes, describe the browser, viewport, and keyboard checks you actually performed. Do not label a build as a browser test.
- Never include personal images, credentials, local hosting bindings, or generated build directories.

Use conventional commit subjects, such as `fix: preserve unique workflow step IDs` or `docs: clarify JPEG transparency`.

## Reporting bugs

Use the bug report template. Include your browser/version, the recipe JSON, expected output, actual output, and reproducible steps. Reproduce the problem with a generated or nonsensitive image when possible. All issue attachments are public.

Report security vulnerabilities using [SECURITY.md](SECURITY.md), rather than a public issue.

## Community expectations

Be respectful and specific. Critique the work, avoid personal attacks, and do not post another person's private information. Maintainers may remove abusive or irrelevant material.

Contributions are distributed under the project's [MIT license](LICENSE).
