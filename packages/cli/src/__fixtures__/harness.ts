import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../index.js';
import type { Env, Io } from '../io.js';

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

export class TempRepo {
  readonly dir: string;

  constructor(opts: { git?: boolean } = {}) {
    this.dir = mkdtempSync(path.join(os.tmpdir(), 'legacy-cli-'));
    if (opts.git !== false) {
      this.git('init', '-q', '-b', 'main');
      this.git('config', 'user.email', 'test@example.com');
      this.git('config', 'user.name', 'Test');
      this.git('config', 'commit.gpgsign', 'false');
    }
  }

  path(rel: string): string {
    return path.join(this.dir, rel);
  }

  write(rel: string, content: string): void {
    const file = this.path(rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }

  writeJson(rel: string, value: unknown): void {
    this.write(rel, `${JSON.stringify(value, null, 2)}\n`);
  }

  read(rel: string): string {
    return readFileSync(this.path(rel), 'utf8');
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel));
  }

  remove(rel: string): void {
    rmSync(this.path(rel), { force: true });
  }

  git(...args: string[]): string {
    return execFileSync('git', args, { cwd: this.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }

  commit(message: string): string {
    this.git('add', '-A');
    this.git('commit', '-q', '--allow-empty', '-m', message);
    return this.git('rev-parse', 'HEAD').trim();
  }

  async run(args: string[], opts: { cwd?: string; env?: Env; isTTY?: boolean } = {}): Promise<Captured> {
    let stdout = '';
    let stderr = '';
    const io: Io = {
      stdout: (s) => {
        stdout += s;
      },
      stderr: (s) => {
        stderr += s;
      },
      cwd: opts.cwd ?? this.dir,
      env: opts.env ?? {},
      isTTY: opts.isTTY ?? false,
    };
    const code = await run(['node', 'legacy', ...args], io);
    return { code, stdout, stderr };
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

export const FORMS_DATES_CONFIG = {
  version: 1,
  groups: {
    forms: {
      old: ['redux-form'],
      new: ['react-hook-form'],
      enforcement: { mode: 'ratchet' },
      docs: 'https://example.com/forms',
    },
    dates: {
      old: ['moment'],
      new: ['date-fns', 'dayjs'],
      enforcement: { mode: 'report' },
    },
  },
};
