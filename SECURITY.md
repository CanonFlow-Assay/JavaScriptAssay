# Security scope and reporting

JavaScriptAssay is a bounded policy prototype. A scoped Pass is not a security
audit, sandbox, universal purity proof or production approval. Commands in policy
and lifecycle manifests are trusted local execution inputs. Review argument
vectors and execute untrusted projects only in an appropriate isolated environment.
The verifier invokes Node without a shell; this does not make arbitrary authored
commands safe. See [the contract](docs/CONTRACT.md) for integrity and concurrency
limits.

Do not include credentials, private source or sensitive command output in public
issues or shared evidence. If GitHub private vulnerability reporting is enabled,
use the repository's Security tab. Otherwise contact the maintainer through
their GitHub profile to arrange private disclosure before sharing sensitive
details. No response-time or supported-security-release guarantee is made for
this preview.

For a non-sensitive defect, include the source revision, Node/npm versions,
minimal fixture, exact command and redacted original receipt. Explain whether
the result involved missing evidence, tool failure, a policy finding or a failed
application test. Preserve the original artifact privately when redacting.
