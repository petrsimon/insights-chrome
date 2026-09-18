#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, '../..');
const issueTests = [
  ['preserve barrel exports', 'test-preserve-barrel-exports.mjs'],
  ['expose generated declarations', 'test-expose-generated-declarations.mjs'],
  ['load native ESM exports', 'test-native-esm.mjs'],
];
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`Run all remote-types integration issue tests.

Each issue can also be run directly:

${issueTests.map(([name, script]) => `  ${name}:\n    node testdata/remote-types-integration/${script} --tarball candidate=/path/to/package.tgz`).join('\n')}
`);
  process.exit(0);
}

let exitCode = 0;
for (const [name, script] of issueTests) {
  console.log(`\n######## ${name} ########`);
  const result = spawnSync(process.execPath, [join(scriptDirectory, script), ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) exitCode = 1;
}

process.exitCode = exitCode;
