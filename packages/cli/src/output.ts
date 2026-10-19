import path from 'node:path';
import { displayPath, writeTextFile, type Context } from './load.js';

export function info(ctx: Context, message: string): void {
  if (!ctx.quiet) ctx.io.stdout(`${message}\n`);
}

export function status(ctx: Context, message: string): void {
  if (!ctx.quiet) ctx.io.stderr(`${message}\n`);
}

export function warn(ctx: Context, message: string): void {
  if (!ctx.quiet) ctx.io.stderr(`${ctx.color.yellow('⚠')} ${message}\n`);
}

export function resolveOutput(ctx: Context, output: string): string {
  return path.resolve(ctx.io.cwd, output);
}

export async function emit(ctx: Context, content: string, output: string | undefined): Promise<void> {
  if (output === undefined) {
    ctx.io.stdout(content.endsWith('\n') ? content : `${content}\n`);
    return;
  }
  const file = resolveOutput(ctx, output);
  await writeTextFile(file, content);
  status(ctx, `Wrote ${displayPath(ctx, file)}`);
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
