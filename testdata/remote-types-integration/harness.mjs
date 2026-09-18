import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDirectory, '../..');
export const packageDirectory = join(projectRoot, 'node_modules/@scalprum/remote-types');
const packageLockPath = join(projectRoot, 'package-lock.json');
const sourceRuntimeRoot = join(projectRoot, 'src/.remote-types-integration');
const testRuntimeRoot = join(scriptDirectory, '.runtime');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webpackCommand = join(projectRoot, 'node_modules/.bin/webpack');
const tscCommand = join(projectRoot, 'node_modules/.bin/tsc');
const requireFromProject = createRequire(join(projectRoot, 'package.json'));

export const declarationFiles = {
  'Widget.d.ts': "export * from './nested/barrel.js';\nexport { default } from './nested/barrel.js';\n",
  'nested/barrel.d.ts':
    "export * from './runtime-a';\nexport * from './runtime-b.js';\nexport { Props } from './types';\nexport { default } from './default';\n",
  'nested/runtime-a.d.ts': 'export declare const runtimeA: (props: { id: string }) => string;\n',
  'nested/runtime-b.d.ts': 'export declare const runtimeB: (value: number) => number;\n',
  'nested/types.d.ts': 'export interface Props { id: string; label: string; }\n',
  'nested/default.d.ts': "import type { Props } from './types';\nexport default function Widget(props: Props): string;\n",
};

export function usage(commandName, description) {
  return `${description}

Usage:
  node testdata/remote-types-integration/${commandName} \\
    --tarball baseline=/path/to/pr194.tgz \\
    --tarball candidate=/path/to/pr195.tgz \\
    --expect-pass candidate

Options:
  --tarball [label=]PATH  Install and test a packed package; repeatable.
  --expect-pass LABEL     Require LABEL to pass; repeatable.
  --help                  Show this help.

Without --expect-pass, every tarball must pass. This supports A/B runs where
baseline failures are expected but candidate failures remain blocking.
`;
}

export function parseArguments(argv, commandName, description) {
  const tarballs = [];
  const expectedPass = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      console.log(usage(commandName, description));
      process.exit(0);
    }
    if (argument === '--tarball') {
      const value = argv[++index];
      if (!value) throw new Error('--tarball requires a path or label=path');
      const separator = value.indexOf('=');
      const label = separator === -1 ? `tarball-${tarballs.length + 1}` : value.slice(0, separator);
      const inputPath = separator === -1 ? value : value.slice(separator + 1);
      if (!label || !inputPath) throw new Error(`Invalid --tarball value: ${value}`);
      tarballs.push({ label, path: resolve(projectRoot, inputPath) });
      continue;
    }
    if (argument === '--expect-pass') {
      const label = argv[++index];
      if (!label) throw new Error('--expect-pass requires a tarball label');
      expectedPass.push(label);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage(commandName, description)}`);
  }
  if (!tarballs.length) throw new Error(`At least one --tarball is required\n\n${usage(commandName, description)}`);
  const labels = new Set(tarballs.map(({ label }) => label));
  for (const label of expectedPass) {
    if (!labels.has(label)) throw new Error(`--expect-pass references unknown tarball label: ${label}`);
  }
  return { tarballs, expectedPass };
}

export function runCommand(command, args, options = {}) {
  const { env, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    ...spawnOptions,
  });
  return {
    status: result.status,
    signal: result.signal,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

function nonHarnessStatus(status) {
  return status
    .split('\n')
    .filter((line) => line && !line.includes('testdata/remote-types-integration'))
    .join('\n');
}

export function stage(ok, detail, output = '') {
  return { ok, detail, output };
}

export function skipped(detail) {
  return stage(false, detail);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const contents = await readFile(path);
  return createHash('sha256').update(contents).digest('hex');
}

export async function writeRemoteArchive(root) {
  const AdmZip = requireFromProject('adm-zip');
  const archivePath = join(root, 'types.zip');
  const registryPath = join(root, 'fed-modules.json');
  const archive = new AdmZip();
  for (const [entryName, contents] of Object.entries(declarationFiles)) {
    archive.addFile(entryName, contents);
  }
  archive.writeZip(archivePath);
  await writeFile(registryPath, JSON.stringify({ 'integration-remote': { remoteTypesLocation: 'types.zip' } }));
  return registryPath;
}

function clearPackageRequireCache() {
  const packagePrefix = `${packageDirectory}/`;
  for (const cachedPath of Object.keys(requireFromProject.cache)) {
    if (cachedPath === packageDirectory || cachedPath.startsWith(packagePrefix)) delete requireFromProject.cache[cachedPath];
  }
}

async function cleanupGeneratedPackageFiles() {
  if (!(await pathExists(packageDirectory))) return;
  const manifestPath = join(packageDirectory, '.scalprum-remote-types-scopes.json');
  try {
    const scopes = JSON.parse(await readFile(manifestPath, 'utf8'));
    await Promise.all(scopes.map((scope) => rm(join(packageDirectory, scope), { recursive: true, force: true })));
  } catch {
    // No generated scope manifest.
  }
  await rm(join(packageDirectory, 'generated.d.ts'), { force: true });
  await rm(manifestPath, { force: true });
}

async function installPackage(tarballPath) {
  await rm(packageDirectory, { recursive: true, force: true });
  clearPackageRequireCache();
  const result = runCommand(npmCommand, ['install', '--no-save', '--package-lock=false', tarballPath]);
  if (result.status !== 0) return stage(false, `npm install exited ${result.status}`, result.output);
  return stage(true, 'npm install --no-save passed', result.output);
}

function runWebpackCompiler(config) {
  const webpack = requireFromProject('webpack');
  return new Promise((resolveResult) => {
    let compiler;
    try {
      compiler = webpack(config);
    } catch (error) {
      resolveResult(stage(false, 'Webpack compiler construction failed', error.stack || String(error)));
      return;
    }
    compiler.run((error, stats) => {
      compiler.close((closeError) => {
        if (error || closeError) {
          resolveResult(stage(false, 'Webpack execution failed', (error || closeError).stack || String(error || closeError)));
          return;
        }
        const output = stats?.toString({ preset: 'errors-warnings', colors: false }) || '';
        if (stats?.hasErrors()) {
          resolveResult(stage(false, 'Webpack reported errors', output));
          return;
        }
        resolveResult(stage(true, 'Webpack compilation passed', output));
      });
    });
  });
}

async function createAppProductionConfig(pluginOptions) {
  const configPath = join(projectRoot, 'config/webpack.config.js');
  delete requireFromProject.cache[requireFromProject.resolve(configPath)];
  const webpackConfigFactory = requireFromProject(configPath);
  const configs = webpackConfigFactory({ analyze: 'false' });
  const mainConfig = configs.find((config) => config.plugins?.some((plugin) => plugin.constructor?.name === 'ModuleFederationPlugin'));
  if (!mainConfig) throw new Error('Could not identify the main insights-chrome Webpack configuration');
  const { ScalprumRemoteTypesPlugin } = requireFromProject('@scalprum/remote-types/webpack');
  mainConfig.plugins.unshift(new ScalprumRemoteTypesPlugin(pluginOptions));
  return configs;
}

export async function runAppProductionBuild(registryPath, outputDirectory) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const configs = await createAppProductionConfig({
      modulesConfigLocations: [{ scope: 'integration-remote', location: registryPath }],
      ...(outputDirectory ? { outputDirectory } : {}),
    });
    return await runWebpackCompiler(configs);
  } catch (error) {
    return stage(false, 'Could not create the application production configuration', error.stack || String(error));
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

function expectedDeclarationChecks(contents) {
  const scope = 'integration-remote';
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const checks = [
    ['default export', new RegExp(`"${escapedScope}\\.\\/Widget":\\s+typeof\\s+RemoteModule\\d+\\.default;`)],
    ['runtimeA named export', new RegExp(`"${escapedScope}\\.\\/Widget\\.runtimeA":\\s+typeof\\s+RemoteModule\\d+\\.runtimeA;`)],
    ['runtimeB named export', new RegExp(`"${escapedScope}\\.\\/Widget\\.runtimeB":\\s+typeof\\s+RemoteModule\\d+\\.runtimeB;`)],
    ['Props named type export', new RegExp(`"${escapedScope}\\.\\/Widget\\.Props":\\s+RemoteModule\\d+\\.Props;`)],
  ];
  const results = checks.map(([name, pattern]) => ({ name, ok: pattern.test(contents) }));
  return {
    ok: results.every(({ ok }) => ok),
    detail: results.map(({ name, ok }) => `${ok ? 'PASS' : 'FAIL'} ${name}`).join('\n'),
  };
}

export async function readGeneratedFile(directory) {
  const generatedPath = join(directory, 'generated.d.ts');
  if (!(await pathExists(generatedPath))) return { stage: stage(false, 'generated.d.ts was not created'), contents: '', path: generatedPath };
  const contents = await readFile(generatedPath, 'utf8');
  return {
    stage: stage(true, 'generated.d.ts was created'),
    contents,
    path: generatedPath,
  };
}

export async function readGeneratedDeclarations(directory) {
  const generated = await readGeneratedFile(directory);
  if (!generated.stage.ok) return generated;
  const checks = expectedDeclarationChecks(generated.contents);
  return {
    ...generated,
    stage: stage(checks.ok, checks.detail),
  };
}

export async function runInvalidPropsTypeScript(runtimeDirectory) {
  const invalidPath = join(runtimeDirectory, 'invalid.ts');
  const configPath = join(runtimeDirectory, 'tsconfig.invalid.json');
  await writeFile(
    invalidPath,
    `import type { RemoteType } from '@scalprum/remote-types';

type Widget = RemoteType<'integration-remote', './Widget'>;
const widget = null as unknown as Widget;
widget({ id: 'missing-label' });
`
  );
  await writeFile(
    configPath,
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          skipLibCheck: false,
          types: [],
        },
        files: [invalidPath],
      },
      null,
      2
    )
  );
  const result = runCommand(tscCommand, ['-p', configPath, '--pretty', 'false']);
  const hasPropsDiagnostic = /TS2345|TS2741/.test(result.output);
  return stage(
    result.status !== 0 && hasPropsDiagnostic,
    `tsc invalid consumer exited ${result.status}${hasPropsDiagnostic ? ' with props diagnostic' : ' without props diagnostic'}`,
    result.output
  );
}

export async function runNativeEsmWebpack(runtimeDirectory, registryPath) {
  const entryPath = join(runtimeDirectory, 'entry.js');
  const configPath = join(runtimeDirectory, 'webpack.config.mjs');
  const generatedDirectory = join(runtimeDirectory, 'esm-generated');
  await writeFile(entryPath, 'export default 42;\n');
  await writeFile(
    configPath,
    `import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScalprumRemoteTypesPlugin } from '@scalprum/remote-types/webpack';

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = ${JSON.stringify(projectRoot)};

export default {
  mode: 'production',
  context: projectRoot,
  entry: path.join(fixtureRoot, 'entry.js'),
  output: { path: path.join(fixtureRoot, 'esm-dist'), filename: 'bundle.js', clean: true },
  plugins: [
    new ScalprumRemoteTypesPlugin({
      modulesConfigLocations: [{ scope: 'integration-remote', location: ${JSON.stringify(registryPath)} }],
      outputDirectory: ${JSON.stringify(generatedDirectory)},
    }),
  ],
};
`
  );
  const result = runCommand(webpackCommand, ['--config', configPath], { env: { NODE_ENV: 'production' } });
  const commandStage = stage(result.status === 0, `native ESM Webpack exited ${result.status}`, result.output);
  if (!commandStage.ok) return { command: commandStage, generated: skipped('ESM Webpack did not complete'), generatedContents: '' };
  const generated = await readGeneratedFile(generatedDirectory);
  return { command: commandStage, generated: generated.stage, generatedContents: generated.contents };
}

async function cleanRuntime() {
  await rm(sourceRuntimeRoot, { recursive: true, force: true });
  await rm(testRuntimeRoot, { recursive: true, force: true });
}

function printStage(label, value) {
  console.log(`  ${value.ok ? 'PASS' : 'FAIL'} ${label}: ${value.detail}`);
  if (!value.ok && value.output) console.log(`    ${value.output.replaceAll('\n', '\n    ')}`);
}

function printResult(issueName, result, expected) {
  console.log(`\n=== ${issueName}: ${result.label} ===`);
  console.log(`tarball: ${result.tarball}`);
  console.log(`sha256:  ${result.sha256}`);
  for (const { label, value } of result.stages) printStage(label, value);
  for (const { label, contents } of result.artifacts) {
    if (!contents) continue;
    console.log(`--- ${label} ---`);
    console.log(contents.trim());
    console.log(`--- end ${label} ---`);
  }
  console.log(`overall: ${result.overall ? 'PASS' : expected ? 'FAIL (required)' : 'FAIL (reported)'}`);
}

export async function runIssue({ argv, commandName, description, issueName, run }) {
  const { tarballs, expectedPass } = parseArguments(argv, commandName, description);
  const initialStatus = runCommand('git', ['status', '--porcelain']);
  if (initialStatus.status !== 0) throw new Error(`Could not inspect git status: ${initialStatus.output}`);
  const initialNonHarnessStatus = nonHarnessStatus(initialStatus.output);
  if (initialNonHarnessStatus) throw new Error(`Harness requires a clean worktree outside its own directory; found:\n${initialNonHarnessStatus}`);
  for (const tarball of tarballs) {
    if (!existsSync(tarball.path)) throw new Error(`Tarball does not exist: ${tarball.path}`);
  }

  const originalPackageBackupRoot = await mkdtemp(join(tmpdir(), 'remote-types-package-backup-'));
  const originalPackageBackup = join(originalPackageBackupRoot, 'remote-types');
  const packageWasPresent = await pathExists(packageDirectory);
  const packageLockBefore = await readFile(packageLockPath).catch(() => null);
  const archiveRoot = await mkdtemp(join(tmpdir(), 'remote-types-integration-'));
  const results = [];
  const originalCwd = process.cwd();
  try {
    if (packageWasPresent) await rename(packageDirectory, originalPackageBackup);
    process.chdir(projectRoot);
    await cleanRuntime();
    await mkdir(testRuntimeRoot, { recursive: true });
    await mkdir(sourceRuntimeRoot, { recursive: true });
    for (const [index, tarball] of tarballs.entries()) {
      const slug = `${String(index + 1).padStart(2, '0')}-${tarball.label.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const runtimeDirectory = join(testRuntimeRoot, slug);
      const sourceDirectory = join(sourceRuntimeRoot, slug);
      const registryPath = await writeRemoteArchive(archiveRoot);
      await mkdir(runtimeDirectory, { recursive: true });
      await mkdir(sourceDirectory, { recursive: true });
      const result = {
        label: tarball.label,
        tarball: tarball.path,
        sha256: await sha256(tarball.path),
        stages: [],
        artifacts: [],
        overall: false,
      };
      try {
        const install = await installPackage(tarball.path);
        result.stages.push({ label: 'npm install', value: install });
        if (!install.ok) {
          result.stages.push({ label: issueName, value: skipped('Package installation failed') });
        } else {
          const outcome = await run({
            tarball,
            registryPath,
            runtimeDirectory,
            sourceDirectory,
          });
          result.stages.push(...outcome.stages.map(([label, value]) => ({ label, value })));
          result.artifacts = outcome.artifacts || [];
        }
      } catch (error) {
        result.stages.push({ label: issueName, value: stage(false, `${issueName} threw an exception`, error.stack || String(error)) });
      }
      result.overall = result.stages.every(({ value }) => value.ok);
      results.push(result);
      await cleanRuntime();
      await mkdir(testRuntimeRoot, { recursive: true });
      await mkdir(sourceRuntimeRoot, { recursive: true });
      await cleanupGeneratedPackageFiles();
    }
  } finally {
    await cleanRuntime();
    await rm(packageDirectory, { recursive: true, force: true });
    if (packageWasPresent) {
      await mkdir(dirname(packageDirectory), { recursive: true });
      await rename(originalPackageBackup, packageDirectory);
    }
    await rm(archiveRoot, { recursive: true, force: true });
    if (packageLockBefore) await writeFile(packageLockPath, packageLockBefore);
    else await rm(packageLockPath, { force: true });
    process.chdir(originalCwd);
    await rm(originalPackageBackupRoot, { recursive: true, force: true });
  }

  for (const result of results) printResult(issueName, result, expectedPass.includes(result.label));
  const requiredLabels = expectedPass.length ? [...new Set(expectedPass)] : tarballs.map(({ label }) => label);
  const success = requiredLabels.every((label) => results.find((result) => result.label === label)?.overall);
  const finalStatus = runCommand('git', ['status', '--porcelain']);
  const finalNonHarnessStatus = nonHarnessStatus(finalStatus.output);
  if (finalNonHarnessStatus) {
    console.error(`\nHarness cleanup failed; worktree is dirty outside its own directory:\n${finalNonHarnessStatus}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nRequired result: ${success ? 'PASS' : 'FAIL'}`);
  process.exitCode = success ? 0 : 1;
}
