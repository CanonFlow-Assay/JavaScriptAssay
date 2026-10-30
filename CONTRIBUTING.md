# Contributing

Read [AGENTS.md](AGENTS.md), [the contract](docs/CONTRACT.md) and the scope of
the selected rule before editing. Keep syntax observations, executed tests,
receipt authority and optional advice separate. Preserve original named tests,
requirements, wire contracts and unresolved survivors. Do not weaken evidence
requirements to obtain Pass or label a syntax-invalid mutation as killed.

## Local checks

Node 24.21.0 is the recorded authoring runtime in `.node-version`. The existing
compatibility/lifecycle lane pins Node 20.20.2 and npm 10.8.2. Select that SDK on
PATH for the lifecycle command; it deliberately refuses other versions. These
are the tested Linux lanes, not qualification of every runtime allowed by the
package's `node >=20` range.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:lifecycle
npm run playground
```

From a clean committed checkout on the pinned Node 20/npm 10 lane:

```sh
npm run lifecycle -- "$PWD/artifacts/lifecycle-review-01"
```

Choose a fresh output directory. Preserve failures, command exits and prior
evidence. Read `qualification.json`, `commands.json`, raw test results and the
retained failing acceptance case. A source change needs new qualification; an
earlier run does not authorize revised source. Keep generated artifacts and
installed dependencies out of commits.

For the interactive lab, run `npm run playground:serve` and open
http://127.0.0.1:4317. The browser reads local evidence and exercises the domain;
it does not perform authoritative verification in the browser.

## Review

Describe the concrete behavior change, affected scope, exact commands and
observed outcomes. Call out unsupported inputs and remaining uncertainty. A
ReadyForReview projection requests review and is not release approval. Changes
to evidence meaning, dependencies, policy authority or publication require
explicit review. No live providers or automatic source repair belong in default
checks. The package remains private; do not run `npm publish`.
