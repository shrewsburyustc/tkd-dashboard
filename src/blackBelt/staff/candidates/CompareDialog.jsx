// CompareDialog.jsx — "Noah Silva is registered twice": the side-by-side compare of a possible
// duplicate (staff and admins).
// Why it exists: Star v0.114, approved through mockup Candidates 1 (contract CONTRACT-0016-B2 §3.8).
// Before deciding, the desk looks at both registrations next to each other: Registered (date and
// time), Reference, Source, Date of birth, Email, Dan, School, Plan + Kukkiwon, Paid — differences
// highlighted (amber background AND a small ⚠ "different" mark on screen; never color alone).
//   Keep this one (under each)        the OTHER one moves under Removed as "Duplicate copy"
//                                     (toast with Undo; staff may undo their own for 10 seconds)
//   Not the same person — keep both   the amber tag goes away on both
//   Close                             nothing changes
// PC / tablet: two columns; phone: a full screen with the two one after the other.
// The two registrations are read with loadCandidate (the only read that has the date of birth and
// email); with the device's Hide payments switch on those two, Plan (a payment detail, R4-01 /
// v1.036, as Camps' v0.722) and Paid read the gray "Hidden on this tablet" (.ev-hidden-value,
// R4-03) — the same words on both sides, so a hidden line is never marked different.
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { formatCents } from '../../../lib/blackBelt/money.js';
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function CompareDialog({ state, isPhone, hidden, onKeep, onKeepBoth, onCancel }) {
  const { first, second } = state;
  const name = T.candidateName(first.candidate);
  const off = state.saving || state.blocking;
  const facts = (d) => {
    const c = d.candidate;
    return {
      registered: T.stampDateTime(c.registeredAt),
      reference: c.reference ?? '',
      source: c.source === 'desk' ? T.SOURCE_DESK : T.SOURCE_FORM,
      dob: hidden ? T.HIDDEN_ON_DEVICE : c.dateOfBirth ? T.monthDayYear(c.dateOfBirth) : T.DELETED_AFTER_KEEPING,
      email: hidden ? T.HIDDEN_ON_DEVICE : c.emailForResults ?? T.DELETED_AFTER_KEEPING,
      dan: T.DAN_LABELS[c.dan] ?? '',
      school: T.schoolName(c.locationCode),
      plan: hidden ? T.HIDDEN_ON_DEVICE : T.planCell(c.plan?.name ?? '', c.kukkiwon),
      paid: hidden ? T.HIDDEN_ON_DEVICE : formatCents(d.money?.paidCents ?? 0),
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
  // The lines that read "Hidden on this tablet" while the switch is on
  const HIDDEN_KEYS = ['dob', 'email', 'plan', 'paid'];
  const isHidden = (key) => hidden && HIDDEN_KEYS.includes(key);
  // The time and the reference always differ, so they are never highlighted; nor is a hidden line.
  const differs = (line) => !line.plain && !isHidden(line.key) && a[line.key] !== b[line.key];
  const Warn = ICONS.warn;
  const value = (text, highlight, key) => (
    <>
      {isHidden(key) ? <span className="ev-hidden-value">{text}</span> : text}
      {highlight && (
        <span className="bb-diff-mark">
          <Warn size={12} aria-hidden="true" />
          {T.DIFFERENT}
        </span>
      )}
    </>
  );
  const keep = (keepThis, other, which) => (
    <button type="button" className="btn btn-sm" aria-label={T.keepThisOneLabel(which)} aria-disabled={off ? 'true' : undefined} onClick={() => !off && onKeep(keepThis, other)}>
      {T.KEEP_THIS_ONE}
    </button>
  );

  return (
    <Dialog title={T.compareTitle(name)} size="wide" fullScreen={isPhone} onRequestClose={onCancel}>
      <p className="tdialog-sub">{T.COMPARE_SUB}</p>
      {isPhone ? (
        [
          [first, a, second, T.FIRST_REGISTRATION],
          [second, b, first, T.SECOND_REGISTRATION],
        ].map(([d, f, other, which]) => (
          <section key={d.candidate.id} className="ev-cmp-card" aria-label={which}>
            <h3 className="ev-cmp-head">{which}</h3>
            <dl className="ev-sum">
              {lines.map((line) => (
                <div key={line.key} className={`ev-sum-row${differs(line) ? ' is-diff' : ''}`}>
                  <dt>{line.label}</dt>
                  <dd>{value(f[line.key], differs(line), line.key)}</dd>
                </div>
              ))}
            </dl>
            {keep(d, other, which)}
          </section>
        ))
      ) : (
        <table className="ev-cmp">
          <thead>
            <tr>
              <td />
              <th scope="col">{T.FIRST_REGISTRATION}</th>
              <th scope="col">{T.SECOND_REGISTRATION}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <th scope="row">{line.label}</th>
                <td className={differs(line) ? 'is-diff' : ''}>{value(a[line.key], differs(line), line.key)}</td>
                <td className={differs(line) ? 'is-diff' : ''}>{value(b[line.key], differs(line), line.key)}</td>
              </tr>
            ))}
            <tr className="ev-cmp-keep">
              <td />
              <td>{keep(first, second, T.FIRST_REGISTRATION)}</td>
              <td>{keep(second, first, T.SECOND_REGISTRATION)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="field-hint ev-cmp-note">{T.COMPARE_NOTE}</p>
      <div className="dialog-actions ev-cmp-actions">
        <button type="button" className="btn" aria-disabled={off ? 'true' : undefined} onClick={() => !off && onKeepBoth()}>
          {T.KEEP_BOTH}
        </button>
        {!isPhone && (
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            {T.CLOSE}
          </button>
        )}
      </div>
      {(state.note || state.failed) && (
        <div className="tdialog-note">
          <Notice>{state.failed ? T.SAVE_FAILED : state.note}</Notice>
        </div>
      )}
    </Dialog>
  );
}
