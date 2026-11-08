// compareRows.js — the rows of the side-by-side compare, as the plain list the shared compare draws.
// Why it exists: BB15 (design review, rulebook v1.102) swapped Black Belt's own CompareDialog for
// the shared one (src/components/CompareDialog.jsx). The shared dialog draws; the section builds the
// rows (its words, its order) — this is that building, kept pure (no React) so checks.mjs can try it.
// Rows, in order: Registered · Reference · Source · Date of birth · Email · Dan · School · Plan +
// Kukkiwon · Paid. Registered and Reference always differ, so they are `plain` (never marked).
// With Hide private details on (v1.036, as Camps' v0.722) Date of birth, Email, Plan and Paid are
// marked `hidden`: the shared dialog then reads the gray "Hidden on this tablet" on both sides and
// never marks them different, so a hidden line cannot give away which registration paid.
//
// first / second: the two registrations as loadCandidate reads them ({ candidate, money, … }).
import { formatCents } from '../../../lib/blackBelt/money.js';
import * as T from '../text.js';

const HIDDEN_KEYS = ['dob', 'email', 'plan', 'paid'];

export function compareRows(first, second, { hidden = false } = {}) {
  const facts = (d) => {
    const c = d.candidate;
    return {
      registered: T.stampDateTime(c.registeredAt),
      reference: c.reference ?? '',
      source: c.source === 'desk' ? T.SOURCE_DESK : T.SOURCE_FORM,
      dob: c.dateOfBirth ? T.monthDayYear(c.dateOfBirth) : T.DELETED_AFTER_KEEPING,
      email: c.emailForResults ?? T.DELETED_AFTER_KEEPING,
      dan: T.DAN_LABELS[c.dan] ?? '',
      school: T.schoolName(c.locationCode),
      plan: T.planCell(c.plan?.name ?? '', c.kukkiwon),
      paid: formatCents(d.money?.paidCents ?? 0),
    };
  };
  const a = facts(first);
  const b = facts(second);
  const lines = [
    { key: 'registered', label: T.CMP_REGISTERED, plain: true },
    { key: 'reference', label: T.CMP_REFERENCE, plain: true },
    { key: 'source', label: T.CMP_SOURCE },
    { key: 'dob', label: T.CMP_DOB },
    { key: 'email', label: T.CMP_EMAIL },
    { key: 'dan', label: T.CMP_DAN },
    { key: 'school', label: T.CMP_SCHOOL },
    { key: 'plan', label: T.CMP_PLAN },
    { key: 'paid', label: T.CMP_PAID },
  ];
  return lines.map((line) => {
    const off = hidden && HIDDEN_KEYS.includes(line.key);
    // A hidden row carries no value at all (the shared dialog prints "Hidden on this tablet"), so a
    // date of birth or an email never even reaches the dialog's props while the switch is on.
    return { key: line.key, label: line.label, plain: line.plain === true, hidden: off, first: off ? '' : a[line.key], second: off ? '' : b[line.key] };
  });
}
