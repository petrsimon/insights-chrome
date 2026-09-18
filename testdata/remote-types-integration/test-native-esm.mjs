#!/usr/bin/env node

import { runIssue, runNativeEsmWebpack } from './harness.mjs';

await runIssue({
  argv: process.argv.slice(2),
  commandName: 'test-native-esm.mjs',
  description: 'Verify the native ESM Webpack entry loads and generates declarations.',
  issueName: 'load native ESM exports',
  run: async ({ registryPath, runtimeDirectory }) => {
    const esm = await runNativeEsmWebpack(runtimeDirectory, registryPath);

    return {
      stages: [
        ['native ESM Webpack command', esm.command],
        ['native ESM generated declarations', esm.generated],
      ],
      artifacts: esm.generatedContents ? [{ label: 'native ESM generated.d.ts', contents: esm.generatedContents }] : [],
    };
  },
});
