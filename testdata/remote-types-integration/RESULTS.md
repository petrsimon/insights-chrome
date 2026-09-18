# PR #194 versus PR #195 results

Recorded with the parameterized harness in [`run-integration.mjs`](./run-integration.mjs).

## Inputs

| Label       | Package worktree/branch                                                           | Tested commit                              | Tarball                                                       | SHA-256                                                            |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `baseline`  | `scaffolding.test-remote-types-pr194-control` / `test/remote-types-pr194-control` | `86f46581f6f4e48c8967f473fca2cea16e26aa89` | `/tmp/scalprum-pr194-control/scalprum-remote-types-0.1.0.tgz` | `fa392fed336228a4b947390dae25f8fd307e6067bc7314c002994b01b277444c` |
| `candidate` | `scaffolding.review-pr-194` / `review/pr-194`                                     | `29da3175a41328abee16f52dff5af09105981a33` | `/tmp/scalprum-remote-types-0.1.0.tgz`                        | `89b6396d9d8c4286b60f5359c899fed3514120994a6e860a4a697c0ee4282b35` |

The existing candidate worktree was clean and already pushed. It was not
modified. The baseline was built in its separate control worktree and was not
pushed.

The application harness ran with Node `22.23.1` and npm `10.9.8`. The baseline
package worktree was installed and built using its required Node 24 toolchain.

## Matrix

| Check                                         | PR #194 (`86f4658`)              | PR #195 (`29da317`) |
| --------------------------------------------- | -------------------------------- | ------------------- |
| Packed `npm install --no-save`                | Pass                             | Pass                |
| Actual production `insights-chrome` Webpack   | Pass                             | Pass                |
| Nested-barrel generated declarations          | **Fail**                         | Pass                |
| Strict valid TypeScript, `skipLibCheck=false` | Exit 0, partly vacuous           | Pass                |
| Explicit generated invalid-props diagnostic   | Pass                             | Pass                |
| Default-output invalid-props diagnostic       | **Exit 0, no diagnostic**        | Pass, exit 2        |
| Native ESM Webpack entry                      | **Fail, `ERR_MODULE_NOT_FOUND`** | Pass                |
| Native ESM generated declarations             | Not reached                      | Pass                |

The invalid default-props check still passed for PR #194 when the generated
file was explicitly included because its default export remained typed. The
missing named entries fell back to `any`; the default-output control exposed
that package consumers silently lost the generated augmentation.

## Generated declaration difference

PR #194 emitted an incorrect nested module and only one named runtime entry:

```ts
import type * as RemoteModule0 from './integration-remote/nested/barrel';
import type * as RemoteModule1 from './integration-remote/Widget';

declare module '@scalprum/remote-types' {
  interface RemoteTypes {
    'integration-remote./nested/barrel.runtimeA': typeof RemoteModule0.runtimeA;
    'integration-remote./Widget': typeof RemoteModule1.default;
  }
}

export {};
```

Missing from PR #194:

- `integration-remote./Widget.runtimeA` under the exposed module;
- `integration-remote./Widget.runtimeB` from the second `export *` target;
- `integration-remote./Widget.Props` from the named type re-export.

PR #195 emitted the expected single exposed-module import:

```ts
import type * as RemoteModule0 from './integration-remote/Widget';

declare module '@scalprum/remote-types' {
  interface RemoteTypes {
    'integration-remote./Widget.runtimeA': typeof RemoteModule0.runtimeA;
    'integration-remote./Widget.runtimeB': typeof RemoteModule0.runtimeB;
    'integration-remote./Widget.Props': RemoteModule0.Props;
    'integration-remote./Widget': typeof RemoteModule0.default;
  }
}

export {};
```

## Native ESM failure

PR #194's native ESM Webpack stage failed before compilation:

```text
[webpack-cli] Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../node_modules/@scalprum/remote-types/esm/plugin'
imported from
'.../node_modules/@scalprum/remote-types/esm/webpack.js'
```

The failing import had no `.js` specifier. PR #195 also packages the ESM
subtree with the required module metadata.

## Default-output silent-any failure

With `outputDirectory` omitted, both versions generated a file under the
package's default output directory. PR #194 did not expose that generated file
through the package type entry:

```text
default-output invalid-props tsc: exit 0
(no diagnostic)
```

PR #195 produced the expected diagnostic:

```text
testdata/remote-types-default-output-control/invalid.ts(4,8): error TS2345: Argument of type '{ id: string; }' is not assignable to parameter of type 'Props'.
  Property 'label' is missing in type '{ id: string; }' but required in type 'Props'.
```

## PR #195 commit mapping

| Commit                                                                   | Validation supplied by this A/B run                                                                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `6b6b29e` — `fix(@scalprum/remote-types): load native ESM exports`       | Fixes the direct PR #194 native ESM `ERR_MODULE_NOT_FOUND`. Adds ESM package metadata and `.js` internal imports.                                                             |
| `a6d1d18` — `fix(@scalprum/remote-types): expose generated declarations` | Fixes the default-output silent-any result. Makes generated declarations reachable through the package type entry.                                                            |
| `24daf37` — `fix(@scalprum/remote-types): preserve barrel exports`       | Fixes nested-barrel leakage, `.js` declaration resolution, both `export *` targets, and named type re-export traversal.                                                       |
| `2e5e6a9` — `fix(@scalprum/remote-types): declare tslib dependency`      | Packaging fix not reproduced by this application because `insights-chrome` already has `tslib` available transitively. Required for a clean consumer without that dependency. |
| `d17ae9e` — `test(@scalprum/remote-types): cover package regressions`    | Adds regression coverage; no runtime behavior change. Baseline package had 8 tests; candidate package had 12.                                                                 |
| `29da317` — `docs(@scalprum/remote-types): correct test instructions`    | Documentation-only change.                                                                                                                                                    |

## Final state

The harness removed all generated fixtures and the temporary package install.
The app integration worktree returned clean. No scaffolding worktree was
modified, reset, committed, pushed, or deleted.
