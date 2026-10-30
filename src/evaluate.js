import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { analyze } from './analyze.js';
import { canonical, sha256 } from './canonical.js';
import { rules } from './catalog.js';
const ownRoot = dirname(fileURLToPath(import.meta.url));
const strings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
export const loadPolicy = (root) => {
  root = realpathSync(root);
  const policyPath = resolve(root, '.jsassay.json');
  const bytes = readFileSync(policyPath);
  const policy = JSON.parse(bytes.toString('utf8'));
  const allowed = [
    'schemaVersion',
    'domainFiles',
    'boundaryFiles',
    'evidenceFiles',
    'requiredCommands'
  ];
  if (
    Object.keys(policy).some((key) => !allowed.includes(key)) ||
    policy.schemaVersion !== 'js-assay-policy/0.1'
  )
    throw new Error('Unsupported policy schema or key');
  for (const key of ['domainFiles', 'boundaryFiles', 'evidenceFiles']) {
    if (!strings(policy[key]) || (key === 'domainFiles' && policy[key].length === 0))
      throw new Error('Invalid ' + key);
    if (new Set(policy[key]).size !== policy[key].length) throw new Error('Duplicate ' + key);
    for (const entry of policy[key])
      if (
        isAbsolute(entry) ||
        entry.includes('\\') ||
        entry.split('/').some((part) => part === '..' || part === '.' || part === '') ||
        entry.startsWith('.git/')
      )
        throw new Error('Scope entries must be canonical relative file paths');
  }
  if (policy.domainFiles.some((file) => policy.boundaryFiles.includes(file)))
    throw new Error('Domain and boundary overlap');
  if ([...policy.domainFiles, ...policy.boundaryFiles].some((file) => !/\.(m?js|cjs)$/.test(file)))
    throw new Error('Source scope requires JavaScript files');
  if (
    !Array.isArray(policy.requiredCommands) ||
    policy.requiredCommands.length > 32 ||
    !policy.requiredCommands.every((command) => strings(command) && command.length > 0)
  )
    throw new Error('requiredCommands must be argument vectors');
  return { root, policy, policyDigest: sha256(bytes) };
};
export const snapshot = (loaded) => {
  const paths = [
    ...new Set([
      ...loaded.policy.domainFiles,
      ...loaded.policy.boundaryFiles,
      ...loaded.policy.evidenceFiles,
      '.jsassay.json',
      'package.json',
      'package-lock.json'
    ])
  ].sort();
  const files = [],
    missing = [];
  for (const path of paths) {
    const absolute = resolve(loaded.root, path);
    if (!existsSync(absolute)) {
      missing.push(path);
      continue;
    }
    const physical = realpathSync(absolute);
    const rel = relative(loaded.root, physical);
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new Error('Scope symlink escapes target: ' + path);
    files.push({ path, sha256: sha256(readFileSync(absolute)) });
  }
  return { files, missing, digest: sha256(canonical({ files, missing })) };
};
export const decide = ({
  mode,
  errors,
  missing,
  findings,
  unsupported,
  commands,
  fresh,
  commandCount
}) => {
  if (errors.length || commands.some((c) => c.status === 'tool-failure'))
    return {
      kind: 'ToolFailure',
      reason: errors.join('; ') || 'A required command could not complete'
    };
  if (!fresh)
    return {
      kind: 'Inconclusive',
      reason: 'Observed inputs changed during execution'
    };
  if (missing.length || unsupported.length)
    return {
      kind: 'Inconclusive',
      reason: 'Declared scope or dependencies are incomplete'
    };
  if (findings.length || commands.some((c) => c.status === 'failed'))
    return {
      kind: 'Fail',
      reason: findings.length ? 'Blocking scoped policy finding' : 'Required command failed'
    };
  if (mode === 'scan' || commandCount === 0 || commands.some((c) => c.status === 'not-run'))
    return {
      kind: 'Inconclusive',
      reason: 'Required execution evidence was not collected'
    };
  return { kind: 'Pass' };
};
export const runCommand = (vector, root, options = {}) => {
  const [executable, ...args] = vector;
  const result = spawnSync(executable === 'node' ? process.execPath : executable, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    detached: process.platform !== 'win32',
    timeout: options.timeoutMs ?? 30000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (process.platform !== 'win32' && result.pid) {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const status =
    result.error || result.signal || result.status === null
      ? 'tool-failure'
      : result.status === 0
        ? 'passed'
        : 'failed';
  return {
    command: vector,
    status,
    exitCode: result.status,
    signal: result.signal,
    outputDigest: sha256((result.stdout ?? '') + (result.stderr ?? '')),
    ...(result.error ? { error: result.error.message } : {}),
    ...(options.includeOutput ? { stdout: result.stdout, stderr: result.stderr } : {})
  };
};
export const evaluate = (root, mode = 'verify') => {
  if (!['scan', 'verify'].includes(mode)) throw new Error('Invalid evaluation mode');
  const implementationSnapshot = () =>
    readdirSync(ownRoot)
      .filter((file) => file.endsWith('.js'))
      .sort()
      .map((file) => ({
        path: file,
        sha256: sha256(readFileSync(resolve(ownRoot, file)))
      }));
  const implementation = implementationSnapshot();
  const loaded = loadPolicy(root),
    before = snapshot(loaded);
  const sourcePaths = [...loaded.policy.domainFiles, ...loaded.policy.boundaryFiles].sort();
  const sources = sourcePaths
    .filter((file) => !before.missing.includes(file))
    .map((file) => ({
      path: file,
      absolute: resolve(loaded.root, file),
      text: readFileSync(resolve(loaded.root, file), 'utf8')
    }));
  const analysis = analyze(sources, loaded.policy.domainFiles, loaded.policy.boundaryFiles);
  const syntax = sources.map((source) => ({
    path: source.path,
    ...runCommand(['node', '--check', source.path], loaded.root)
  }));
  const commands = loaded.policy.requiredCommands.map((command) =>
    mode === 'verify'
      ? runCommand(command, loaded.root)
      : {
          command,
          status: 'not-run',
          exitCode: null,
          signal: null,
          outputDigest: null
        }
  );
  const after = snapshot(loaded),
    fresh =
      before.digest === after.digest &&
      canonical(implementation) === canonical(implementationSnapshot());
  const errors = [
    ...analysis.errors,
    ...syntax
      .filter((item) => item.status !== 'passed')
      .map((item) => item.path + ': JavaScript syntax validation did not pass')
  ];
  const verdict = decide({
    mode,
    errors,
    missing: before.missing,
    findings: analysis.findings,
    unsupported: analysis.unsupported,
    commands,
    fresh,
    commandCount: loaded.policy.requiredCommands.length
  });
  return {
    schemaVersion: 'js-assay-receipt/0.1',
    mode,
    toolchain: {
      node: process.version,
      typescript: ts.version,
      cli: '0.1.0-preview.1'
    },
    authority: {
      authoritative: mode === 'verify' && verdict.kind === 'Pass',
      scope:
        'Declared files, listed AST observations, syntax checks, and executed command exits only'
    },
    source: before,
    policyDigest: loaded.policyDigest,
    catalogDigest: sha256(canonical(rules)),
    implementationDigest: sha256(canonical(implementation)),
    scope: {
      domainFiles: loaded.policy.domainFiles,
      boundaryFiles: loaded.policy.boundaryFiles,
      evidenceFiles: loaded.policy.evidenceFiles,
      missing: before.missing,
      unsupported: analysis.unsupported,
      complete: before.missing.length === 0 && analysis.unsupported.length === 0
    },
    findings: analysis.findings,
    syntax,
    requiredCommands: commands,
    errors,
    freshness: { unchanged: fresh, before: before.digest, after: after.digest },
    verdict,
    limitations: [
      'JavaScript AST observations do not prove semantic purity, alias freedom, deep immutability, exhaustive outcomes, security or business correctness.',
      'Only declared files and direct static domain imports are assessed. Command success does not prove nonempty or sufficient tests.',
      'Argument vectors in reviewed policy are trusted execution instructions; no shell is used.'
    ]
  };
};
export const assess = (receipt) => ({
  schemaVersion: 'js-assay-assessment/0.1',
  assessment: {
    verdict: receipt.verdict,
    authority: receipt.authority,
    sourceDigest: receipt.source.digest,
    next:
      receipt.verdict.kind === 'Pass'
        ? 'ReadyForReview'
        : receipt.verdict.kind === 'Fail'
          ? 'RepairObservedFailure'
          : 'CollectMissingContext'
  },
  receipt
});
export const sarif = (receipt) => ({
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'JavaScriptAssay',
          rules: rules.map((rule) => ({
            id: rule.id,
            shortDescription: { text: rule.title }
          }))
        }
      },
      results: receipt.findings.map((f) => ({
        ruleId: f.ruleId,
        level: 'error',
        message: {
          text: rules.find((rule) => rule.id === f.ruleId).observation
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: f.path },
              region: { startLine: f.line, startColumn: f.column }
            }
          }
        ]
      }))
    }
  ]
});
