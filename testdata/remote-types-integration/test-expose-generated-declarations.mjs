#!/usr/bin/env node
import { join } from 'node:path';

import { packageDirectory, readGeneratedFile, runAppProductionBuild, runInvalidPropsTypeScript, runIssue, skipped } from './harness.mjs';

await runIssue({
  argv: process.argv.slice(2),
  commandName: 'test-expose-generated-declarations.mjs',
  description: 'Verify default-output declarations are visible through the package type entry.',
  issueName: 'expose generated declarations',
  run: async ({ registryPath, runtimeDirectory }) => {
    const production = await runAppProductionBuild(registryPath);
    const generated = await readGeneratedFile(packageDirectory);
    const invalidProps = generated.stage.ok ? await runInvalidPropsTypeScript(runtimeDirectory) : skipped('Skipped because generated.d.ts was not created');

    return {
      stages: [
        ['default-output production Webpack', production],
        ['default package generated declarations', generated.stage],
        ['default-output invalid-props TypeScript', invalidProps],
      ],
      artifacts: generated.contents ? [{ label: 'default package generated.d.ts', contents: generated.contents }] : [],
    };
  },
});
