// index.js — lets `node --test functions/tests/` run every test file in this folder.
// Why it exists: newer Node versions (21+) treat `functions/tests/` as ONE file to run, not as
// "everything in this folder". Node then looks for index.js inside the folder — this file —
// which simply loads each test file. Add new test files to the list below.
// (Cloudflare ignores this file: it has no onRequest handler, and public/_routes.json only
// sends /api/* to Functions.)
import './register.test.mjs';
import './camp.test.mjs';
import './forms.test.mjs';
import './starRegister.test.mjs';
import './bbRegister.test.mjs';
