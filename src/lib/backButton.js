// backButton.js — who gets the browser's Back button right now (rulebook v0.83).
// Why it exists: the browser's Back normally moves between dashboard pages (App.jsx). But while
// something is open on top of the page — the account menu, a dialog — Back should close THAT
// and leave the page alone. Two small registries let App.jsx know:
//   claimBack(close)   the account menu says "Back closes me". App.jsx then keeps the page where
//                      it is (it puts the page's address back), and the menu closes itself.
//   dialogStep(token)  a dialog (Dialog.jsx / AccountDialog.jsx) added its own history step,
//                      marked { tkdDialog: token }. When the dialog closes, its step becomes a
//                      leftover; if Forward ever lands on a leftover step, App.jsx steps off it
//                      again so the person never has to press Back twice for nothing.
// And one for a dialog opened ON TOP of another dialog (Dialog.jsx's onTop, rulebook v1.100):
//   openTopLayer(close)  the dialog on top says "Back closes me first". It adds NO history step
//                        of its own (two dialogs would fight over one step, and one Back press
//                        would reach both). The dialog underneath keeps its step; when Back uses
//                        that step up, the dialog underneath calls closeTopLayer() before itself.
//   closeTopLayer()      asks the newest dialog on top to close. true = there was one.

const claims = new Set();
const openDialogSteps = new Set();
const topLayers = []; // the dialogs open on top of another dialog, newest last

// Returns a function that gives the claim back.
export function claimBack(close) {
  claims.add(close);
  return () => claims.delete(close);
}

export function backIsClaimed() {
  return claims.size > 0;
}

// A dialog's history step is in use while the dialog is open. Returns "release".
export function dialogStep(token) {
  openDialogSteps.add(token);
  return () => openDialogSteps.delete(token);
}

// true for a { tkdDialog } step whose dialog is no longer open.
export function isLeftoverDialogStep(state) {
  return Boolean(state?.tkdDialog) && !openDialogSteps.has(state.tkdDialog);
}

// A dialog on top of another dialog is open. Returns "release" (call it when it closes).
export function openTopLayer(close) {
  const layer = { close };
  topLayers.push(layer);
  return () => {
    const index = topLayers.indexOf(layer);
    if (index !== -1) topLayers.splice(index, 1);
  };
}

// Back reached the dialog underneath: the newest dialog on top is asked to close instead (it may
// stay open, e.g. "Unsaved changes…"). Returns false when no dialog is on top.
export function closeTopLayer() {
  const layer = topLayers[topLayers.length - 1];
  if (!layer) return false;
  layer.close();
  return true;
}
