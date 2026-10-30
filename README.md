# JavaScriptAssay

[![CI](https://github.com/CanonFlow-Assay/JavaScriptAssay/actions/workflows/ci.yml/badge.svg)](https://github.com/CanonFlow-Assay/JavaScriptAssay/actions/workflows/ci.yml)

A deterministic, evidence-bounded functional JavaScript policy prototype. Its six AST rules inspect **declared JavaScript files** using the pinned TypeScript 5.7.3 parser. It keeps four verdicts: Pass, Fail, Inconclusive and ToolFailure. A scoped Pass is not proof of semantic purity, deep immutability, test sufficiency, security or business correctness.

## First run

The authoring runtime is recorded in .node-version (Node 24.21.0); the CLI supports Node >=20. The initial npm install used the existing local npm cache with networking disabled.

```sh
npm ci --ignore-scripts
npm test
npm run playground
node src/cli.js doctor playground/reservation
node src/cli.js catalog
node src/cli.js scan playground/reservation
node src/cli.js verify playground/reservation --json artifacts/reservation.json --sarif artifacts/reservation.sarif
node src/cli.js assess playground/reservation --json artifacts/assessment.json
```

scan returns Inconclusive because it does not execute required commands. verify executes reviewed argument vectors without a shell and can grant Pass only after the declared scope, direct domain dependencies, JavaScript syntax and required command evidence complete without changes to observed inputs. Exit codes are 0 Pass, 1 Fail, 2 Inconclusive/ToolFailure. doctor makes no compliance claim; assess embeds the original receipt and supplies a review projection without changing its verdict.

## Runnable playground

The [reservation specimen](playground/reservation/requirements.json) implements immutable explicit outcomes, runtime input decoding and a pure domain. npm run playground executes its acceptance suite and **five real mutations in temporary copies**. The weak three-test selection misses the zero-quantity and exact-stock boundaries; the expanded suite kills both. A wrong-balance mutation is killed, a syntax-invalid mutation remains Invalid, and an integer-equivalent candidate remains an unresolved survivor. A deliberately failing original baseline is retained as a separate negative control.

Each invocation retains a new directory under ignored artifacts/. Read baseline.json, assessment.json and mutation-cases.json, including raw mutation test output, hashes, completion status and survivor list. Pass applies to the original specimen and configured commands. It does not approve a release or grant equivalence to a survivor. Offline deterministic advice can select only the registered zero-boundary investigation; it cannot execute commands, waive tests or change a verdict. No provider calls occur.

## Policy

.jsassay.json lists domainFiles, boundaryFiles, evidenceFiles and requiredCommands explicitly. Paths must stay within the target and symlinks cannot escape it. package.json and package-lock.json are bound automatically. Relative direct domain imports must name declared domain files; external/unobserved modules remain unassessed. List requirement and test files under evidenceFiles to bind the inputs your commands actually use. Commands are trusted vectors such as ["node", "--test", "tests/expanded.test.js"], not shell strings. Test execution is bounded to 30 seconds per command.

See the [contract](docs/CONTRACT.md) and [rule catalog](docs/rule-catalog.md). Source repository: [CanonFlow-Assay/JavaScriptAssay](https://github.com/CanonFlow-Assay/JavaScriptAssay). Licensed Apache-2.0. The development package remains `private: true`; use the checked-out CLI or a locally packed archive. No npm package release is implied by source publication.

For the interactive local browser lab, run `npm run playground:serve` and open http://127.0.0.1:4317. It exercises the actual domain and reads local evidence files; it does not run the checker in the browser.

An additional compatibility lane on Node 20.20.2/npm 10.8.2 passes all 60 verifier tests, the 14-test reservation baseline and the five-case mutation playground. This does not change the recorded Node 24.21.0 authoring version or package runtime range.

## Independent application lifecycle

Run `npm run lifecycle` on pinned Node 20.20.2/npm 10.8.2 from a clean committed checkout. The [lifecycle preview](docs/application-lifecycle.md) installs a real local package into an independent consumer, freezes original requirements/tests/contracts, retains a failing added acceptance case, repairs it, and checks registered contract and loopback HTTP resilience fixtures. Source/package/compiler/evidence changes and forged readiness cannot waive the original obligations. No package is published.

## Development and source publication

[Contributing](CONTRIBUTING.md) covers the two qualified runtime lanes and clean
qualification commands. [Security](SECURITY.md) explains the trusted-command
boundary. [Publication](docs/publication.md) describes CI, local package use and
source/qualification identities. Changes are summarized in the
[changelog](CHANGELOG.md). CI runs tests and actual local package consumers; it
does not publish npm packages or approve an application release.
