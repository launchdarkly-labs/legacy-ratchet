import { Command, CommanderError } from 'commander';
import { baselineCreateCommand, baselineMigrateCommand, baselineUpdateCommand, baselineVerifyCommand } from './commands/baseline.js';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { reportCommand } from './commands/report.js';
import { scanCommand } from './commands/scan.js';
import { validateCommand } from './commands/validate.js';
import { addEngineOptions } from './engine-options.js';
import { reportError } from './errors.js';
import { depcruisePluginPathCommand } from './commands/plugin-path.js';
import { defaultIo, type Io } from './io.js';
import { CLI_VERSION } from './version.js';

export { CLI_VERSION } from './version.js';
export { CliError } from './errors.js';
export type { Io, Env } from './io.js';
export type { GlobalOptions } from './load.js';
export { initCommand, type InitOptions } from './commands/init.js';
export { validateCommand, type ValidateOptions } from './commands/validate.js';
export { scanCommand, type ScanOptions } from './commands/scan.js';
export {
  baselineCreateCommand,
  baselineMigrateCommand,
  baselineUpdateCommand,
  baselineVerifyCommand,
  type BaselineCreateOptions,
  type BaselineMigrateOptions,
  type BaselineUpdateOptions,
  type BaselineVerifyOptions,
} from './commands/baseline.js';
export { checkCommand, type CheckOptions, type CheckFormat } from './commands/check.js';
export { reportCommand, type ReportOptions } from './commands/report.js';
export { depcruisePluginPathCommand, depcruisePluginPath } from './commands/plugin-path.js';
export type { EngineFlags } from './engine-options.js';
export { scanProject, type Engine, type EngineOptions, type ProjectScan, type ScanProjectOptions } from './project.js';
export { buildCheckOutcome, type CheckInput } from './outcome.js';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export async function run(argv: string[], io: Io = defaultIo()): Promise<number> {
  let exitCode = 0;
  const action =
    <O>(fn: (options: O, io: Io) => Promise<number>) =>
    async (...args: unknown[]): Promise<void> => {
      const command = args[args.length - 1] as Command;
      exitCode = await fn(command.optsWithGlobals() as O, io);
    };

  const program = new Command('migration-tracker')
    .description('Make dependency migrations declarative and enforceable.')
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.stdout(s),
      writeErr: (s) => io.stderr(s),
    })
    .version(CLI_VERSION, '-V, --version', 'print the CLI version')
    .option('--root <dir>', 'repository root (default: current directory)')
    .option('--config <path>', 'config file (default: <root>/migrations.json)')
    .option('--no-color', 'disable colored output')
    .option('--quiet', 'only print violations and errors');

  program
    .command('init')
    .description('create migrations.json and .migrations/README.md')
    .option('--force', 'overwrite an existing migrations.json')
    .action(action(initCommand));

  program.command('validate').description('validate migrations.json').action(action(validateCommand));

  addEngineOptions(program
    .command('scan')
    .description('list legacy import sites')
    .option('--format <format>', 'text or json', 'text')
    .option('--output <file>', 'write output to a file')
    .option('--ignore <glob>', 'additional ignore glob (repeatable)', collect, [])
    .option('--changed-since <ref>', 'only scan files changed since a git ref'))
    .action(action(scanCommand));

  const baseline = program.command('baseline').description('manage .migrations/baseline.json');
  addEngineOptions(baseline
    .command('create')
    .description('grandfather all current legacy import sites')
    .option('--force', 'overwrite an existing baseline'))
    .action(action(baselineCreateCommand));
  addEngineOptions(baseline
    .command('update')
    .description('remove retired sites from the baseline (never adds)'))
    .action(action(baselineUpdateCommand));
  addEngineOptions(baseline
    .command('migrate')
    .description('upgrade a schemaVersion 1 baseline to file-level site ids'))
    .action(action(baselineMigrateCommand));
  baseline
    .command('verify')
    .description('fail if the baseline gained allowances since a git ref')
    .requiredOption('--base <ref>', 'git ref to compare against')
    .action(action(baselineVerifyCommand));

  addEngineOptions(program
    .command('check')
    .description('fail on newly introduced legacy imports')
    .option('--format <format>', 'text, json, markdown or github', 'text')
    .option('--output <file>', 'write output to a file')
    .option('--changed-since <ref>', 'only check files changed since a git ref')
    .option('--base <ref>', 'also verify the baseline gained no allowances since a git ref'))
    .action(action(checkCommand));

  addEngineOptions(program
    .command('report')
    .description('build an HTML or JSON report')
    .option('--format <format>', 'html or json', 'html')
    .option('--output <file>', 'output file (html default: migration-report.html)')
    .option('--append-history', 'append a snapshot to the history file')
    .option('--history <path>', 'history file to read and append to (default: <root>/.migrations/history.jsonl)')
    .option('--source-url <template>', 'source link template with {sha}, {path} and {line}, stored in the report')
    .option('--codeowners <path>', 'CODEOWNERS file (default: .github/CODEOWNERS, CODEOWNERS or docs/CODEOWNERS under --root)')
    .option('--no-codeowners', 'do not read a CODEOWNERS file'))
    .action(action(reportCommand));

  program
    .command('depcruise-plugin-path')
    .description('print the absolute path of the dependency-cruiser reporter plugin')
    .action(action(depcruisePluginPathCommand));

  try {
    await program.parseAsync(argv, { from: 'node' });
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode === 0 ? 0 : 2;
    return reportError(err, io);
  }
  return exitCode;
}
