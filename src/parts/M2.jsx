// M2.jsx — the parts page's samples of the shared "are you sure?" box (components/ConfirmBox.jsx;
// mockup M2, rulebook v1.103).
// Why it exists: the parts page (plan §4) shows every state with sample words (the mockup's) and
// sample actions (no database). "While it works" and "If it fails" are reached by pressing the
// box's own action button. Two extra states are for the behaviour checks only: the box ON TOP of
// another dialog (Back, Esc and a click outside close only the box; focus goes back), and an
// action whose busy words are longer than its usual words (nothing moves while it works).
import { useState } from 'react';
import { IconArrowBackUp, IconTrash, IconUserCheck } from '@tabler/icons-react';
import ConfirmBox from '../components/ConfirmBox.jsx';
import Dialog from '../components/Dialog.jsx';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { failAfter, findByWords, never, pressLikeKeyboard, pressLikeMouse, useLater } from './act.js';

const DELETE = {
  title: 'Delete Owen Reed permanently?',
  body: 'The registration and the $65 cash payment recorded on Oct 21 are deleted from November Children Testing. The payment won’t show in Payments recorded any more. This can’t be undone.',
  hint: 'To keep the record, use Withdraw instead.',
  keepLabel: 'Keep student',
  actionLabel: 'Delete permanently',
  actionIcon: IconTrash,
  busyLabel: 'Deleting…',
  loses: 'forGood',
};
const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";

const ASKS = {
  something: {
    title: 'Undo Lily Brooks’s payment?',
    body: 'The $140 cash payment recorded on Oct 17 is reversed and the row goes back to Not paid. Both stay in the history.',
    keepLabel: 'Keep payment',
    actionLabel: 'Undo payment',
    actionIcon: IconArrowBackUp,
    busyLabel: 'Undoing…',
    loses: 'something',
  },
  nothing: {
    title: 'Did Maya come to the free class?',
    body: 'Mon, Oct 26 · 4:00 PM · Little Tiger',
    keepLabel: 'Keep in Booked',
    actionLabel: 'Came',
    actionIcon: IconUserCheck,
    busyLabel: 'Saving…',
    loses: 'nothing',
  },
  leave: {
    title: '1 result isn’t saved',
    body: 'Ava Chen (Little Tiger) wasn’t saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back.',
    keepLabel: 'Stay on this page',
    actionLabel: 'Leave anyway',
    loses: 'forGood',
  },
  discard: {
    title: 'Discard changes to 1st Dan?',
    body: '3 changes aren’t saved.',
    keepLabel: 'Keep editing',
    actionLabel: 'Discard',
    loses: 'forGood',
  },
};

// For the behaviour checks only (not a mockup state, sample words): an action whose busy words are
// LONGER than its usual words, as Prospects' "Came" → "Saving…" (design re-check of D2). At 320 the
// pair fits side by side with its usual words but not with its busy words.
const WITHDRAW = {
  title: 'Withdraw Owen Reed?',
  body: 'Owen Reed moves to Removed, with his payment. You can add him back later.',
  keepLabel: 'Keep registration',
  actionLabel: 'Withdraw',
  busyLabel: 'Withdrawing…',
  loses: 'something',
};

// A sample section around the box. `act` is the action: never (while it works), failing, or
// instant (a leave warning leaves at once). After Keep or a finished action the box closes and a
// button opens it again.
function SampleBox({ ask, act = () => undefined, failedText = DELETE_FAILED, onTop = false, returnFocusTo = null, onClosed }) {
  const [failed, setFailed] = useState(null);
  const { body, ...words } = ask;
  return (
    <ConfirmBox
      {...words}
      failed={failed}
      onTop={onTop}
      returnFocusTo={returnFocusTo}
      onKeep={onClosed}
      onConfirm={() => {
        const result = act();
        if (!result) {
          onClosed();
          return undefined;
        }
        return result.then(onClosed, () => setFailed(failedText));
      }}
    >
      {body}
    </ConfirmBox>
  );
}

function BoxState(props) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the box again
          </button>
        </p>
      )}
      {open && <SampleBox {...props} onClosed={() => setOpen(false)} />}
    </>
  );
}

// "While it works": the action pressed as a mouse would (no focus ring) → "Deleting…" until …never.
function BusyState() {
  useLater(() => pressLikeMouse(findByWords('[role=alertdialog] button', DELETE.actionLabel)), 300);
  return <BoxState ask={DELETE} act={never} />;
}

// "If it fails": the action pressed with the keyboard (Tab to it, Enter: the ring stays on it).
function FailedState() {
  useLater(() => pressLikeKeyboard(findByWords('[role=alertdialog] button', DELETE.actionLabel)), 300);
  return <BoxState ask={DELETE} act={() => failAfter(300)} />;
}

// The box ON TOP of another dialog (Dialog.jsx's onTop): an Edit details dialog whose "Delete
// permanently…" button opens the box. Back, Esc and a click outside close only the box, and focus
// goes back to the button that opened it.
function OnTopState() {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [edit, setEdit] = useState(true);
  const [ask, setAsk] = useState(null); // the button that opened the box (its returnFocusTo), or null
  return (
    <>
      {!edit && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>
            Open Edit details again
          </button>
        </p>
      )}
      {edit && (
        <Dialog title="Edit details" size="detail" fullScreen={isPhone} onRequestClose={() => setEdit(false)}>
          <p className="tdialog-sub">Owen Reed · November Children Testing</p>
          <p className="parts-dialog-text">A sample form dialog. Its button below opens the “are you sure?” box on top of it.</p>
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus onClick={() => setEdit(false)}>
              Close
            </button>
            <button type="button" className="btn btn-delete" data-open-ask onClick={(event) => setAsk(event.currentTarget)}>
              <IconTrash size={16} aria-hidden="true" />
              Delete permanently…
            </button>
          </div>
          {ask && <SampleBox ask={DELETE} act={never} onTop returnFocusTo={ask} onClosed={() => setAsk(null)} />}
        </Dialog>
      )}
    </>
  );
}

export const PART = {
  id: 'M2',
  title: 'The “are you sure?” box',
  file: 'ConfirmBox.jsx (ConfirmButtons)',
  states: [
    { id: 'forgood', title: 'Loses something for good', dialog: true, render: () => <BoxState ask={DELETE} act={never} /> },
    { id: 'busy', title: 'While it works', dialog: true, render: () => <BusyState /> },
    { id: 'failed', title: 'If it fails', dialog: true, render: () => <FailedState /> },
    { id: 'something', title: 'Loses something, not for good', dialog: true, render: () => <BoxState ask={ASKS.something} act={never} /> },
    { id: 'nothing', title: 'Loses nothing', dialog: true, render: () => <BoxState ask={ASKS.nothing} act={never} /> },
    { id: 'leave', title: 'A leave warning', dialog: true, render: () => <BoxState ask={ASKS.leave} /> },
    { id: 'discard', title: 'Black Belt’s “Discard changes?”', dialog: true, render: () => <BoxState ask={ASKS.discard} /> },
  ],
  // Not mockup states: for the behaviour checks only.
  extra: [
    { id: 'ontop', title: 'On top of another dialog (behaviour check)', dialog: true, render: () => <OnTopState /> },
    { id: 'withdraw', title: 'Longer busy words: “Withdraw” → “Withdrawing…” (behaviour check)', dialog: true, render: () => <BoxState ask={WITHDRAW} act={never} /> },
  ],
};

