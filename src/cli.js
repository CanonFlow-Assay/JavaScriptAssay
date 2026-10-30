#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonical } from './canonical.js';
import { rules } from './catalog.js';
import { assess, evaluate, loadPolicy, sarif } from './evaluate.js';
import { validateOutputPaths } from './outputs.js';
const [command, target, ...options] = process.argv.slice(2);
const usage =
  'js-assay doctor <target> | catalog | explain <rule> | scan <target> | verify <target> | assess <target> [--json file] [--sarif file]\n';
const write = (file, value) => {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, canonical(value));
};
try {
  if (!command || ['--help', '-h'].includes(command)) process.stdout.write(usage);
  else if (command === 'catalog') process.stdout.write(canonical(rules));
  else if (command === 'explain') {
    const rule = rules.find((rule) => rule.id === target);
    if (!rule) throw new Error('Unknown rule');
    process.stdout.write(canonical(rule));
  } else if (command === 'doctor') {
    const loaded = loadPolicy(target ?? '.');
    process.stdout.write(
      canonical({
        kind: 'Doctor',
        policyReady: true,
        policyDigest: loaded.policyDigest,
        node: process.version,
        complianceClaim: false
      })
    );
  } else if (['scan', 'verify', 'assess'].includes(command)) {
    if (!target) throw new Error('Target required');
    let json, sarifPath;
    for (let i = 0; i < options.length; i += 2) {
      if (!['--json', '--sarif'].includes(options[i]) || !options[i + 1])
        throw new Error('Invalid output option');
      if (options[i] === '--json') json = options[i + 1];
      else sarifPath = options[i + 1];
    }
    const outputPolicy = loadPolicy(target);
    validateOutputPaths(outputPolicy, [json, sarifPath]);
    const receipt = evaluate(target, command === 'scan' ? 'scan' : 'verify');
    const output = command === 'assess' ? assess(receipt) : receipt;
    validateOutputPaths(outputPolicy, [json, sarifPath]);
    if (json) write(json, output);
    if (sarifPath) write(sarifPath, sarif(receipt));
    process.stdout.write(canonical(output));
    process.exitCode =
      receipt.verdict.kind === 'Pass' ? 0 : receipt.verdict.kind === 'Fail' ? 1 : 2;
  } else throw new Error(usage);
} catch (error) {
  process.stdout.write(
    canonical({
      schemaVersion: 'js-assay-error/0.1',
      verdict: { kind: 'ToolFailure', reason: error.message },
      authoritative: false
    })
  );
  process.exitCode = 2;
}
