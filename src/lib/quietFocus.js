// quietFocus.js — put keyboard focus back on a button WITHOUT drawing the focus ring, when the
// person was using a finger or a mouse rather than the keyboard.
// Why it exists: when a dialog closes, the page puts focus back on the button that opened it (so
// keyboard users carry on from the same place — guidelines 4). Browsers decide whether to draw
// the ring (":focus-visible") by guessing, and after a dialog whose text field had focus they
// usually guess "keyboard" — so on a tablet the blue ring stayed on the Edit icon after tapping
// Save. The house rule is: the ring is for keyboard focus only. This file remembers how the person
// last interacted (a key press, or a pointer: finger, pen or mouse) and, after a pointer, marks the
// button with data-quiet-focus. CSS hides the ring on a marked button (star.css); the mark is
// removed as soon as the button loses focus or a key is pressed, so keyboard users always see it.

let lastInput = 'keyboard'; // until we know better, assume the keyboard (the ring shows)

if (typeof document !== 'undefined') {
  // "capture: true" = hear it before anything on the page can stop it.
  document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
}

// Focus `element`; after a pointer interaction, without the ring.
export function focusAfterDialog(element) {
  if (!element) return;
  if (lastInput !== 'pointer') {
    element.focus();
    return;
  }
  element.setAttribute('data-quiet-focus', '');
  const clear = () => {
    element.removeAttribute('data-quiet-focus');
    element.removeEventListener('blur', clear);
    document.removeEventListener('keydown', clear, true);
  };
  element.addEventListener('blur', clear);
  document.addEventListener('keydown', clear, true); // a key press: the ring comes back
  // focusVisible: false asks browsers that support it not to draw the ring at all.
  element.focus({ focusVisible: false });
}
