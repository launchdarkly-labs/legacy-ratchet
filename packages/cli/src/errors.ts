import { envOf, type Io } from './io.js';

export class CliError extends Error {
  readonly exitCode: number;
  readonly details: string[];

  constructor(message: string, opts: { exitCode?: number; details?: string[]; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'CliError';
    this.exitCode = opts.exitCode ?? 2;
    this.details = opts.details ?? [];
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function reportError(err: unknown, io: Io): number {
  const message = errorMessage(err).split('\n')[0] ?? 'unknown error';
  io.stderr(`error: ${message}\n`);
  if (err instanceof CliError) {
    for (const d of err.details) io.stderr(`  ${d}\n`);
  }
  if (envOf(io).MIGRATION_TRACKER_DEBUG === '1' && err instanceof Error && err.stack) {
    io.stderr(`${err.stack}\n`);
  }
  return err instanceof CliError ? err.exitCode : 2;
}

export function withErrors<O>(fn: (options: O, io: Io) => Promise<number>): (options: O, io: Io) => Promise<number> {
  return async (options, io) => {
    try {
      return await fn(options, io);
    } catch (err) {
      return reportError(err, io);
    }
  };
}
