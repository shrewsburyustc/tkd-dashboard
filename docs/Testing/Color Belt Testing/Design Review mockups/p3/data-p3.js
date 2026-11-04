// data-p3.js — mockup P3's example history rows and receipts (Color Belt's words, modelled on Star's
// history words and receipt; preview names: Owen Reed on November Children Testing, Ava Chen moved to a
// private testing, Sofia Reyes's past private testing).
window.__p3data = {
  // Owen Reed's event registration, oldest first (the shared line shows newest first)
  owen: [
    { text: 'Registered on the family form', at: '2026-10-26T22:00:00Z', who: 'Family form' },
    { text: 'Payment recorded: $65 check, paid Oct 30', at: '2026-10-30T20:10:00Z', who: 'Dana Ross', money: true },
    { text: 'Payment undone: $65', at: '2026-10-30T20:12:00Z', who: 'Dana Ross', money: true },
    { text: 'Payment recorded: $65 check, paid Nov 1', at: '2026-11-01T19:00:00Z', who: 'Dana Ross', money: true },
    { text: 'Payment changed: check → cash', at: '2026-11-01T21:30:00Z', who: 'Jeffrey Berg', money: true },
    { text: 'Paying by changed: Check → Cash', at: '2026-11-01T21:30:01Z', who: 'Jeffrey Berg', money: true },
  ],
  // Ava Chen's private testing: only its own rows, starting at the move (v0.418 Q4)
  ava: [
    { text: 'Moved to private testing from November Children Testing (Tue, Dec 1, 4:00 PM)', at: '2026-11-01T21:45:00Z', who: 'Jeffrey Berg' },
    { text: 'Day or time changed: Tue, Dec 1, 4:00 PM → Tue, Dec 1, 4:30 PM', at: '2026-11-02T18:00:00Z', who: 'Dana Ross' },
    { text: 'Day or time change undone', at: '2026-11-02T18:00:04Z', who: 'Dana Ross' },
  ],
  // Sofia Reyes's past private testing (for Result and for Hide private details)
  sofia: [
    { text: 'Added at the desk (Sat, Oct 31, 4:00 PM)', at: '2026-10-24T20:30:00Z', who: 'Dana Ross' },
    { text: 'Payment recorded: $85 card, paid Oct 31', at: '2026-10-31T19:55:00Z', who: 'Dana Ross', money: true },
    { text: 'Result: Passed', at: '2026-10-31T20:40:00Z', who: 'Staff' },
  ],
};
'data';
