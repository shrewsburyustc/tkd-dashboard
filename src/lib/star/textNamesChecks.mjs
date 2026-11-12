// textNamesChecks.mjs - every `T.NAME` a Star screen uses really exists in the text file it imports.
// Why it exists: a screen that says `T.UNDO_DIDNT_SAVE` while text.js only exports `UNDO_BOX_FAILED`
// gets `undefined` at run time (blank text on the screen) and only a build WARNING ("is not exported"),
// which nobody reads. This found exactly that bug in batch 4, so it is a check now: a missing name fails.
// How: for each Star screen file with `import * as T from '<path>'`, collect every `T.NAME` it uses and
// the names the imported text file exports (export const / function / let / class, `export { a, b }`,
// `export { a } from`, and `export * from` followed one level deep), then compare.
// Run: node src/lib/star/textNamesChecks.mjs
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from './readSource.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAILED: ${name}\n${error.message}`);
    process.exit(1);
  }
};

// all .js / .jsx files under a folder
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// the names a module exports (one level of `export * from` is followed)
function exportedNames(file, depth = 0) {
  const text = readSource(file);
  const names = new Set();
  for (const m of text.matchAll(/^export\s+(?:const|let|var|function\*?|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // `export const { A, B, c: d } = obj;` (Star's text files re-export Color Belt's words this way)
  for (const m of text.matchAll(/^export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] ?? bits[0]).trim();
      if (name) names.add(name);
    }
  }
  if (depth < 2) {
    for (const m of text.matchAll(/^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) {
      const target = resolveImport(file, m[1]);
      if (target) for (const n of exportedNames(target, depth + 1)) names.add(n);
    }
  }
  return names;
}

function resolveImport(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`]) if (existsSync(candidate) && !readdirSafe(candidate)) return candidate;
  return null;
}
function readdirSafe(path) {
  try {
    return readdirSync(path).length >= 0; // a folder
  } catch {
    return false; // a file
  }
}

const folders = [join(root, 'src/screens/testing/star'), join(root, 'src/star-register')];
let filesChecked = 0;
let namesChecked = 0;
for (const folder of folders) {
  for (const file of walk(folder)) {
    const text = readSource(file);
    for (const imp of text.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
      const ns = imp[1];
      if (ns !== 'T') continue; // Star's screens call their text namespace T
      const target = resolveImport(file, imp[2]);
      if (!target) continue; // not a local file (a package)
      const used = new Set([...text.matchAll(/\bT\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
      const have = exportedNames(target);
      const label = file.replace(root, '').replace(/\\/g, '/');
      filesChecked += 1;
      check(`${label}: every T.NAME exists in ${imp[2]}`, () => {
        const missing = [...used].filter((n) => !have.has(n));
        assert.deepEqual(missing, [], `T.${missing.join(', T.')} is used in ${label} but ${imp[2]} does not export it`);
      });
      namesChecked += used.size;
    }
  }
}
check('the check really looked at files and names', () => {
  assert.ok(filesChecked >= 10, `only ${filesChecked} files had a T namespace`);
  assert.ok(namesChecked >= 100, `only ${namesChecked} names were checked`);
});

console.log(`ALL STAR TEXT NAME CHECKS PASSED (${passed} checks, ${filesChecked} files, ${namesChecked} names)`);
