# Bounded AST observations

| Rule    | Domain observation                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JSA-D01 | throw statement                                                                                                                                        |
| JSA-I01 | let/var declaration; const is only binding evidence                                                                                                    |
| JSA-I02 | property/index assignment, increment/decrement, delete, recognized collection mutator, Object.assign/defineProperty or Reflect.set                     |
| JSA-E01 | node:/known infrastructure import, named fetch/timer/global calls, console/process method, Date construction, Date.now, performance.now or Math.random |
| JSA-E02 | direct static import/re-export of a declared boundary file                                                                                             |
| JSA-E03 | dynamic import or require call                                                                                                                         |

Every rule has executable positive/negative observations in tests/assay.test.js. Strings, comments and regular expressions are parsed as data rather than searched as text. These observations do not establish exhaustive effects or semantics. Unknown static external dependencies make scope incomplete. Boundary files receive syntax validation and source binding but no domain restrictions.

The bounded JSA-I02 observation includes nested destructuring and for-of/in property targets. JSA-E01 normalizes direct parenthesized calls, string-literal computed properties and globalThis prefixes. Indirect aliases, proxies, getters and arbitrary dynamic keys remain outside these observations; shadowed names may produce conservative findings.
