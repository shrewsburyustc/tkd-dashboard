// M3.jsx — the parts page's samples of the shared Mark paid box (components/MarkPaidBox.jsx;
// mockup M3, rulebook v1.104).
// Why it exists: the parts page (plan §4) shows every state with fake people (no database). Each
// state draws a simplified roster row (sample context, parts.css) and opens the box from the row's
// own opener — Color Belt's Mark paid button, or Camps' "Owes $15.50" tag — as a press would.
// Mark paid $X here only shows what the section would be told; nothing is saved. One extra state,
// for the behaviour checks only, draws two rows inside a dialog.
import { useRef, useState } from 'react';
import { IconCheck, IconDots } from '@tabler/icons-react';
import Dialog from '../components/Dialog.jsx';
import MarkPaidBox from '../components/MarkPaidBox.jsx';
import { findByWords, pressLikeKeyboard, useLater } from './act.js';

// The row the box opens from (a simplified copy of Color Belt's / Camps' row; context only).
// autoOpen: false leaves the box closed until the opener is pressed.
function SampleRow({ person, camps = false, owes = null, autoOpen = true, onOpened }) {
  const openerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [told, setTold] = useState(null);

  // The box opens as a press on the opener would open it (the opener isn't focused by this).
  useLater(() => {
    if (autoOpen) openerRef.current?.click();
  }, 200);
  useLater(() => onOpened?.(), 500);

  return (
    <div className="parts-row-stage" data-shot>
      <div className="parts-ctx-row">
        <span className="parts-ctx-who">
          <b>{person.name}</b> <span className="parts-ctx-meta">{person.meta}</span>
        </span>
        {!camps && <span className="parts-ctx-meta parts-ctx-col">{person.choiceText}</span>}
        {!camps && <span className="ttag">Not paid</span>}
        <span className="parts-ctx-anchor">
          {camps ? (
            <button ref={openerRef} type="button" className="ttag ttag--warn parts-tag-button" aria-haspopup="dialog" onClick={() => setOpen((now) => !now)}>
              {owes}
            </button>
          ) : (
            <button ref={openerRef} type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={() => setOpen((now) => !now)}>
              <IconCheck size={16} aria-hidden="true" />
              Mark paid
            </button>
          )}
        </span>
        <span className="parts-ctx-more" aria-hidden="true">
          <IconDots size={16} />
        </span>
      </div>
      {told && <p className="parts-note">Sample: the section is told “{told}” and saves it (nothing is saved here).</p>}
      {open && (
        <MarkPaidBox
          anchor={openerRef.current}
          name={person.name}
          amountCents={person.amountCents}
          familyChoice={person.choice}
          choiceWhere="form"
          onMarkPaid={(method) => setTold(method)}
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) openerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

const NOAH = { name: 'Noah Kim', meta: 'Registered Oct 13', choice: 'check', choiceText: 'Check', amountCents: 5000 };
const LEO = { name: 'Leo Kim', meta: '· 11', choice: 'cash', choiceText: 'Cash', amountCents: 1550 };
const MIA = { name: 'Mia Lopez', meta: 'Added Oct 20', choice: null, choiceText: '—', amountCents: 5000 };
const AVA = { name: 'Ava Chen', meta: '· 9', choice: 'card', choiceText: 'Card', amountCents: 3000 };

// For the behaviour checks only (not a mockup state): the box opened from rows inside a dialog,
// whose first and last Tab stops are the two rows' tags (code re-check of D7). A Tab out of the
// box must leave focus on its opener — the dialog's own Tab wrap-around must not move it on.
function InDialogState() {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <p className="parts-note">
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the dialog again
          </button>
        </p>
      )}
      {open && (
        <Dialog title="April Vacation Camp" size="detail" onRequestClose={() => setOpen(false)}>
          <p className="tdialog-sub">Two campers who owe money (a sample dialog for the behaviour checks).</p>
          <SampleRow person={LEO} camps owes="Owes $15.50" autoOpen={false} />
          <SampleRow person={AVA} camps owes="Owes $30" autoOpen={false} />
        </Dialog>
      )}
    </>
  );
}

export const PART = {
  id: 'M3',
  title: 'The Mark paid box',
  file: 'MarkPaidBox.jsx (PaidByField)',
  states: [
    { id: 'open', title: 'As it opens', render: () => <SampleRow person={NOAH} /> },
    {
      id: 'other',
      title: 'They pay another way',
      // One tap on Card (drawn with the keyboard's ring, as the mockup marks it)
      render: () => <SampleRow person={NOAH} onOpened={() => pressLikeKeyboard(findByWords('.mpb [role=radio]', 'Card'))} />,
    },
    { id: 'owes', title: 'Camps: from the tag, with cents', render: () => <SampleRow person={LEO} camps owes="Owes $15.50" /> },
    { id: 'nochoice', title: 'No choice on record', render: () => <SampleRow person={MIA} /> },
  ],
  // Not a mockup state: for the behaviour checks only.
  extra: [{ id: 'indialog', title: 'Inside a dialog (behaviour check)', dialog: true, render: () => <InDialogState /> }],
};
