import { existsSync, realpathSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const srcRoot = dirname(fileURLToPath(import.meta.url));
const ownRoot = dirname(srcRoot);
const require = createRequire(import.meta.url);
const identity = (file) => {
  const absolute = resolve(file);
  if (existsSync(absolute)) {
    const stat = statSync(absolute);
    return { path: realpathSync(absolute), inode: stat.dev + ':' + stat.ino };
  }
  const tail = [];
  let parent = absolute;
  while (!existsSync(parent)) {
    tail.unshift(basename(parent));
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  return { path: resolve(realpathSync(parent), ...tail), inode: null };
};
const aliases = (a, b) => a.path === b.path || (a.inode !== null && a.inode === b.inode);
// Validate before verification can execute any required command or create outputs.
export const validateOutputPaths = (loaded, outputs) => {
  const declared = [
    ...loaded.policy.domainFiles,
    ...loaded.policy.boundaryFiles,
    ...loaded.policy.evidenceFiles,
    '.jsassay.json',
    'package.json',
    'package-lock.json'
  ];
  const commandFiles = loaded.policy.requiredCommands
    .flat()
    .map((arg) => resolve(loaded.root, arg))
    .filter((file) => existsSync(file) && statSync(file).isFile());
  const protectedFiles = [
    ...declared.map((file) => resolve(loaded.root, file)),
    ...commandFiles,
    ...readdirSync(srcRoot)
      .filter((file) => file.endsWith('.js'))
      .map((file) => resolve(srcRoot, file)),
    resolve(ownRoot, 'package.json'),
    resolve(ownRoot, 'package-lock.json'),
    require.resolve('typescript')
  ];
  const protectedIdentities = protectedFiles.map(identity);
  const chosen = [];
  for (const file of outputs.filter(Boolean)) {
    const current = identity(file);
    if (protectedIdentities.some((input) => aliases(input, current)))
      throw new Error('Output aliases a verification input or evaluator file: ' + file);
    if (chosen.some((previous) => aliases(previous, current)))
      throw new Error('Artifact output paths alias each other');
    chosen.push(current);
  }
};
