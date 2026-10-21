// CompareDialog.jsx — "Ava Thompson is signed up twice": the side-by-side compare (C4b).
// Why it exists: copied and adapted from Color Belt's built CompareDialog (R7; contract §6.1).
// When the family form signs up the same child name at the same camp again, the newer row gets
// "Possible duplicate". Before anything is removed, staff look at both sign-ups next to each
// other; differences are highlighted (amber background + "different" for screen readers).
//   Lines: Signed up · Reference · Days · Extras · Paying by · Total · Payment
//   - Keep this one (under each column): the OTHER sign-up moves to Removed as "Duplicate copy",
//     with its payment record (5-second Undo; admins can Restore)
//   - Not the same person — keep both: the tag goes away on both
//   - Close: nothing changes
// After the camp's last day, Keep this one is admin-only (Color Belt v0.194): staff see only keep
// both and a line saying so. No red button: removing happens by keeping the other one, and it is
// reversible. PC / tablet: two columns; phone: full screen, one card per sign-up.
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import * as T from './text.js';

// "Drop-off × 5 · Pick-up × 5" — a camper's extras, short (as in the C4b compare).
export function extrasShort(row) {
  const byExtra = new Map();
  for (const e of row.extras ?? []) {
    const entry = byExtra.get(e.extraId) ?? { name: e.name, per: e.per, count: 0 };
    entry.count += 1;
    byExtra.set(e.extraId, entry);
  }
  const parts = [...byExtra.values()].map((e) => (e.per === 'day' ? `${e.name} × ${e.count}` : e.name));
  return parts.length ? parts.join(' · ') : '—';
}

export default function CompareDialog({ first, second, campDays, isPhone, saving, failed, canKeepOne, onKeep, onKeepBoth, onClose }) {
  const name = T.camperLabel(first);
  const payment = (row) => (row.paidCents > 0 ? `${T.TAG_PAID} ${row.paidOn ? T.monthDay(row.paidOn) : ''}`.trim() : T.TAG_NOT_PAID);
  const lines = [
    { label: T.CMP_SIGNED_UP, a: T.signedUpStamp(first.createdAt), b: T.signedUpStamp(second.createdAt) },
    { label: T.CMP_REFERENCE, a: first.reference, b: second.reference, plain: true },
    { label: T.CMP_DAYS, a: T.camperDaysText(first, campDays), b: T.camperDaysText(second, campDays) },
    { label: T.CMP_EXTRAS, a: extrasShort(first), b: extrasShort(second) },
    { label: T.CMP_PAYING_BY, a: T.payingByText(first.payingBy), b: T.payingByText(second.payingBy) },
    { label: T.CMP_TOTAL, a: T.dollars(first.totalCents), b: T.dollars(second.totalCents) },
    { label: T.CMP_PAYMENT, a: payment(first), b: payment(second) },
  ];
  // The signed-up time and the reference always differ, so they are never highlighted.
  const differs = (line) => !line.plain && line.label !== T.CMP_SIGNED_UP && line.a !== line.b;
  const value = (text, highlight) => (
    <>
      {text}
      {highlight && <span className="visually-hidden"> ({T.DIFFERENT})</span>}
    </>
  );
  const keepButton = (row, which) =>
    canKeepOne && (
      <button
        type="button"
        className="btn btn-sm"
        aria-label={T.keepThisOneLabel(which)}
        aria-disabled={saving ? 'true' : undefined}
        onClick={() => !saving && onKeep(row, row === first ? second : first)}
      >
        {T.KEEP_THIS_ONE}
      </button>
    );

  return (
    <Dialog title={T.compareTitle(name)} size="wide" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.COMPARE_SUB}</p>
      {isPhone ? (
        [first, second].map((row, index) => {
          const which = index === 0 ? T.FIRST_SIGNUP : T.SECOND_SIGNUP;
          return (
            <section key={row.id} className="ev-cmp-card" aria-label={which}>
              <h3 className="ev-cmp-head">{which}</h3>
              <dl className="ev-sum">
                {lines.map((line) => (
                  <div key={line.label} className={`ev-sum-row${differs(line) ? ' is-diff' : ''}`}>
                    <dt>{line.label}</dt>
                    <dd>{value(index === 0 ? line.a : line.b, differs(line))}</dd>
                  </div>
                ))}
              </dl>
              {keepButton(row, which)}
            </section>
          );
        })
      ) : (
        <table className="ev-cmp">
          <thead>
            <tr>
              <td />
              <th scope="col">{T.FIRST_SIGNUP}</th>
              <th scope="col">{T.SECOND_SIGNUP}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label}>
                <th scope="row">{line.label}</th>
                <td className={differs(line) ? 'is-diff' : ''}>{value(line.a, differs(line))}</td>
                <td className={differs(line) ? 'is-diff' : ''}>{value(line.b, differs(line))}</td>
              </tr>
            ))}
            {canKeepOne && (
              <tr className="ev-cmp-keep">
                <td />
                <td>{keepButton(first, T.FIRST_SIGNUP)}</td>
                <td>{keepButton(second, T.SECOND_SIGNUP)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <p className="field-hint ev-cmp-note">{canKeepOne ? T.COMPARE_NOTE : T.KEEP_ONE_ADMIN_ONLY}</p>
      <div className="dialog-actions ev-cmp-actions">
        <button type="button" className="btn" aria-disabled={saving ? 'true' : undefined} onClick={() => !saving && onKeepBoth()}>
          {T.KEEP_BOTH}
        </button>
        {!isPhone && (
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {T.CLOSE}
          </button>
        )}
      </div>
      {failed && (
        <div className="tdialog-note">
          <Notice>{T.SAVE_FAILED}</Notice>
        </div>
      )}
    </Dialog>
  );
}
