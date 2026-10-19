import pc from 'picocolors';

export type Env = Record<string, string | undefined>;

export interface Io {
  stdout(s: string): void;
  stderr(s: string): void;
  cwd: string;
  env?: Env;
  isTTY?: boolean;
}

export type Colors = ReturnType<typeof pc.createColors>;

export function defaultIo(): Io {
  return {
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
    cwd: process.cwd(),
    env: process.env,
    isTTY: Boolean(process.stdout.isTTY),
  };
}

export function envOf(io: Io): Env {
  return io.env ?? process.env;
}

export function colorEnabled(io: Io, colorFlag: boolean | undefined): boolean {
  if (colorFlag === false) return false;
  const env = envOf(io);
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') return true;
  return io.isTTY === true;
}

export function createColors(enabled: boolean): Colors {
  return pc.createColors(enabled);
}
