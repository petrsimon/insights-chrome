# `@scalprum/remote-types` real-consumer integration

This harness tests a packed `@scalprum/remote-types` package inside the real
`insights-chrome` application. It is an application-level control, not a
compiler-API or package-unit-test substitute.

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

`--tarball` is repeatable. Values may be plain paths or `label=path` values.
`--expect-pass` identifies the tarball(s) that must pass overall. Without it,
every tarball must pass. This allows a known-broken baseline to be reported
without hiding a candidate failure.

Single-package run:

```sh
node testdata/remote-types-integration/run-integration.mjs \
  --tarball candidate=/tmp/scalprum-remote-types-0.1.0.tgz
```

## What the harness does

For each tarball, sequentially:

1. Installs it with npm without changing app manifests:

   ```sh
   npm install --no-save --package-lock=false <tarball>
   ```

2. Creates a temporary remote-types archive and registry containing:
   - `Widget.d.ts` with nested barrel exports;
   - two `export *` targets;
   - a `.js` declaration specifier;
   - `export { Props } from './types'`;
   - default and named runtime exports.
3. Injects `ScalprumRemoteTypesPlugin` into the actual production
   `config/webpack.config.js` returned by `insights-chrome`.
4. Compiles the real production Webpack configuration and checks generated
   declarations for default, `runtimeA`, `runtimeB`, and `Props` entries.
5. Runs strict consumer checks with `skipLibCheck: false`:
   - valid default/named runtime/type usage must compile;
   - an invalid default-component props call must produce `TS2345` or `TS2741`.
6. Runs a second production Webpack compilation with the plugin's default
   output directory (`node_modules/@scalprum/remote-types`) and checks that
   generated declarations are visible through the package entry.
7. Runs Webpack through a temporary native ESM config importing
   `@scalprum/remote-types/webpack`, then repeats generated-key checks.
8. Continues after stage failures and prints stage output plus generated
   declaration files. The process exits nonzero only when a required
   `--expect-pass` tarball fails.

## Cleanup behavior

The harness uses `finally` cleanup. It removes:

- generated `src/.remote-types-integration/` fixtures;
- temporary `testdata/remote-types-integration/.runtime/` fixtures;
- temporary remote archives and registries;
- the installed `node_modules/@scalprum/remote-types` package;
- generated package-output declarations and scope directories.

If a package was already installed before the run, it is moved to a temporary
backup and restored afterward. The original `package-lock.json` is restored if
npm changes it unexpectedly. The app worktree must be clean outside this
harness directory before and after the run.

## Interpreting results

A healthy candidate shows `PASS` for:

- actual app production Webpack;
- all four generated declaration keys;
- strict valid TypeScript;
- intentional invalid-props TypeScript;
- default-output invalid-props TypeScript;
- native ESM Webpack and its generated declarations.

A baseline may intentionally show failures. In the PR #194/PR #195 run,
`baseline` is diagnostic-only and `candidate` is required to pass.

See [`RESULTS.md`](./RESULTS.md) for the recorded A/B outputs, exact package
SHAs and tarball hashes, generated declaration differences, failure messages,
and PR #195 commit mapping.
