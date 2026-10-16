// storage.js — tiny safe wrappers around the browser's localStorage.
// Why it exists: localStorage can throw an error (for example in some private-browsing
// modes or when storage is full). These helpers catch that so one blocked write
// never crashes the whole dashboard.

export function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked: behave as if nothing was saved
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked or full: nothing more we can do, so carry on
  }
}

export function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage blocked: nothing to remove
  }
}
