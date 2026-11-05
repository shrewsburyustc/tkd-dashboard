// focusSoon.js — gives keyboard focus to an element once the page behind a closed dialog is
// usable again.
// Why it exists: while a dialog is open, App.jsx makes the page behind it "inert" (nothing there
// can be clicked or focused). When the dialog closes, the page stays inert for a moment — the news
// "the dialog closed" travels up through a few React updates (CampsTab → Camps → App) — and
// focus() on an inert button silently does nothing, so focus fell to the page itself (<body>).
// This waits, frame by frame (up to 30, about half a second), until the element is usable, then
// focuses it. It was CampPage's own helper; the Camps list's dialogs use it too now (design
// review: focus after Keep camp / Cancel on the camp list, 390 and PC).
//
//   focusSoon(element)            focus this element
//   focusSoon(() => element)      or find it when the time comes (it may be drawn again meanwhile)
export function focusSoon(find) {
  let tries = 0;
  const step = () => {
    const element = typeof find === 'function' ? find() : find;
    if (element && element.isConnected && element.closest('[inert]') && tries < 30) {
      tries += 1;
      window.requestAnimationFrame(step);
      return;
    }
    if (element && element.isConnected) element.focus();
  };
  window.requestAnimationFrame(step);
}
