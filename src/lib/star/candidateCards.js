// candidateCards.js — the numbers on the Candidates page's count cards, and which empty line a filter gets.
// Why it exists: the rules (rulebook v1.038 R5-05, v1.055 R3-02 and C-05 (b), v1.019 S-1) are easy to
// get subtly wrong inside a screen, so they live here as plain JavaScript with no React and
// candidatesChecks.mjs checks them without a browser. CandidatesTab.jsx only draws the result.
//
//   - Paid and Not paid leave out make-ups and any row flagged "Possible duplicate" until it is
//     reviewed. The row's OWN duplicateState decides, never the school-filtered pair list: a pair
//     split across two schools, viewed at one school, must not count or offer Mark paid.
//   - Payments recorded also counts removed (withdrawn) candidates' money (net of refunds, same school
//     filter); removedPaidCents is the part that is theirs, for the gray line under the number.
//   - dupLeftOut counts PAIRS (like the orange box above the cards), looked for in the whole event, so
//     a pair split across schools counts once when one of its rows is in view. A flagged row with no
//     partner counts as one.
//   - bySchool lists Worcester first, then Shrewsbury (S-1).

const sum = (rows) => rows.reduce((total, c) => total + (c.paidCents ?? 0), 0);

// candidates: every row of the event (active and withdrawn). inSchool: (row) => boolean, the page's school filter.
export function candidateCardNumbers(candidates, inSchool) {
  const active = candidates.filter((c) => c.status === 'active' && inSchool(c));
  const removed = candidates.filter((c) => c.status === 'withdrawn' && inSchool(c));
  const countable = active.filter((c) => !c.isMakeup && c.duplicateState !== 'possible');
  const removedPaidCents = sum(removed);

  const flagged = candidates.filter((c) => c.status === 'active' && c.duplicateState === 'possible');
  const seen = new Set();
  let dupLeftOut = 0;
  for (const c of flagged) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const other = flagged.find((o) => o.id !== c.id && !seen.has(o.id) && (o.duplicateOf === c.id || c.duplicateOf === o.id));
    if (other) seen.add(other.id);
    if (inSchool(c) || (other && inSchool(other))) dupLeftOut += 1;
  }

  return {
    active,
    countable,
    candidates: active.length,
    bySchool: ['worcester', 'shrewsbury'].map((code) => ({ code, n: active.filter((c) => c.locationCode === code).length })),
    paid: countable.filter((c) => c.paid).length,
    notPaid: countable.filter((c) => !c.paid && c.feeKind !== 'none').length,
    payments: sum(active) + removedPaidCents,
    removedPaidCents,
    dupLeftOut,
  };
}

// The rows a filter card shows (the Dan's active rows are passed in).
export function filterRows(rows, countable, filter) {
  if (filter === 'paid') return rows.filter((c) => countable.includes(c) && c.paid);
  if (filter === 'notPaid') return rows.filter((c) => countable.includes(c) && !c.paid && c.feeKind !== 'none');
  return rows;
}

// Which empty line the list shows: 'none' (not empty-by-filter: the Dan's own line), 'noPaid' or
// 'everyPaid'. A Dan with no candidates at all keeps "No candidates for this Dan." whatever the filter.
export function emptyLineKind(filter, danHasCandidates) {
  if (!filter || !danHasCandidates) return 'dan';
  return filter === 'paid' ? 'noPaid' : 'everyPaid';
}