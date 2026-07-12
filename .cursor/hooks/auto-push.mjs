#!/usr/bin/env node
/**
 * Cursor stop hook: commit and push agent changes to origin/main.
 * Runs when an agent session ends. Fails open so agent work is never blocked.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GIT = 'git';
const AUTHOR = ['-c', 'user.email=Cookie2124@users.noreply.github.com', '-c', 'user.name=Cookie2124'];
const BRANCH = 'main';
const SECRET_PATHS = new Set(['.env', '.env.local']);

function git(...args) {
  return execFileSync(GIT, args, { encoding: 'utf8' }).trim();
}

function failOpen(reason) {
  console.error(`[auto-push] ${reason}`);
  process.exit(0);
}

try {
  try {
    readFileSync(0, 'utf8');
  } catch {
    /* empty stdin is fine */
  }

  git('rev-parse', '--git-dir');

  const porcelain = git('status', '--porcelain');
  if (!porcelain) process.exit(0);

  git('add', '-A');

  let staged = git('diff', '--cached', '--name-only');
  if (!staged) process.exit(0);

  for (const file of staged.split('\n')) {
    if (SECRET_PATHS.has(file)) {
      git('reset', 'HEAD', '--', file);
    }
  }

  staged = git('diff', '--cached', '--name-only');
  if (!staged) process.exit(0);

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const files = staged.split('\n').length;
  const message = `Auto-sync: Cursor agent changes (${files} file${files === 1 ? '' : 's'}, ${timestamp})`;

  git(...AUTHOR, 'commit', '-m', message);

  try {
    git('push', 'origin', BRANCH);
    console.error(`[auto-push] pushed to origin/${BRANCH}`);
  } catch (pushErr) {
    failOpen(`commit succeeded but push failed: ${pushErr.stderr ?? pushErr.message}`);
  }
} catch (err) {
  failOpen(err.stderr ?? err.message ?? String(err));
}
