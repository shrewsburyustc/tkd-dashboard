// receipts-p3.js — mockup P3's example receipts, in the shared receipt's plain shape (Receipt.jsx),
// built the way Star's candidatesReceipt.js and Camps' campReceipt.js build theirs: every payment
// that still stands, oldest first, each "Testing fee"; the footer schools come from the preview.
window.__p3receipts = (schools) => {
  const base = { kindLine: 'Color belt testing · payment receipt', balanceNote: null, schools, printedOn: '2026-11-03', printedByName: 'Jeffrey Berg' };
  const avaLines = [
    { date: '2026-10-27', forText: 'Testing fee', how: 'cash', amountCents: 6500 },
    { date: '2026-11-03', forText: 'Testing fee', how: 'cash', amountCents: 2000 },
  ];
  return {
    // a normal event registration
    owen: {
      ...base,
      facts: [['Student', 'Owen Reed · White → Yellow'], ['Event', 'November Children Testing · Nov 20, 2026'], ['Class', 'White · 4:00 – 5:00 PM'], ['School', 'Worcester'], ['Reference', 'CB-3104']],
      lines: [{ date: '2026-11-01', forText: 'Testing fee', how: 'cash', amountCents: 6500 }],
      totalDueCents: 6500, paidCents: 6500,
    },
    // Ava: moved from the event (her $65 moved with her), then paid the $20 top-up. Option A names the event.
    avaA: {
      ...base,
      facts: [['Student', 'Ava Chen · Yellow → Orange'], ['Private testing', 'Tue, Dec 1, 4:00 PM'], ['Moved from', 'November Children Testing'], ['Class', 'Group A'], ['School', 'Worcester']],
      lines: avaLines, totalDueCents: 8500, paidCents: 8500,
    },
    // Option B: the same without the event
    avaB: {
      ...base,
      facts: [['Student', 'Ava Chen · Yellow → Orange'], ['Private testing', 'Tue, Dec 1, 4:00 PM'], ['Class', 'Group A'], ['School', 'Worcester']],
      lines: avaLines, totalDueCents: 8500, paidCents: 8500,
    },
  };
};
'receipts';
