# Source publication and qualification

The source destination is https://github.com/CanonFlow-Assay/JavaScriptAssay.
The Apache-2.0 licence and development version 0.1.0-preview.1 are retained.
`private: true` deliberately prevents npm publication; GitHub source publication
is separate from an npm release.

## Use the source or a local archive

```sh
git clone https://github.com/CanonFlow-Assay/JavaScriptAssay.git
cd JavaScriptAssay
npm ci --ignore-scripts --no-audit --no-fund
node src/cli.js doctor playground/reservation
npm test
npm run test:lifecycle
npm run playground
```

`npm run lifecycle` on pinned Node 20.20.2/npm 10.8.2 packs and installs the real
local archive into an independent consumer. It checks archive members and exact
installed dependency/compiler bytes. It does not depend on this package being
on the public npm registry. See [the lifecycle guide](application-lifecycle.md).

## CI

The read-only GitHub Actions workflow tests the recorded Node 20.20.2 and
24.21.0 Linux lanes, runs the reservation mutation playground in each, and runs
the exact pinned lifecycle consumer on Node 20/npm 10.8.2. Action versions are
pinned by commit. The workflow retains generated evidence on failure as well as
success, and failed commands remain failed CI steps. No workflow publishes a
package, writes PR comments, changes source or grants release authority.

Each archived lifecycle `qualification.json` identifies its actual producer
commit/tree, runtime, npm version, package digest and consumer. Original baseline,
failing acceptance and repaired receipts remain separate. Source squash aliases
can share a tree while having different commit identities; never relabel an old
receipt as an execution on a later commit. Inspect the workflow run for the exact
published SHA rather than treating a badge or ReadyForReview label as approval.

Generated local evidence stays under ignored `artifacts/`. Prior local source
history is preserved when creating the single initial GitHub source commit.
No raw evidence, dependencies, credentials or private host configuration are
part of that source commit.
