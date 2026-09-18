#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const packageDirectory = join(projectRoot, 'node_modules/@scalprum/remote-types');
const packageLockPath = join(projectRoot, 'package-lock.json');
const sourceRuntimeRoot = join(projectRoot, 'src/.remote-types-integration');
const testRuntimeRoot = join(scriptDirectory, '.runtime');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webpackCommand = join(projectRoot, 'node_modules/.bin/webpack');
const tscCommand = join(projectRoot, 'node_modules/.bin/tsc');
const requireFromProject = createRequire(join(projectRoot, 'package.json'));

const declarationFiles = {
  'Widget.d.ts': "export * from './nested/barrel.js';\nexport { default } from './nested/barrel.js';\n",
  'nested/barrel.d.ts':
    "export * from './runtime-a';\nexport * from './runtime-b.js';\nexport { Props } from './types';\nexport { default } from './default';\n",
  'nested/runtime-a.d.ts': 'export declare const runtimeA: (props: { id: string }) => string;\n',
  'nested/runtime-b.d.ts': 'export declare const runtimeB: (value: number) => number;\n',
  'nested/types.d.ts': 'export interface Props { id: string; label: string; }\n',
  'nested/default.d.ts': "import type { Props } from './types';\nexport default function Widget(props: Props): string;\n",
};

function usage() {
  return `Usage:
  node testdata/remote-types-integration/run-integration.mjs \\
    --tarball baseline=/path/to/pr194.tgz \\
    --tarball candidate=/path/to/pr195.tgz \\
    --expect-pass candidate

Options:
  --tarball [label=]PATH  Install and test a packed package; repeatable.
  --expect-pass LABEL     Require LABEL to pass overall; repeatable.
  --help                  Show this help.

Without --expect-pass, every tarball must pass. This supports A/B runs where
baseline failures are expected but candidate must pass.
`;
}

function parseArguments(argv) {
  const tarballs = [];
  const expectedPass = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      console.log(usage());
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
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  if (!tarballs.length) throw new Error(`At least one --tarball is required\n\n${usage()}`);
  const labels = new Set(tarballs.map(({ label }) => label));
  for (const label of expectedPass) {
    if (!labels.has(label)) throw new Error(`--expect-pass references unknown tarball label: ${label}`);
  }
  return { tarballs, expectedPass };
}

function sanitizeLabel(label) {
  return label.replace(/[^A-Za-z0-9_-]/g, '-');
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
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

function stage(ok, detail, output = '') {
  return { ok, detail, output };
}

function skipped(detail) {
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

async function writeRemoteArchive(root) {
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

async function runAppProductionBuild(registryPath, outputDirectory) {
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
  const escapedScope = scope.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
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

async function readGeneratedDeclarations(directory, label) {
  const generatedPath = join(directory, 'generated.d.ts');
  if (!(await pathExists(generatedPath))) return { stage: stage(false, 'generated.d.ts was not created'), contents: '' };
  const contents = await readFile(generatedPath, 'utf8');
  const checks = expectedDeclarationChecks(contents);
  return {
    stage: stage(checks.ok, checks.detail),
    contents,
    path: generatedPath,
    label,
  };
}

function writeConsumerFixtures(runtimeDirectory, generatedPath) {
  const validPath = join(runtimeDirectory, 'valid.ts');
  const invalidPath = join(runtimeDirectory, 'invalid.ts');
  const tsconfigPath = join(runtimeDirectory, 'tsconfig.json');
  const invalidConfigPath = join(runtimeDirectory, 'tsconfig.invalid.json');
  const validContents = `import type { RemoteType } from '@scalprum/remote-types';

type Widget = RemoteType<'integration-remote', './Widget'>;
type RuntimeA = RemoteType<'integration-remote', './Widget', 'runtimeA'>;
type RuntimeB = RemoteType<'integration-remote', './Widget', 'runtimeB'>;
type Props = RemoteType<'integration-remote', './Widget', 'Props'>;

const widget = null as unknown as Widget;
const runtimeA = null as unknown as RuntimeA;
const runtimeB = null as unknown as RuntimeB;
const props: Props = { id: 'id', label: 'label' };
const widgetResult: string = widget(props);
const runtimeAResult: string = runtimeA({ id: props.id });
const runtimeBResult: number = runtimeB(1);

export { widgetResult, runtimeAResult, runtimeBResult };
`;
  const invalidContents = `import type { RemoteType } from '@scalprum/remote-types';

type Widget = RemoteType<'integration-remote', './Widget'>;
const widget = null as unknown as Widget;
widget({ id: 'missing-label' });
`;
  return {
    validPath,
    invalidPath,
    tsconfigPath,
    invalidConfigPath,
    validContents,
    invalidContents,
    generatedPath,
  };
}

async function runTypeScriptChecks(runtimeDirectory, generatedPath, includeGenerated) {
  const fixtures = writeConsumerFixtures(runtimeDirectory, generatedPath);
  await writeFile(fixtures.validPath, fixtures.validContents);
  await writeFile(fixtures.invalidPath, fixtures.invalidContents);
  await writeFile(
    fixtures.tsconfigPath,
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
        files: includeGenerated ? [generatedPath, fixtures.validPath] : [fixtures.validPath],
      },
      null,
      2
    )
  );
  const valid = runCommand(tscCommand, ['-p', fixtures.tsconfigPath, '--pretty', 'false']);
  const validStage = stage(valid.status === 0, `tsc valid consumer exited ${valid.status}`, valid.output);
  await writeFile(
    fixtures.invalidConfigPath,
    JSON.stringify(
      {
        extends: fixtures.tsconfigPath,
        files: includeGenerated ? [generatedPath, fixtures.invalidPath] : [fixtures.invalidPath],
      },
      null,
      2
    )
  );
  const invalid = runCommand(tscCommand, ['-p', fixtures.invalidConfigPath, '--pretty', 'false']);
  const hasPropsDiagnostic = /TS2345|TS2741/.test(invalid.output);
  const invalidStage = stage(
    invalid.status !== 0 && hasPropsDiagnostic,
    `tsc invalid consumer exited ${invalid.status}${hasPropsDiagnostic ? ' with props diagnostic' : ' without props diagnostic'}`,
    invalid.output
  );
  return { valid: validStage, invalid: invalidStage, invalidOutput: invalid.output };
}

async function runNativeEsmWebpack(runtimeDirectory, registryPath) {
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
  const result = runCommand(webpackCommand, ['--config', configPath], { NODE_ENV: 'production' });
  const commandStage = stage(result.status === 0, `native ESM Webpack exited ${result.status}`, result.output);
  if (!commandStage.ok) return { command: commandStage, generated: skipped('ESM Webpack did not complete') };
  const generated = await readGeneratedDeclarations(generatedDirectory, 'native ESM');
  return { command: commandStage, generated: generated.stage };
}

async function runTarball(tarball, archiveRoot, index) {
  const slug = `${String(index + 1).padStart(2, '0')}-${sanitizeLabel(tarball.label)}`;
  const runtimeDirectory = join(testRuntimeRoot, slug);
  const sourceDirectory = join(sourceRuntimeRoot, slug);
  const registryPath = await writeRemoteArchive(archiveRoot);
  const result = {
    label: tarball.label,
    tarball: tarball.path,
    sha256: await sha256(tarball.path),
    install: null,
    production: null,
    generated: null,
    validTypeScript: null,
    invalidTypeScript: null,
    defaultProduction: null,
    defaultOutputInvalidTypeScript: null,
    nativeEsmCommand: null,
    nativeEsmGenerated: null,
    generatedContents: '',
    defaultGeneratedContents: '',
    overall: false,
  };
  await mkdir(runtimeDirectory, { recursive: true });
  await mkdir(sourceDirectory, { recursive: true });
  result.install = await installPackage(tarball.path);
  if (!result.install.ok) {
    result.production = skipped('Package installation failed');
    result.generated = skipped('Package installation failed');
    result.validTypeScript = skipped('Package installation failed');
    result.invalidTypeScript = skipped('Package installation failed');
    result.defaultProduction = skipped('Package installation failed');
    result.defaultOutputInvalidTypeScript = skipped('Package installation failed');
    result.nativeEsmCommand = skipped('Package installation failed');
    result.nativeEsmGenerated = skipped('Package installation failed');
    return result;
  }

  const generatedDirectory = join(sourceDirectory, 'generated');
  await writeFile(join(sourceDirectory, 'consumer.ts'), writeConsumerFixtures(runtimeDirectory, join(generatedDirectory, 'generated.d.ts')).validContents);
  result.production = await runAppProductionBuild(registryPath, generatedDirectory);
  const generated = await readGeneratedDeclarations(generatedDirectory, 'CJS application');
  result.generated = generated.stage;
  result.generatedContents = generated.contents;
  if (generated.contents) {
    const typeChecks = await runTypeScriptChecks(runtimeDirectory, generated.path, true);
    result.validTypeScript = typeChecks.valid;
    result.invalidTypeScript = typeChecks.invalid;
  } else {
    result.validTypeScript = skipped('Generated declarations unavailable');
    result.invalidTypeScript = skipped('Generated declarations unavailable');
  }

  await rm(sourceRuntimeRoot, { recursive: true, force: true });
  await cleanupGeneratedPackageFiles();
  result.defaultProduction = await runAppProductionBuild(registryPath);
  const defaultGeneratedPath = join(packageDirectory, 'generated.d.ts');
  if (await pathExists(defaultGeneratedPath)) result.defaultGeneratedContents = await readFile(defaultGeneratedPath, 'utf8');
  const defaultTypes = await runTypeScriptChecks(runtimeDirectory, defaultGeneratedPath, false);
  result.defaultOutputInvalidTypeScript = defaultTypes.invalid;

  const esm = await runNativeEsmWebpack(runtimeDirectory, registryPath);
  result.nativeEsmCommand = esm.command;
  result.nativeEsmGenerated = esm.generated;
  result.overall = [
    result.production,
    result.generated,
    result.validTypeScript,
    result.invalidTypeScript,
    result.defaultProduction,
    result.defaultOutputInvalidTypeScript,
    result.nativeEsmCommand,
    result.nativeEsmGenerated,
  ].every((check) => check?.ok);
  return result;
}

function printStage(label, value) {
  console.log(`  ${value.ok ? 'PASS' : 'FAIL'} ${label}: ${value.detail}`);
  if (!value.ok && value.output) console.log(`    ${value.output.replaceAll('\n', '\n    ')}`);
}

function printResult(result, expected) {
  console.log(`\n=== ${result.label} ===`);
  console.log(`tarball: ${result.tarball}`);
  console.log(`sha256:  ${result.sha256}`);
  printStage('npm install', result.install);
  printStage('actual app production Webpack', result.production);
  printStage('generated declarations', result.generated);
  printStage('strict valid TypeScript', result.validTypeScript);
  printStage('intentional invalid-props TypeScript', result.invalidTypeScript);
  printStage('default-output production Webpack', result.defaultProduction);
  printStage('default-output invalid-props TypeScript', result.defaultOutputInvalidTypeScript);
  printStage('native ESM Webpack command', result.nativeEsmCommand);
  printStage('native ESM generated declarations', result.nativeEsmGenerated);
  if (result.generatedContents) {
    console.log('--- generated.d.ts ---');
    console.log(result.generatedContents.trim());
    console.log('--- end generated.d.ts ---');
  }
  if (result.defaultGeneratedContents) {
    console.log('--- default package generated.d.ts ---');
    console.log(result.defaultGeneratedContents.trim());
    console.log('--- end default package generated.d.ts ---');
  }
  console.log(`overall: ${result.overall ? 'PASS' : expected ? 'FAIL (required)' : 'FAIL (reported)'}`);
}

async function main() {
  const { tarballs, expectedPass } = parseArguments(process.argv.slice(2));
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
    await rm(testRuntimeRoot, { recursive: true, force: true });
    await rm(sourceRuntimeRoot, { recursive: true, force: true });
    await mkdir(testRuntimeRoot, { recursive: true });
    await mkdir(sourceRuntimeRoot, { recursive: true });
    for (const [index, tarball] of tarballs.entries()) {
      const result = await runTarball(tarball, archiveRoot, index);
      results.push(result);
      await rm(sourceRuntimeRoot, { recursive: true, force: true });
      await rm(testRuntimeRoot, { recursive: true, force: true });
      await mkdir(testRuntimeRoot, { recursive: true });
      await mkdir(sourceRuntimeRoot, { recursive: true });
      await cleanupGeneratedPackageFiles();
    }
  } finally {
    await rm(sourceRuntimeRoot, { recursive: true, force: true });
    await rm(testRuntimeRoot, { recursive: true, force: true });
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

  for (const result of results) printResult(result, expectedPass.includes(result.label));
  const requiredLabels = expectedPass.length ? expectedPass : tarballs.map(({ label }) => label);
  const requiredResults = results.filter(({ label }) => requiredLabels.includes(label));
  const success = requiredResults.length === requiredLabels.length && requiredResults.every(({ overall }) => overall);
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

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
