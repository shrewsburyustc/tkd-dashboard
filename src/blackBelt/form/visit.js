// visit.js — the "Registered on this visit" list on the Black Belt Registered page (Form 7).
// Why it exists: a family registering two candidates sees both, with the family's total
// (Star v0.93 pattern). The list is kept in this browser tab's sessionStorage ONLY — it
// disappears when the tab is closed and is never sent anywhere. One list per link code.
//
// Privacy (contract 0016-B1 §4.4): each entry holds ONLY { name, dan, kukkiwon, planName,
// totalCents, reference } — never the date of birth, email, signer's name or signature.
//
// sessionStorage can be missing or blocked (private windows, strict settings), so every read
// and write is wrapped in try/catch; the page then simply shows this registration alone.

const keyFor = (code) => `tkd.blackBelt.visit.${code}`;

// Keeps only the allowed keys of an entry (so nothing else can ever be stored by mistake).
function clean(entry) {
  return {
    name: String(entry?.name ?? ''),
    dan: Number(entry?.dan) || null,
    kukkiwon: entry?.kukkiwon === true,
    planName: String(entry?.planName ?? ''),
    totalCents: typeof entry?.totalCents === 'number' ? entry.totalCents : 0,
    reference: String(entry?.reference ?? ''),
  };
}

// The saved list (oldest first).
export function loadVisit(code) {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(keyFor(code)) ?? '[]');
    return Array.isArray(list) ? list.map(clean) : [];
  } catch {
    return [];
  }
}

// Adds one registration (skips it if that reference is already in the list, e.g. a repeat Send
// answered with the first registration).
export function addToVisit(code, entry) {
  const list = loadVisit(code);
  const item = clean(entry);
  if (!list.some((v) => v.reference === item.reference)) list.push(item);
  try {
    window.sessionStorage.setItem(keyFor(code), JSON.stringify(list));
  } catch {
    // storage blocked: the list just lives in memory for now
  }
  return list;
}
