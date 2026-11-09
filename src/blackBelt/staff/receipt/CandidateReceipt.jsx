// CandidateReceipt.jsx — "Receipt" for one Black Belt candidate: reads it, then hands it to the
// shared receipt box (src/components/Receipt.jsx; design review BB2, rulebook v1.002 / v1.105).
// Why it exists: Black Belt used to draw its own receipt preview and printed page (ReceiptDialog.jsx,
// ReceiptPage.jsx, receipt.css). The shared receipt draws all of that now (the box with the page at
// reading size, Close and "Print or save as PDF", the full-screen phone page, the printed page
// and its print rules). This small file does only what is Black Belt's own:
//   - reads the receipt fresh each time the box opens (loadReceipt), so it shows every payment up
//     to now. Nothing is logged (rule S20) and nothing is stored: the data lives while the box is
//     open;
//   - turns it into the shared plain receipt (buildReceipt.js);
//   - the three states the shared box draws: a gray placeholder page while it loads (Print grayed),
//     the amber bar with Retry when it can't load (Print grayed), and "This candidate was deleted,
//     so there is no receipt." when it is gone;
//   - Hide private details on: nothing about money is read at all; the box shows its one gray line,
//     "Payment details are hidden on this tablet.", and no Print button (v1.105).
//
// Props:
//   candidateId   the candidate whose receipt this is
//   cycle         the cycle page's CycleDetail (first testing day and prices; see buildReceipt.js)
//   isPhone       true on phones (full screen)
//   onClose       Close / Esc / ← / backdrop
//   onNoAccess    the app's "no access" path (lock screen / signed out), called when the database
//                 answers no_access — instead of "Couldn't load the receipt"
//   kukkiwonAddedOn, registeredOn   optional: the day the Kukkiwon fee was chosen and the day the
//                 candidate registered (the receipt data has neither); a fee added after payment
//                 1's date prints "added Apr 26" instead of "with payment 1"
// The receipt opens on its own (the candidate's detail waits behind the scenes while a child
// dialog is open, useCandidateActions.js), so it never needs `onTop`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReceiptDialog from '../../../components/Receipt.jsx';
import { loadReceipt } from '../../../lib/blackBelt/api.js';
import { usePrivateDetailsHidden } from '../../../lib/privateDetails.js';
import { buildBlackBeltReceipt } from './buildReceipt.js';
import * as T from './text.js';

export default function CandidateReceipt({ candidateId, cycle, isPhone, onClose, onNoAccess, kukkiwonAddedOn = null, registeredOn = null }) {
  const [hidden] = usePrivateDetailsHidden();
  // { phase: 'loading' } · { phase: 'ok', receipt } · { phase: 'failed', status }
  const [load, setLoad] = useState({ phase: 'loading' });
  // The newest onNoAccess, kept in a "ref" (a box React doesn't watch) so a new function from the
  // parent never makes the receipt load again.
  const noAccessRef = useRef(onNoAccess);
  useEffect(() => {
    noAccessRef.current = onNoAccess;
  });

  // Asks the database for the receipt. `isCurrent` says whether the box is still waiting for this
  // answer (it may have closed, or changed candidate, while the answer was on its way).
  const read = useCallback(
    async (isCurrent = () => true) => {
      setLoad({ phase: 'loading' });
      const answer = await loadReceipt({ candidateId });
      if (!isCurrent()) return;
      if (answer.status === 'ok' && answer.receipt) setLoad({ phase: 'ok', receipt: answer.receipt });
      else if (answer.status === 'no_access' && noAccessRef.current) noAccessRef.current(); // the lock / sign-in path; the placeholder stays meanwhile
      else setLoad({ phase: 'failed', status: answer.status });
    },
    [candidateId],
  );

  // Read on open (not while private details are hidden on this device: then nothing about money loads).
  useEffect(() => {
    if (hidden) return undefined;
    let current = true;
    read(() => current);
    return () => {
      current = false;
    };
  }, [read, hidden]);

  const raw = load.phase === 'ok' ? load.receipt : null;
  const plain = useMemo(() => (raw ? buildBlackBeltReceipt(raw, cycle, { kukkiwonAddedOn, registeredOn }) : null), [raw, cycle, kukkiwonAddedOn, registeredOn]);
  const gone = load.phase === 'failed' && load.status === 'not_found';
  return (
    <ReceiptDialog
      receipt={hidden ? null : plain}
      sub={raw ? T.dialogSub(raw.candidate.firstName, raw.candidate.lastName, raw.cycleName) : cycle?.name ?? ''}
      loadError={load.phase === 'failed' && !gone}
      onRetry={() => read()}
      notFound={gone ? T.NOT_FOUND : null}
      hidden={hidden}
      onClose={onClose}
      isPhone={isPhone}
    />
  );
}
