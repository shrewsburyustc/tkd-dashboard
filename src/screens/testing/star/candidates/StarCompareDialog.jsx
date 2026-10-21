// StarCompareDialog.jsx — "Alex Kim is registered twice": the side-by-side compare (Candidates
// screen 3, v0.114; gap mockup G9).
// Why it exists: when the same name and date of birth are registered twice in one event, staff look at
// both registrations next to each other before deciding — nothing removes a copy without seeing both.
//   - "Keep this one" under each column: the OTHER one moves to Removed as "Duplicate copy"
//     (toast with Undo; admins can Restore)
//   - "Not the same person — keep both": the amber tag goes away on both
//   - Close: nothing changes
// Differences are highlighted (amber background + "different" for screen readers, never colour alone).
// Date of birth and email come from loadCandidateDetail, once per column (the API's rule, v0.160).
// While "Hide private details" is on (G9): the sub-line is only "Same name and date of birth.";
// date of birth, email, Paying by and Payment read "Hidden on this tablet" with NO highlight (a
// highlight would give away that they differ), and a line says to review at the desk. Keep this one
// and Keep both still work.
// PC / tablet: two columns. Phone: a full screen with the two registrations one after the other.
// Color Belt's CompareDialog.jsx pattern, copied (Color Belt's compare has no date of birth or email).
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import * as T from './text.js';

export default function StarCompareDialog({ first, second, details, loadFailed, hidden, isPhone, saving, failedText, onKeep, onKeepBoth, onRetry, onClose }) {
  const name = T.candidateName(first);
  const payment = (row) => (row.paid ? `${T.TAG_PAID} ${T.monthDay(row.paidOn)}` : row.isMakeup ? T.NO_FEE_CELL : T.TAG_NOT_PAID);
  const d1 = details?.[0]?.candidate ?? null;
  const d2 = details?.[1]?.candidate ?? null;
  const lines = [
    { label: T.COMPARE_REGISTERED, a: T.compareRegistered(first.registeredAt, first.source), b: T.compareRegistered(second.registeredAt, second.source), plain: true },
    { label: T.REFERENCE, a: first.reference ?? T.NO_REFERENCE, b: second.reference ?? T.NO_REFERENCE, plain: true },
    { label: T.DOB, a: d1?.dateOfBirth ? T.monthDayYear(d1.dateOfBirth) : '—', b: d2?.dateOfBirth ? T.monthDayYear(d2.dateOfBirth) : '—', private: true },
    { label: T.EMAIL, a: d1?.emailForResults ?? '—', b: d2?.emailForResults ?? '—', private: true },
    { label: T.COL_TESTING_FOR, a: T.testingForLong(first), b: T.testingForLong(second) },
    { label: T.PAYING_BY, a: T.payingByText(first.payingBy), b: T.payingByText(second.payingBy), private: true },
    { label: T.PAYMENT, a: payment(first), b: payment(second), private: true },
  ];
  const isHidden = (line) => hidden && line.private;
  // The time and reference always differ, so they are never highlighted; hidden values never are.
  const differs = (line) => !line.plain && !isHidden(line) && line.a !== line.b;
  const value = (line, text) =>
    isHidden(line) ? (
      <span className="st-hidden-value">{T.HIDDEN_ON_THIS_TABLET}</span>
    ) : (
      <>
        {text}
        {differs(line) && <span className="visually-hidden"> ({T.DIFFERENT})</span>}
      </>
    );
  const keepButton = (row, which) => (
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
  const sub = hidden ? T.COMPARE_SUB_HIDDEN : T.COMPARE_SUB;
  const ready = details !== null;

  return (
    <Dialog title={isPhone ? T.COMPARE_PHONE_TITLE : T.compareTitle(name)} size="wide" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{isPhone ? (hidden ? `${name} · ${T.COMPARE_SUB_HIDDEN.toLowerCase()}` : T.comparePhoneSub(name)) : sub}</p>
      {loadFailed && (
        <div className="tdialog-note">
          <Notice>
            {T.LOAD_DETAIL_FAILED}{' '}
            <button type="button" className="note-action" onClick={onRetry}>
              {T.RETRY}
            </button>
          </Notice>
        </div>
      )}
      {!ready && !loadFailed && (
        <div className="tskeleton" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      )}
      {ready &&
        (isPhone ? (
          [first, second].map((row, index) => {
            const which = index === 0 ? T.FIRST_REGISTRATION : T.SECOND_REGISTRATION;
            return (
              <section key={row.id} className="ev-cmp-card" aria-label={which}>
                <h3 className="ev-cmp-head">{which}</h3>
                <dl className="ev-sum">
                  {lines.map((line) => (
                    <div key={line.label} className={`ev-sum-row${differs(line) ? ' is-diff' : ''}`}>
                      <dt>{line.label}</dt>
                      <dd>{value(line, index === 0 ? line.a : line.b)}</dd>
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
                  <td className={differs(line) ? 'is-diff' : ''}>{value(line, line.a)}</td>
                  <td className={differs(line) ? 'is-diff' : ''}>{value(line, line.b)}</td>
                </tr>
              ))}
              <tr className="ev-cmp-keep">
                <td />
                <td>{keepButton(first, T.FIRST_REGISTRATION)}</td>
                <td>{keepButton(second, T.SECOND_REGISTRATION)}</td>
              </tr>
            </tbody>
          </table>
        ))}
      {hidden && ready && <p className="field-hint">{T.COMPARE_HIDDEN_NOTE}</p>}
      <p className="field-hint ev-cmp-note">{T.COMPARE_NOTE_STAR}</p>
      <div className="dialog-actions ev-cmp-actions">
        <button type="button" className="btn" aria-disabled={saving || !ready ? 'true' : undefined} onClick={() => !saving && ready && onKeepBoth()}>
          {T.KEEP_BOTH}
        </button>
        {!isPhone && (
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {T.CLOSE}
          </button>
        )}
      </div>
      {failedText && (
        <div className="tdialog-note">
          <Notice>{failedText}</Notice>
        </div>
      )}
    </Dialog>
  );
}
