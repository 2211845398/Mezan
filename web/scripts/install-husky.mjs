import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * `husky install` must target the monorepo root (where `.git/` lives) even
 * though the package.json lives in `web/`. This script locates the git root
 * and points Husky at `web/.husky/`, keeping all frontend tooling inside the
 * web workspace.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webDir, '..');

if (!existsSync(path.join(repoRoot, '.git'))) {
  console.log('[husky] No .git directory at repo root; skipping install.');
  process.exit(0);
}

if (process.env.CI === 'true' || process.env.HUSKY === '0') {
  console.log('[husky] CI or HUSKY=0 detected; skipping install.');
  process.exit(0);
}

try {
  execSync(`git -C "${repoRoot}" config core.hooksPath web/.husky`, {
    stdio: 'inherit',
  });
  console.log('[husky] core.hooksPath set to web/.husky');
} catch (err) {
  console.warn('[husky] Failed to configure core.hooksPath:', err);
}
