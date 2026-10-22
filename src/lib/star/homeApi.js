// homeApi.js — the one call Home makes about Star testing (Star build phase 7, rulebook v0.515).
// Why it exists: Home's "Today" cards need to know which Star testing is on today. This file asks
// the database's star_home_today (migration 0006, contract §7) through the app's one connection,
// supabase.js — the real database, or the preview database (mockClient.js + mockStarCandidates.js)
// in preview mode. The logic (checking the answer, filtering by school, the card order) lives in
// homeCore.js so Node can check it (homeChecks.mjs); the words are in homeText.js.
//
//   loadStarHomeToday() → { status:'ok', today, events, privates } · no_access · stale · invalid ·
//                         { status:'error', error }   (never throws — see homeCore.js)
//   homeItems(answer, schoolCode) → the cards, in order
//   answerAction(result) → 'show' | 'lock' | 'keep'
//
// Only Star's Home cards import this file, and they are loaded only while the Star testing build
// switch is on (features.js loadStarHome) — so the live site never makes this call.
import { supabase } from '../supabase.js';
import { createStarHomeApi, homeItems, answerAction, STAR_HOME_STATUSES } from './homeCore.js';

export { homeItems, answerAction, STAR_HOME_STATUSES };

const api = createStarHomeApi(() => supabase);

export const loadStarHomeToday = api.loadStarHomeToday;
