import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BaselineRevision } from '@legacy-ratchet/core';
import { CliError } from './errors.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd: root, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

async function tryGit(root: string, args: readonly string[]): Promise<string | undefined> {
  try {
    return await git(root, args);
  } catch {
    return undefined;
  }
}

function lines(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

export async function revision(root: string): Promise<BaselineRevision | undefined> {
  const commit = (await tryGit(root, ['rev-parse', 'HEAD']))?.trim();
  if (!commit) return undefined;
  const result: BaselineRevision = { commit };
  const branch = (await tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim();
  if (branch && branch !== 'HEAD') result.branch = branch;
  return result;
}

export async function verifyRef(root: string, ref: string): Promise<void> {
  const out = await tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (out === undefined || out.trim() === '') {
    throw new CliError(`Unknown git ref "${ref}" (is the repository fetched with enough history?)`);
  }
}

export async function changedFiles(root: string, ref: string): Promise<string[]> {
  await verifyRef(root, ref);
  const committed = await tryGit(root, ['diff', '--name-only', '--relative', '--diff-filter=ACMR', `${ref}...HEAD`]);
  if (committed === undefined) throw new CliError(`Could not list files changed since "${ref}"`);
  const workingTree = (await tryGit(root, ['diff', '--name-only', '--relative', '--diff-filter=ACMR', 'HEAD'])) ?? '';
  const untracked = (await tryGit(root, ['ls-files', '--others', '--exclude-standard'])) ?? '';
  return [...new Set([...lines(committed), ...lines(workingTree), ...lines(untracked)])].sort();
}

export async function showFile(root: string, ref: string, relPath: string): Promise<string | undefined> {
  return tryGit(root, ['show', `${ref}:./${relPath}`]);
}

export async function repoPrefix(root: string): Promise<string> {
  return (await tryGit(root, ['rev-parse', '--show-prefix']))?.trim() ?? '';
}
