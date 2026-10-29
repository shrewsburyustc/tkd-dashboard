// run-checks.mjs — runs every check file in the app and says which pass (before / after step 1).
// Why: the brief asks for every existing check file to be run before any app file changes, and
// again after, with the results noted. The check files are small Node scripts next to the code
// they test; each exits with 0 when every check passes.
// Which: src/lib/*/checks.mjs, src/lib/star/*Checks.mjs, src/forms/checks.mjs (it reads dist/, so
// run `npm run build` first — the real build: `npm run build:preview-mode` writes dist/ too, and
// this check fails on that build), src/screens/prospects/progress.checks.mjs — and any other
// *checks.mjs / *Checks.mjs under src/ (e.g. src/lib/shared/checks.mjs once step 1 adds it).
//
// Usage (from the project folder): node "docs/Dashboard Core/tools/run-checks.mjs"

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

// Every file under src/ whose name ends in "checks.mjs" or "Checks.mjs".
function findChecks(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...findChecks(path));
    else if (/(^|[.])checks\.mjs$|Checks\.mjs$/.test(name)) found.push(path);
  }
  return found;
}

const files = findChecks('src').sort();
let failed = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split(/\r?\n/);
  const ok = run.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${relative('.', file).replace(/\\/g, '/')}  — ${lines[lines.length - 1].slice(0, 110)}`);
}
console.log(`${files.length} check files: ${files.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
