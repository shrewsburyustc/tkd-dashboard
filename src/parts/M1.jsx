// M1.jsx — the parts page's samples of the possible-duplicate box and the Compare dialog
// (components/DuplicateBox.jsx and CompareDialog.jsx; mockup M1, rulebook v1.102).
// Why it exists: the parts page (plan §4) shows every state of every shared part, with fake
// people and sample actions (no database). A "section" here is a tiny sample screen that holds the
// state a real section would hold (what is being saved, a failure) and passes it to the part.
import { useState } from 'react';
import CompareDialog from '../components/CompareDialog.jsx';
import DuplicateBox from '../components/DuplicateBox.jsx';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { failAfter, findByWords, never, pressLikeMouse, useLater } from './act.js';

// The section's words (Color Belt's), as the mockup shows them.
const TITLE = 'Mia Lopez is registered twice';
const SUB = 'Same name in the same class. Differences are highlighted.';
const HEADS = ['First registration', 'Second registration'];
const NOTE = 'Keeping one moves the other to Removed as “Duplicate copy” (Undo for 5 seconds; admins can Restore). Both are logged.';
const ADMIN_ONLY = 'The testing day is over. Only an admin can keep one registration and remove the other now.';
const LOAD_FAILED = "Couldn't load this candidate. Check the connection, then retry."; // Star's words
const BLOCKED = 'These registrations changed just now. Close and open them again.'; // Black Belt's words
const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";

function rows(hidden) {
  return [
    { key: 'registered', label: 'Registered', first: 'Oct 14, 6:05 PM · family form', second: 'Oct 16, 8:12 AM · family form', plain: true },
    { key: 'reference', label: 'Reference', first: 'CB-3110', second: 'CB-3117', plain: true },
    { key: 'testing', label: 'Testing for', first: 'Yellow → Orange', second: 'Yellow → Orange' },
    { key: 'paying', label: 'Paying by', first: 'Cash', second: 'Check', hidden },
    { key: 'payment', label: 'Payment', first: 'Paid Oct 17', second: 'Not paid', hidden },
  ];
}

// A sample section around the Compare dialog. `save` is what Keep this one / keep both do (a
// promise: never → "while it works"; failing → the amber note).
function SampleCompare({ hidden = false, canKeepOne = true, loading = false, loadError = null, blocked = false, save = never, onClosed }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(null);
  const [state, setState] = useState({ loading, loadError });

  function run(what) {
    setFailed(null);
    setBusy(what);
    save().then(
      () => setBusy(null),
      () => {
        setBusy(null);
        setFailed(SAVE_FAILED);
      },
    );
  }

  return (
    <CompareDialog
      title={TITLE}
      sub={SUB}
      heads={HEADS}
      rows={rows(hidden)}
      canKeepOne={canKeepOne}
      note={canKeepOne ? NOTE : ADMIN_ONLY}
      loading={state.loading}
      loadError={state.loadError}
      onRetry={() => {
        // Sample: reads again for a moment, then fails again.
        setState({ loading: true, loadError: null });
        window.setTimeout(() => setState({ loading: false, loadError: LOAD_FAILED }), 600);
      }}
      busy={busy}
      failed={failed}
      blockingNote={blocked ? BLOCKED : null}
      onKeep={(index) => run(index === 0 ? 'keep-first' : 'keep-second')}
      onKeepBoth={() => run('keep-both')}
      onClose={onClosed}
      isPhone={isPhone}
    />
  );
}

// A state that opens the dialog right away, with a button to open it again after Close.
function CompareState(props) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the Compare dialog again
          </button>
        </p>
      )}
      {open && <SampleCompare {...props} onClosed={() => setOpen(false)} />}
    </>
  );
}

// "While it works" / "If saving fails": Keep this one (first column) pressed as a mouse would.
function PressKeep(props) {
  useLater(() => pressLikeMouse(findByWords('[role=dialog] button', 'Keep this one: First registration')), 300);
  return <CompareState {...props} />;
}

// The box above a roster; Review opens the compare (focus goes back to Review when it closes).
function BoxState({ pairs, countText }) {
  const [review, setReview] = useState(null); // the Review button that opened it
  return (
    <div className="parts-roster" data-shot>
      <DuplicateBox
        countText={countText}
        pairs={pairs.map((text, index) => ({
          key: String(index),
          text,
          onReview: (opener) => setReview(opener),
        }))}
      />
      {review && (
        <SampleCompare
          onClosed={() => {
            review.focus();
            setReview(null);
          }}
        />
      )}
    </div>
  );
}

export const PART = {
  id: 'M1',
  title: 'Compare dialog and possible-duplicate box',
  file: 'CompareDialog.jsx, DuplicateBox.jsx',
  states: [
    { id: 'box1', title: 'The box, one pair', render: () => <BoxState countText="1 possible duplicate" pairs={['Ava Thompson is signed up twice']} /> },
    {
      id: 'box',
      title: 'The box, two pairs',
      render: () => <BoxState countText="2 possible duplicates" pairs={['Mia Lopez (Group A) is registered twice', 'Noah Kim (Little Tiger) is registered twice']} />,
    },
    { id: 'compare', title: 'Compare, with differences', dialog: true, render: () => <CompareState /> },
    { id: 'busy', title: 'While it works (Keeping…)', dialog: true, render: () => <PressKeep save={never} /> },
    { id: 'staff', title: 'Only an admin can keep one now', dialog: true, render: () => <CompareState canKeepOne={false} /> },
    { id: 'hidden', title: 'Hide private details on', dialog: true, render: () => <CompareState hidden /> },
    { id: 'loading', title: 'While the two records load', dialog: true, render: () => <CompareState loading /> },
    { id: 'loadfail', title: "If they can't load", dialog: true, render: () => <CompareState loadError={LOAD_FAILED} /> },
    { id: 'blocked', title: 'Changed on another device', dialog: true, render: () => <CompareState blocked /> },
    { id: 'failed', title: 'If saving fails', dialog: true, render: () => <PressKeep save={() => failAfter(300)} /> },
  ],
};
