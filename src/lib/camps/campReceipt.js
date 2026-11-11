// campReceipt.js — a camper's payment receipt, as the plain list the shared receipt draws
// (components/Receipt.jsx; design review C3, rulebook v0.734, carrying out v1.002 / v1.105 / v1.112
// for Camps and copying Star's build, v0.518 / lib/star/candidatesReceipt.js).
// Why it exists: Print receipt (the camper's ⋯ money group, and Camper detail) shows the shared
// receipt filled with Camps' data — all of it read today, no migration:
//   - camp_camper_detail (campsApi.loadCamperDetail): the camper (days, total, paid, CP reference),
//     the extras they chose, and every payment row;
//   - the camp page's own camp, days and extras (name, dates, school, which extras are "only on"
//     some days — so the Extras line reads exactly like Camper detail's);
//   - loadSchools(): both schools' street and phone (the footer);
//   - get_my_profile (campsApi.loadMyName): the name in "Printed … by [name]" (left out when that
//     call failed — Star's Q7 A).
// Which payment lines show (v0.734): every payment that still stands, oldest first by the day paid.
// A payment that Edit payment or Undo payment replaced, and the reversal row that undid it, are
// both left out (Star's rule). A refund that stands (Record refund, migration 0039, rulebook v0.743
// (5)) is its own line, "Refund", with a minus amount ("−$23", Star's receipt); an undone refund
// and its reversal are left out too. A payment line's "For" reads "Camp fee": a payment row doesn't
// say which days or extras it paid for, and Edit details re-prices the camper, so naming them would
// be a guess (Star's reason for "Testing fee"). "Paid to date" is the camper's paid amount, which is
// already net of refunds (the sum of every row).
// It NEVER holds the age, date of birth, parent, phones, email, notes, signature or links — only
// the facts listed in v0.734.
// It is PURE (no React, no database), so checks.mjs can check it with plain Node.
// (The words come from the Camps screens' word file, as checks.mjs already reads it.)
import * as T from '../../screens/camps/text.js';
import { refundStands } from './campRules.js';

// Print receipt's one rule, the same for the ⋯ menu, Camper detail's button and "More" (v0.734):
// a camper with money paid that still stands (paidCents is net of reversals and refunds) — or a
// refund that stands (Star's rule: a receipt can show money that was all handed back) — and never
// while Hide private details is on (option A — the item is simply absent, as Star and Camps' other
// money items). Since rulebook v1.055 (b) / design review M-03 this includes a REMOVED camper
// (withdrawn or a duplicate copy) whose money still stands, for staff too (as Color Belt's v0.428);
// a removed camper with nothing paid has none.
export function canPrintReceipt(row, detailsHidden) {
  return Boolean(row) && !detailsHidden && ((row.paidCents ?? 0) > 0 || refundStands(row));
}

// The payment and refund lines that still stand: kind 'payment' or 'refund' with no reversal row
// pointing at it (Edit payment, Undo payment and Undo refund all leave the old row + its reversal
// behind). Oldest first by the day paid (a refund: the day the money went back); two on the same day
// in the order they were recorded.
export function receiptPayments(payments) {
  const list = payments ?? [];
  const reversed = new Set(list.filter((p) => p.kind === 'reversal' && p.reversesPaymentId).map((p) => p.reversesPaymentId));
  return list
    .filter((p) => (p.kind === 'payment' || p.kind === 'refund') && !reversed.has(p.id))
    .sort((a, b) => {
      if (a.paidOn !== b.paidOn) return a.paidOn < b.paidOn ? -1 : 1;
      const ra = a.recordedAt ?? '';
      const rb = b.recordedAt ?? '';
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
}

// The Extras line, in Camper detail's words (CamperDialog.jsx): an extra offered only on some days
// shows "Pizza party — Wed", the others "Late pick-up on Mon, Wed" / "on all days" / just the name.
// Several extras are joined with "; " (the receipt has one line per fact). null when there are none.
function extrasText(breakdownExtras, campExtras, campDayIsos) {
  const chosen = breakdownExtras ?? [];
  if (chosen.length === 0) return null;
  return chosen
    .map((e) => ((campExtras ?? []).some((x) => x.name === e.name && (x.onlyOn ?? []).length > 0)
      ? T.detailExtraOnlyLine(e.name, e.days ?? [])
      : T.detailExtraLine(e, campDayIsos)))
    .join('; ');
}

// detail         loadCamperDetail's answer (status 'ok')
// camp           the camp page's camp ({ name, locationCode, bothSchools, … })
// campDays       the camp's days ([{ dayId, day }] or ['YYYY-MM-DD'])
// campExtras     the camp's current extras (for "only on" days), [] if unknown
// schools        loadSchools()'s schools ([] when they couldn't load: the footer then has none)
// printedOn      today at the school, 'YYYY-MM-DD'
// printedByName  get_my_profile's full_name, or null
// → the plain receipt (Receipt.jsx's shape)
export function buildCampReceipt({ detail, camp, campDays = [], campExtras = [], schools = [], printedOn, printedByName = null }) {
  const c = detail.camper;
  const campDayIsos = campDays.map((d) => (typeof d === 'string' ? d : d.day)).sort();
  const myDays = (c.days ?? []).map((d) => d.day).sort();
  const allDays = campDayIsos.length > 0 && myDays.length === campDayIsos.length;
  // A REMOVED camper (rulebook v0.748, M-03) owes nothing more — Color Belt's rule for a cancelled
  // private testing (v0.429, Jeffrey: "A: nothing owed"): Total due is what was paid (the payments that
  // still stand), never more than the camp's price for them, so the Balance reads "$0 · paid in full"
  // (one paid above the price still shows the overpayment); the Camp line names the removal. Payments
  // stay as they are (fees aren't refunded). An active camper prints as before.
  const removed = c.status !== 'active';
  const priceCents = c.totalCents ?? detail.breakdown?.totalCents ?? 0;
  const paidNow = c.paidCents ?? 0;
  const facts = [
    [T.RECEIPT_CAMPER, T.camperLabel(c)],
    [T.RECEIPT_CAMP, `${camp.name} · ${T.campDatesText(campDayIsos)}${removed && c.withdrawnAt ? ` · ${T.removedBy(c.withdrawnAt, null).replace(/ /g, ' ')}` : ''}`], // (no line break inside "removed Nov 7")
    [T.RECEIPT_SCHOOL_LABEL, T.familySchoolLine(camp)], // a family's paper: "Both schools", no single school (v0.754)
    [T.RECEIPT_DAYS, T.detailDaysLine(myDays, allDays)],
  ];
  const extras = extrasText(detail.breakdown?.extras, campExtras, campDayIsos);
  if (extras) facts.push([T.RECEIPT_EXTRAS, extras]);
  if (c.reference) facts.push([T.RECEIPT_REFERENCE, c.reference]);
  const lines = receiptPayments(detail.payments).map((p) => ({
    date: p.paidOn,
    forText: p.kind === 'refund' ? T.RECEIPT_FOR_REFUND : T.RECEIPT_FOR_FEE,
    how: p.method,
    // a refund is stored as a minus amount already; written with a minus either way (Star's rule)
    amountCents: p.kind === 'refund' ? -Math.abs(p.amountCents) : p.amountCents,
  }));
  return {
    kindLine: T.RECEIPT_KIND,
    facts,
    lines,
    totalDueCents: removed ? Math.min(Math.max(paidNow, 0), priceCents) : priceCents, // the camper's total now (a removed camper: what was paid)
    paidCents: paidNow, // what still stands (net of reversals)
    balanceNote: null, // Camps has no "next due"
    schools: (schools ?? []).map((s) => ({ name: s.name, street: s.address?.street ?? '', phone: s.phone ?? '' })),
    printedOn,
    printedByName: typeof printedByName === 'string' && printedByName.trim() !== '' ? printedByName.trim() : null,
  };
}
