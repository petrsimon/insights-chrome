#!/usr/bin/env node
import { join } from 'node:path';

import { readGeneratedDeclarations, runAppProductionBuild, runIssue } from './harness.mjs';

await runIssue({
  argv: process.argv.slice(2),
  commandName: 'test-preserve-barrel-exports.mjs',
  description: 'Verify generated declarations preserve exports from nested barrels.',
  issueName: 'preserve barrel exports',
  run: async ({ registryPath, sourceDirectory }) => {
    const generatedDirectory = join(sourceDirectory, 'generated');
    const production = await runAppProductionBuild(registryPath, generatedDirectory);
    const generated = await readGeneratedDeclarations(generatedDirectory);

    return {
      stages: [
        ['actual app production Webpack', production],
        ['generated declarations preserve exposed keys', generated.stage],
      ],
      artifacts: generated.contents ? [{ label: 'generated.d.ts', contents: generated.contents }] : [],
    };
  },
});
