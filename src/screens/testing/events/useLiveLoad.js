// useLiveLoad.js — the old address of the live-loading hook (useLiveLoad, LIVE_REFRESH_MS).
// Why it exists: every section uses the hook, so it moved to src/lib/useLiveLoad.js in Dashboard
// core step 1 (rulebook v1.030). This file only keeps the old import path working (no logic
// here); each section switches its imports in its own prompt.
//
//   import { LIVE_REFRESH_MS, useLiveLoad } from '…/lib/useLiveLoad.js';   // the new address
export { LIVE_REFRESH_MS, useLiveLoad } from '../../../lib/useLiveLoad.js';
