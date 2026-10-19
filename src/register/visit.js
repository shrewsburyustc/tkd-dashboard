// visit.js — the "Registered on this visit" list (mockups F7/F8, rulebook v0.93/v0.131).
// Why it exists: a family registering two children sees both, with the family's Total due.
// The list is kept in this browser tab's sessionStorage ONLY — it disappears when the tab is
// closed and is never sent anywhere (contract 0005 §4.1). One list per event code.
//
// sessionStorage can be missing or blocked (private windows, strict settings), so every read
// and write is wrapped in try/catch; the page then simply shows this registration alone.

const keyFor = (code) => `tkd.register.visit.${code}`;

// The saved list: [{ name, from, to, earlyCents, dayCents, payingBy, reference }, …]
export function loadVisit(code) {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(keyFor(code)) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Adds one registration (skips it if that reference is already in the list, e.g. a repeat).
export function addToVisit(code, entry) {
  const list = loadVisit(code);
  if (!list.some((item) => item.reference === entry.reference)) list.push(entry);
  try {
    window.sessionStorage.setItem(keyFor(code), JSON.stringify(list));
  } catch {
    // storage blocked: the list just lives in memory for now
  }
  return list;
}
