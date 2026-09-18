# `@scalprum/remote-types` real-consumer integration

This harness tests a packed `@scalprum/remote-types` package inside the real
`insights-chrome` application. It is an application-level control, not a
compiler-API or package-unit-test substitute.

Each known regression has its own runner so a failure points directly to one
issue:

| Runner                                   | Regression covered                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `test-preserve-barrel-exports.mjs`       | Nested barrels, `.js` declaration specifiers, both `export *` targets, and named type re-exports must remain under the exposed module key. |
| `test-expose-generated-declarations.mjs` | Declarations written to the plugin's default output directory must be visible through the package type entry.                              |
| `test-native-esm.mjs`                    | Native ESM consumers must be able to import `@scalprum/remote-types/webpack` and run Webpack.                                              |
| `run-integration.mjs`                    | Runs all issue runners sequentially.                                                                                                       |

## Prerequisites

Run from the `insights-chrome` repository root.

- Node.js `>=20.20.2` and npm `>=10.9.8` (the app's `.nvmrc` currently selects Node 24).
- App dependencies installed:

  ```sh
  npm install
  ```

- One or more packed `@scalprum/remote-types` tarballs.
- A clean app worktree outside `testdata/remote-types-integration/`. The harness
  rejects unrelated tracked or untracked changes before running.

The harness derives its project root from its own location. It contains no
machine-specific repository paths.

## A/B command

The control and candidate tarballs used for the PR #194/PR #195 comparison:

```sh
node testdata/remote-types-integration/run-integration.mjs \
  --tarball baseline=/tmp/scalprum-pr194-control/scalprum-remote-types-0.1.0.tgz \
  --tarball candidate=/tmp/scalprum-remote-types-0.1.0.tgz \
  --expect-pass candidate
```

The aggregate command runs each issue runner independently. Each runner
installs both tarballs, reports the baseline failure as diagnostic output, and
requires the candidate to pass.

`--tarball` is repeatable. Values may be plain paths or `label=path` values.
`--expect-pass` identifies the tarball(s) that must pass for that runner.
Without it, every tarball must pass.

## Individual issue commands

Run one issue when investigating a specific failure:

```sh
node testdata/remote-types-integration/test-preserve-barrel-exports.mjs \
  --tarball candidate=/tmp/scalprum-remote-types-0.1.0.tgz

node testdata/remote-types-integration/test-expose-generated-declarations.mjs \
  --tarball candidate=/tmp/scalprum-remote-types-0.1.0.tgz

node testdata/remote-types-integration/test-native-esm.mjs \
  --tarball candidate=/tmp/scalprum-remote-types-0.1.0.tgz
```

Each runner also accepts the A/B form shown above.

## What each runner does

### Preserve barrel exports

Creates a remote declaration archive containing:

- `Widget.d.ts` with a nested barrel;
- two `export *` targets;
- a `.js` declaration specifier;
- `export { Props } from './types'`;
- default and named runtime exports.

It injects the plugin into the actual production Webpack configuration,
compiles the application, and checks that generated declarations contain all
four exposed keys:

- `integration-remote./Widget`;
- `integration-remote./Widget.runtimeA`;
- `integration-remote./Widget.runtimeB`;
- `integration-remote./Widget.Props`.

### Expose generated declarations

It compiles the actual production Webpack configuration without an explicit
`outputDirectory`, then runs a strict TypeScript consumer through the installed
package entry. The consumer passes invalid props to the default remote
component and must receive `TS2345` or `TS2741`.

The generated file is deliberately not included directly in the TypeScript
project. This proves that the package's type entry exposes it instead of
allowing the consumer to silently fall back to `any`.

### Native ESM exports

It creates a temporary native ESM Webpack configuration importing
`@scalprum/remote-types/webpack`, runs Webpack, and verifies that the plugin
creates its generated declaration output. The generated declaration contents
are checked separately by the barrel-export runner so failures stay isolated.

## Shared execution and cleanup

For each tarball, every runner:

1. installs it with npm without changing app manifests:

   ```sh
   npm install --no-save --package-lock=false <tarball>
   ```

2. uses the real production `insights-chrome` Webpack configuration;
3. continues after issue-stage failures so output and generated declarations
   remain available for diagnosis;
4. restores the original package installation and `package-lock.json`.

The harness uses `finally` cleanup. It removes:

- generated `src/.remote-types-integration/` fixtures;
- temporary `testdata/remote-types-integration/.runtime/` fixtures;
- temporary remote archives and registries;
- the installed `node_modules/@scalprum/remote-types` package;
- generated package-output declarations and scope directories.

The app worktree must be clean outside this harness directory before and after
each run.

The documented `tslib` dependency fix is a package-level concern. This app
already provides `tslib` transitively, so these application-level runners do
not use that dependency as evidence that the package declares it. Validate
that requirement with the package's isolated consumer tests.

See [`RESULTS.md`](./RESULTS.md) for the recorded A/B outputs, exact package
SHAs and tarball hashes, generated declaration differences, failure messages,
and PR #195 commit mapping.
