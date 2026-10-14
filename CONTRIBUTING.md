# Contributing to owlsh

Thanks for your interest in improving owlsh. A few things to know before you open a pull request.

## License and the CLA

owlsh is released under the **AGPL-3.0** license. The project is also offered under
separate **commercial licenses** (see the README), which means the maintainer needs
to keep the right to license contributed code under terms other than the AGPL.

So that this stays possible, every contributor must agree to the
**[Contributor License Agreement](CLA.md)** before their contribution can be merged.
The CLA does **not** take away your rights — you keep full ownership of and the right
to use your own work. It simply grants the maintainer a broad enough license to
include your contribution in both the open-source and commercially-licensed versions
of owlsh.

**How to sign:** in your first pull request, add a comment stating:

> I have read the CLA document and I hereby sign the CLA.

(We may later automate this with a CLA-assistant bot.)

## Making a change

1. Open an issue first for anything beyond a small fix, so we can agree on the approach.
2. Match the existing code style; keep changes focused and well-tested.
3. Run the checks before pushing:
   - `npm run typecheck`
   - `npm test`
   - `cargo test` (from `src-tauri/`) for Rust changes
4. Write a clear commit message describing the *why*, not just the *what*.

## Reporting security issues

Please do **not** open a public issue for a security vulnerability. Contact the
maintainer privately via [owlsh.com](https://owlsh.com) so it can be addressed before
disclosure.
