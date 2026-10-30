import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  existsSync,
  unlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyze } from '../src/analyze.js';
import { evaluate, loadPolicy, assess, sarif, runCommand } from '../src/evaluate.js';
import { canonical } from '../src/canonical.js';
import { nextInvestigation } from '../src/decision.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (text) => [{ path: 'domain.js', absolute: '/fixture/domain.js', text }];
const observed = (text) => analyze(source(text), ['domain.js'], []).findings;
for (const [id, code] of [
  ['JSA-D01', 'export const f = () => { throw new Error("bad"); };'],
  ['JSA-I01', 'export let value = 0;'],
  ['JSA-I01', 'var value = 0;'],
  ['JSA-I02', 'export const f = x => { x.count = 1; };'],
  ['JSA-I02', 'export const f = x => { x[0] += 1; };'],
  ['JSA-I02', 'export const f = x => x.push(1);'],
  ['JSA-I02', 'export const f = x => ++x.count;'],
  ['JSA-I02', 'export const f = x => { delete x.count; };'],
  ['JSA-E01', 'import fs from "node:fs";'],
  ['JSA-E01', 'export const f = () => fetch("/");'],
  ['JSA-E01', 'export const f = () => Math.random();'],
  ['JSA-E01', 'export const f = () => new Date();'],
  ['JSA-E01', 'export const f = () => console.log("effect");'],
  ['JSA-E03', 'export const f = () => import("./x.js");'],
  ['JSA-E03', 'export const f = () => require("fs");']
])
  test(id + ' observes ' + code, () => assert.ok(observed(code).some((f) => f.ruleId === id)));
test('strings, comments and regular expressions are not code findings', () =>
  assert.deepEqual(
    observed(
      'export const text = "throw let fetch()"; // console.log()\nexport const r = /throw|fetch/;'
    ),
    []
  ));
test('pure immutable explicit result has no findings', () =>
  assert.deepEqual(
    observed(
      'export const f = value => Object.freeze({ kind: value > 0 ? "Accepted" : "Rejected" });'
    ),
    []
  ));
test('direct declared boundary import is observed', () => {
  const result = analyze(
    [
      ...source('import { run } from "./adapter.js";'),
      {
        path: 'adapter.js',
        absolute: '/fixture/adapter.js',
        text: 'export const run = () => 1;'
      }
    ],
    ['domain.js'],
    ['adapter.js']
  );
  assert.equal(result.findings[0].ruleId, 'JSA-E02');
});
test('unobserved local and external dependencies stay incomplete', () => {
  for (const name of ['./missing.js', 'third-party'])
    assert.equal(
      analyze(source('import x from "' + name + '";'), ['domain.js'], []).unsupported.length,
      1
    );
});
test('syntax failure remains an analyzer error', () =>
  assert.ok(analyze(source('export const x = );'), ['domain.js'], []).errors.length));
const fixture = async (action) => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'js-assay-test-'));
  try {
    cpSync(resolve(root, 'playground/reservation'), temporary, {
      recursive: true
    });
    await action(temporary);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};
const policy = (temporary, change) => {
  const file = resolve(temporary, '.jsassay.json');
  const value = JSON.parse(readFileSync(file, 'utf8'));
  change(value);
  writeFileSync(file, JSON.stringify(value));
};
test('verify executes the real specimen tests and assessment preserves receipt', () =>
  fixture((temporary) => {
    const receipt = evaluate(temporary);
    assert.equal(receipt.verdict.kind, 'Pass');
    assert.equal(receipt.authority.authoritative, true);
    assert.equal(receipt.requiredCommands[0].status, 'passed');
    assert.equal(assess(receipt).receipt, receipt);
    assert.equal(assess(receipt).assessment.next, 'ReadyForReview');
    assert.equal(sarif(receipt).version, '2.1.0');
  }));
test('scan remains provisional and deterministic', () =>
  fixture((temporary) => {
    const first = evaluate(temporary, 'scan'),
      second = evaluate(temporary, 'scan');
    assert.equal(first.verdict.kind, 'Inconclusive');
    assert.equal(first.authority.authoritative, false);
    assert.equal(first.requiredCommands[0].status, 'not-run');
    assert.equal(canonical(first), canonical(second));
  }));
test('missing lock cannot pass', () =>
  fixture((temporary) => {
    unlinkSync(resolve(temporary, 'package-lock.json'));
    assert.equal(evaluate(temporary).verdict.kind, 'Inconclusive');
  }));
test('missing declared source cannot pass', () =>
  fixture((temporary) => {
    policy(temporary, (p) => p.domainFiles.push('absent.js'));
    assert.equal(evaluate(temporary).verdict.kind, 'Inconclusive');
  }));
test('unexecuted required evidence cannot pass', () =>
  fixture((temporary) => {
    policy(temporary, (p) => (p.requiredCommands = []));
    assert.equal(evaluate(temporary).verdict.kind, 'Inconclusive');
  }));
test('nonzero required exit produces Fail', () =>
  fixture((temporary) => {
    policy(temporary, (p) => (p.requiredCommands = [['node', '-e', 'process.exit(7)']]));
    const result = evaluate(temporary);
    assert.equal(result.verdict.kind, 'Fail');
    assert.equal(result.requiredCommands[0].exitCode, 7);
  }));
test('missing executable is ToolFailure', () =>
  fixture((temporary) => {
    policy(temporary, (p) => (p.requiredCommands = [['js-assay-no-such-executable']]));
    assert.equal(evaluate(temporary).verdict.kind, 'ToolFailure');
  }));
test('source changed during execution invalidates freshness', () =>
  fixture((temporary) => {
    policy(
      temporary,
      (p) =>
        (p.requiredCommands = [
          [
            'node',
            '-e',
            'require("node:fs").appendFileSync("src/domain/reservation.js", "// changed")'
          ]
        ])
    );
    const result = evaluate(temporary);
    assert.equal(result.verdict.kind, 'Inconclusive');
    assert.equal(result.freshness.unchanged, false);
  }));
test('source syntax failure is never a passing check', () =>
  fixture((temporary) => {
    writeFileSync(resolve(temporary, 'src/domain/reservation.js'), 'export const nope = );');
    assert.equal(evaluate(temporary).verdict.kind, 'ToolFailure');
  }));
test('scope traversal and unknown keys are rejected', () =>
  fixture((temporary) => {
    policy(temporary, (p) => (p.domainFiles = ['../outside.js']));
    assert.throws(() => loadPolicy(temporary));
  }));
test('symlinks outside declared root are rejected', () =>
  fixture((temporary) => {
    const file = resolve(temporary, 'src/domain/reservation.js');
    unlinkSync(file);
    symlinkSync(resolve(root, 'src/catalog.js'), file);
    assert.throws(() => evaluate(temporary), /symlink escapes/);
  }));
test('catalog findings become SARIF without changing authority', () =>
  fixture((temporary) => {
    writeFileSync(resolve(temporary, 'src/domain/reservation.js'), 'export let x = 1;');
    policy(temporary, (p) => (p.requiredCommands = [['node', '-e', 'process.exit(0)']]));
    const receipt = evaluate(temporary);
    assert.equal(receipt.verdict.kind, 'Fail');
    assert.equal(sarif(receipt).runs[0].results[0].ruleId, 'JSA-I01');
  }));
const observation = {
  baselinePassed: true,
  validMutation: true,
  completed: true,
  survived: true,
  budget: 3,
  probeId: 'zero-boundary'
};
for (const [change, expected] of [
  [{ baselinePassed: false }, 'ContextRequired'],
  [{ validMutation: false }, 'ContextRequired'],
  [{ completed: false }, 'ContextRequired'],
  [{ survived: false }, 'NoInvestigation'],
  [{ budget: 0 }, 'BudgetExhausted'],
  [{ probeId: 'unknown' }, 'SurvivorReview'],
  [{}, 'ProbeRequested']
])
  test('advice guard ' + JSON.stringify(change), () =>
    assert.equal(nextInvestigation({ ...observation, ...change }).kind, expected)
  );
test('CLI scan emits provisional exit and assess embeds original receipt', () =>
  fixture((temporary) => {
    for (const [command, expectedCode] of [
      ['scan', 2],
      ['assess', 0]
    ]) {
      const result = spawnSync(
        process.execPath,
        [resolve(root, 'src/cli.js'), command, temporary],
        { encoding: 'utf8' }
      );
      assert.equal(result.status, expectedCode, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(
        command === 'assess' ? output.receipt.verdict.kind : output.verdict.kind,
        command === 'assess' ? 'Pass' : 'Inconclusive'
      );
    }
  }));

test('timeout is ToolFailure and preserves the termination signal', () => {
  const result = runCommand(['node', '-e', 'setInterval(()=>{},1000)'], root, {
    timeoutMs: 50
  });
  assert.equal(result.status, 'tool-failure');
  assert.ok(result.error);
});
test('malformed policy and unknown fields fail closed', () =>
  fixture((temporary) => {
    const file = resolve(temporary, '.jsassay.json');
    writeFileSync(file, '{');
    assert.throws(() => loadPolicy(temporary));
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 'js-assay-policy/0.1',
        unrecognized: true
      })
    );
    assert.throws(() => loadPolicy(temporary));
  }));
test('policy bytes changed during execution invalidate evidence', () =>
  fixture((temporary) => {
    policy(
      temporary,
      (p) =>
        (p.requiredCommands = [
          ['node', '-e', 'require("node:fs").appendFileSync(".jsassay.json", " ")']
        ])
    );
    const result = evaluate(temporary);
    assert.equal(result.verdict.kind, 'Inconclusive');
    assert.equal(result.freshness.unchanged, false);
  }));

for (const code of [
  'export const mutate=item=>([item.count]=[1]);',
  'export const mutate=item=>({value:item.count}={value:1});',
  'export const mutate=item=>([{nested:item.count}]=[{nested:1}]);',
  'export const mutate=item=>([...item.values]=[1]);'
])
  test('JSA-I02 nested property target ' + code, () =>
    assert.ok(observed(code).some((f) => f.ruleId === 'JSA-I02'))
  );
for (const kind of ['source', 'policy', 'lock', 'evidence', 'command', 'symlink', 'hardlink'])
  test('CLI refuses ' + kind + ' output alias before command execution', () =>
    fixture((temporary) => {
      writeFileSync(resolve(temporary, 'runner.js'), 'process.exit(0);');
      policy(
        temporary,
        (p) =>
          (p.requiredCommands = [
            ['node', '-e', 'require("node:fs").writeFileSync("command-ran", "yes")'],
            ['node', 'runner.js']
          ])
      );
      const relativePath = {
        source: 'src/domain/reservation.js',
        policy: '.jsassay.json',
        lock: 'package-lock.json',
        evidence: 'requirements.json',
        command: 'runner.js'
      }[kind];
      const protectedFile = resolve(temporary, relativePath ?? 'src/domain/reservation.js');
      let output = protectedFile;
      if (kind === 'symlink' || kind === 'hardlink') {
        output = resolve(temporary, 'alias.json');
        (kind === 'symlink' ? symlinkSync : linkSync)(protectedFile, output);
      }
      const original = readFileSync(protectedFile);
      const result = spawnSync(
        process.execPath,
        [resolve(root, 'src/cli.js'), 'verify', temporary, '--json', output],
        { encoding: 'utf8' }
      );
      assert.equal(result.status, 2, result.stderr);
      assert.equal(JSON.parse(result.stdout).verdict.kind, 'ToolFailure');
      assert.deepEqual(readFileSync(protectedFile), original);
      assert.equal(existsSync(resolve(temporary, 'command-ran')), false);
    })
  );

test('empty specimen tests cannot satisfy retained execution minimum', () =>
  fixture((temporary) => {
    writeFileSync(resolve(temporary, 'tests/expanded.test.js'), '');
    assert.equal(evaluate(temporary).verdict.kind, 'Fail');
  }));

for (const code of [
  'export const f=()=>globalThis["fetch"]("/");',
  'export const f=()=> (Math["random"])();',
  'export const f=()=>console["log"]("x");'
])
  test('JSA-E01 computed direct effect ' + code, () =>
    assert.ok(observed(code).some((f) => f.ruleId === 'JSA-E01'))
  );
for (const code of [
  'export const f=(item,xs)=>{for(item.count of xs){}}',
  'export const f=(item,xs)=>{for([item.count] of xs){}}'
])
  test('JSA-I02 loop property target ' + code, () =>
    assert.ok(observed(code).some((f) => f.ruleId === 'JSA-I02'))
  );
