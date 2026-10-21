// CompareDialog.jsx — "Mia Lopez is registered twice": the side-by-side compare (R7).
// Why it exists: Star v0.114 (carried over to Color Belt, Q9). When the same name is registered
// twice in one event, staff look at both registrations next to each other before deciding —
// there is no shortcut that removes a copy without seeing both. Differences are highlighted
// (amber background + "different" for screen readers, never color alone).
//   - "Keep this one" under each column: the OTHER one moves to Removed as "Duplicate copy"
//   - "Not the same person — keep both": the tag goes away on both
//   - Close: nothing changes
// PC / tablet: two columns. Phone: a full screen with the two registrations one after the other.
// Phase 3 (v0.194): after the testing day "Keep this one" is for admins only — staff don't see
// the two buttons (canKeepOne false), only "keep both" and a line saying an admin can keep one.
// Follows "Hide private details" (v0.506, v0.507 Q2), as Star's compare: while `hidden` is on,
// Paying by and Payment read gray "Hidden on this tablet" on both sides and are never highlighted.
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import * as T from '../text.js';

export default function CompareDialog({ first, second, rankById, isPhone, saving, failed, canKeepOne = true, hidden = false, onKeep, onKeepBoth, onClose }) {
  const name = T.studentLabel(first);
  const testing = (row) => {
    const rank = rankById.get(row.eventRankId);
    return rank ? `${rank.name} → ${rank.testingFor?.name ?? T.NO_NEW_RANK}` : '';
  };
  const payment = (row) => (row.paid ? `${T.TAG_PAID} ${T.monthDay(row.paidOn)}` : T.TAG_NOT_PAID);
  const lines = [
    { label: T.DETAIL_REGISTERED, a: T.registeredDetail(first.registeredAt, first.source, null), b: T.registeredDetail(second.registeredAt, second.source, null) },
    { label: T.COMPARE_REFERENCE, a: first.reference ?? T.NO_REFERENCE, b: second.reference ?? T.NO_REFERENCE, plain: true },
    { label: T.DETAIL_TESTING_FOR, a: testing(first), b: testing(second) },
    { label: T.DETAIL_PAYING_BY, a: T.payingByText(first.payingBy), b: T.payingByText(second.payingBy), private: true },
    { label: T.DETAIL_PAYMENT, a: payment(first), b: payment(second), private: true },
  ].map((line) => (hidden && line.private ? { ...line, a: T.HIDDEN_ON_THIS_TABLET, b: T.HIDDEN_ON_THIS_TABLET, plain: true, isHidden: true } : line));
  // A reference number always differs, so it is never highlighted; hidden values never are.
  const differs = (line) => !line.plain && line.a !== line.b;
  const value = (text, highlight, isHidden = false) =>
    isHidden ? (
      <span className="ev-hidden-value">{text}</span>
    ) : (
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
          const which = index === 0 ? T.FIRST_REGISTRATION : T.SECOND_REGISTRATION;
          return (
            <section key={row.id} className="ev-cmp-card" aria-label={which}>
              <h3 className="ev-cmp-head">{which}</h3>
              <dl className="ev-sum">
                {lines.map((line) => (
                  <div key={line.label} className={`ev-sum-row${differs(line) ? ' is-diff' : ''}`}>
                    <dt>{line.label}</dt>
                    <dd>{value(index === 0 ? line.a : line.b, differs(line), line.isHidden)}</dd>
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
              <th scope="col">{T.FIRST_REGISTRATION}</th>
              <th scope="col">{T.SECOND_REGISTRATION}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label}>
                <th scope="row">{line.label}</th>
                <td className={differs(line) ? 'is-diff' : ''}>{value(line.a, differs(line), line.isHidden)}</td>
                <td className={differs(line) ? 'is-diff' : ''}>{value(line.b, differs(line), line.isHidden)}</td>
              </tr>
            ))}
            {canKeepOne && (
              <tr className="ev-cmp-keep">
                <td />
                <td>{keepButton(first, T.FIRST_REGISTRATION)}</td>
                <td>{keepButton(second, T.SECOND_REGISTRATION)}</td>
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
