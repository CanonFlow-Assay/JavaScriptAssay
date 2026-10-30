import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha256 } from '../src/canonical.js';
import { evaluate, runCommand, assess } from '../src/evaluate.js';
import { nextInvestigation } from '../src/decision.js';
const root = dirname(fileURLToPath(import.meta.url)),
  specimen = resolve(root, 'reservation');
const output = resolve(process.argv[2] ?? resolve(root, '../artifacts/playground-' + Date.now()));
mkdirSync(dirname(output), { recursive: true });
mkdirSync(output, { recursive: false });
const baseline = evaluate(specimen, 'verify');
writeFileSync(resolve(output, 'baseline.json'), canonical(baseline));
writeFileSync(resolve(output, 'assessment.json'), canonical(assess(baseline)));
if (baseline.verdict.kind !== 'Pass') throw new Error('Original baseline did not pass');
const mutations = [
  {
    id: 'zero-boundary',
    from: 'quantity <= 0',
    to: 'quantity < 0',
    expectedBefore: 'Survived',
    expectedAfter: 'Killed',
    probeId: 'zero-boundary'
  },
  {
    id: 'exact-stock',
    from: 'quantity > stock',
    to: 'quantity >= stock',
    expectedBefore: 'Survived',
    expectedAfter: 'Killed'
  },
  {
    id: 'wrong-balance',
    from: 'stock - quantity',
    to: 'stock + quantity',
    expectedBefore: 'Killed',
    expectedAfter: 'Killed'
  },
  {
    id: 'integer-equivalent',
    from: 'quantity <= 0',
    to: 'quantity < 1',
    expectedBefore: 'Survived',
    expectedAfter: 'Survived'
  },
  {
    id: 'invalid-syntax',
    from: 'stock - quantity',
    to: 'stock - )',
    expectedBefore: 'Invalid',
    expectedAfter: 'Invalid'
  }
];
const records = [];
for (const mutation of mutations) {
  const temporary = mkdtempSync(resolve(tmpdir(), 'js-assay-mutation-'));
  try {
    cpSync(specimen, temporary, { recursive: true });
    const file = resolve(temporary, 'src/domain/reservation.js'),
      original = readFileSync(file, 'utf8');
    if (original.split(mutation.from).length !== 2)
      throw new Error('Mutation anchor must occur exactly once');
    const changed = original.replace(mutation.from, mutation.to);
    writeFileSync(file, changed);
    const syntax = runCommand(['node', '--check', 'src/domain/reservation.js'], temporary, {
      includeOutput: true
    });
    const validMutation = syntax.status === 'passed';
    const before = validMutation
      ? runCommand(['node', '--test', 'tests/baseline.test.js'], temporary, {
          includeOutput: true
        })
      : null;
    const after = validMutation
      ? runCommand(['node', '--test', 'tests/expanded.test.js'], temporary, {
          includeOutput: true
        })
      : null;
    if ([before, after].some((run) => run && run.status === 'tool-failure'))
      throw new Error('Mutation execution failed to complete');
    const status = (run) =>
      !validMutation ? 'Invalid' : run.status === 'passed' ? 'Survived' : 'Killed';
    const beforeStatus = status(before),
      afterStatus = status(after);
    const advice = nextInvestigation({
      baselinePassed: true,
      validMutation,
      completed: true,
      survived: beforeStatus === 'Survived',
      budget: 3,
      probeId: mutation.probeId
    });
    records.push({
      id: mutation.id,
      requirement: 'RES-001',
      originalDigest: sha256(original),
      mutatedDigest: sha256(changed),
      syntax,
      before,
      after,
      beforeStatus,
      afterStatus,
      advice,
      expectationMet:
        beforeStatus === mutation.expectedBefore && afterStatus === mutation.expectedAfter,
      unresolved: afterStatus === 'Survived'
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
const controlRoot = mkdtempSync(resolve(tmpdir(), 'js-assay-failed-baseline-'));
let failedBaseline;
try {
  cpSync(specimen, controlRoot, { recursive: true });
  writeFileSync(
    resolve(controlRoot, 'tests/failed-baseline.test.js'),
    'import test from "node:test"; import assert from "node:assert/strict"; test("deliberate failed original baseline",()=>assert.fail("required negative control"));'
  );
  const execution = runCommand(['node', '--test', 'tests/failed-baseline.test.js'], controlRoot, {
    includeOutput: true
  });
  failedBaseline = {
    execution,
    advice: nextInvestigation({ baselinePassed: false }),
    expectationMet: execution.status === 'failed'
  };
} finally {
  rmSync(controlRoot, { recursive: true, force: true });
}
const current = evaluate(specimen, 'scan');
const unchanged = current.source.digest === baseline.source.digest;
const report = {
  schemaVersion: 'js-assay-playground/0.1',
  sourceDigest: baseline.source.digest,
  baseline: baseline.verdict,
  sourceUnchanged: unchanged,
  cases: records,
  failedBaselineControl: failedBaseline,
  completed:
    records.every((record) => record.expectationMet) && failedBaseline.expectationMet && unchanged,
  survivors: records.filter((record) => record.unresolved).map((record) => record.id),
  claims:
    'Bounded fixture execution; survivors are unresolved, not automatically equivalent. No model calls or release approval.'
};
writeFileSync(resolve(output, 'mutation-cases.json'), canonical(report));
process.stdout.write(
  canonical({
    output,
    baseline: report.baseline,
    cases: records.length,
    survivors: report.survivors,
    completed: report.completed
  })
);
if (!report.completed) process.exitCode = 1;
