// mock-c04-undo-asks.js — Camps design review C4, second half (rule v1.003, v1.103), drawn ON TOP of the real
// preview page for a picture only: Camps' "Undo payment" asking first, in the shared ConfirmBox with
// loses: 'something' (blue action, first focus on "Keep payment").
// How: open a paid camper's Delete permanently box (the camper ⋯ or Camper detail → More). Since v0.729 that
// box IS the shared ConfirmBox, so its markup and classes are the real ones; this script only swaps the words,
// turns the red action blue (btn-delete → btn-primary, as ConfirmBox's actionClass does for 'something'),
// gives it Undo's icon (ti-arrow-back-up, the menu item's), removes the delete hint, and rebuilds the hidden
// sizer with the Undo words so the measured stacking is the Undo pair's. Nothing is pressed or saved.
// Options (set before running):
//   window.__c04 = { busy: true }    the "while it works" look: "Undoing…", both buttons gray (.is-unavailable)
//   window.__c04 = { failed: true }  the section's amber note under the buttons (ConfirmBox's .tdialog-note)
//   window.__c04 = { focus: true }   draw the first focus on "Keep payment" as the keyboard sees it
//   name / amount / method / date / owed: the words (default Chloe Martin, $315 check, Mar 11, $315)
// Run with the box open:   node shotx.mjs out.png [--js "window.__c04={busy:true}"] --eval mock-c04-undo-asks.js
(async () => {
  const o = { name: 'Chloe Martin', amount: '$315', method: 'check', date: 'Mar 11', owed: '$315', ...(window.__c04 || {}) };
  const dialog = [...document.querySelectorAll('.tdialog--confirm')].pop();
  if (!dialog) return 'open a paid camper’s Delete permanently box first';
  dialog.querySelectorAll('[data-mock=c04]').forEach((e) => e.remove());
  // The words (proposal; Star's text.js:164–167 adapted to Camps).
  dialog.querySelector('.dialog-title').textContent = `Undo ${o.name}’s payment?`;
  dialog.querySelector('.tdialog-body').textContent =
    `The ${o.amount} ${o.method} payment recorded on ${o.date} is reversed, so ${o.owed} is owed again. Both stay in the history.`;
  dialog.querySelector('.cfm-hint')?.remove();
  const row = dialog.querySelector('.dialog-actions');
  const [keep, action] = row.querySelectorAll(':scope > .btn');
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-arrow-back-up" aria-hidden="true"><path d="M9 14l-4 -4l4 -4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path></svg>';
  const usualWords = 'Undo payment';
  const busyWords = 'Undoing…';
  keep.textContent = 'Keep payment';
  action.className = 'btn btn-primary';
  action.innerHTML = icon + (o.busy ? busyWords : usualWords);
  // The sizer (shared.css .cfm-sizer): ConfirmButtons' own, filled in place with the Undo words, so the box's
  // own ResizeObserver re-measures the stacking for these words (a second, separate sizer would be ignored
  // and React would put its own answer back on the next draw).
  const sizer = row.querySelector('.cfm-sizer');
  sizer.querySelector(':scope > .btn').textContent = 'Keep payment';
  const usualCopy = sizer.querySelector('[data-words=usual]');
  const busyCopy = sizer.querySelector('[data-words=busy]');
  usualCopy.className = 'btn btn-primary';
  usualCopy.innerHTML = icon + usualWords;
  busyCopy.className = 'btn btn-primary';
  busyCopy.innerHTML = icon + busyWords;
  // Two frames: the box's ResizeObserver measures, React draws its answer.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100))));
  const stacked = sizer.getBoundingClientRect().width > row.clientWidth + 0.5;
  row.classList.toggle('is-stacked', stacked);
  const usualW = sizer.querySelector('[data-words=usual]').getBoundingClientRect().width;
  const busyW = sizer.querySelector('[data-words=busy]').getBoundingClientRect().width;
  keep.classList.toggle('is-unavailable', Boolean(o.busy));
  action.classList.toggle('is-unavailable', Boolean(o.busy));
  action.style.minWidth = !stacked && (o.busy || busyW > usualW) ? `${Math.max(usualW, busyW)}px` : '';
  // A failed Undo: the box stays open with the section's amber note under the buttons (ConfirmBox's markup).
  dialog.querySelector('.tdialog-note')?.remove();
  if (o.failed) {
    const note = document.createElement('div');
    note.className = 'tdialog-note';
    note.dataset.mock = 'c04';
    note.innerHTML = '<div class="notice" role="alert"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-alert-triangle notice-icon" aria-hidden="true"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path><path d="M12 16h.01"></path></svg>'
      + '<span>Couldn’t undo. Check the connection, then try again.</span></div>';
    row.after(note);
  }
  // Focus: the box puts it on "Keep payment" when it opens. With a mouse it shows no ring; window.__c04.focus
  // draws the ring the keyboard sees (the app's own :focus-visible look, copied from the computed style).
  document.activeElement?.blur?.();
  keep.style.outline = o.focus ? '2px solid var(--color-blue)' : '';
  keep.style.outlineOffset = o.focus ? '2px' : '';
  return `${stacked ? 'stacked' : 'side by side'}${o.busy ? ', busy' : ''}${o.failed ? ', failed' : ''}`;
})()
