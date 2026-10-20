// MarkPaidDialog.jsx — "Mark paid — Mia Rossi · Paid at which school?" (v0.707, picture option A).
// Why it exists: a camp payment goes into the Daily report of the school whose desk took the money,
// so Mark paid records the device's school (the Worcester | Shrewsbury switcher). Only when the
// switcher is on Both AND the camp is for both schools is there no school to use — then Mark paid
// asks once, here. There is no default: the Mark paid button stays unavailable until a school is
// picked, so money never lands in the wrong drawer by accident.
// A small dialog on every device (like Save as template): Cancel / Mark paid.
//
// Props: row (the roster row), onConfirm(school), onClose
import { useId, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import * as T from './text.js';

const SCHOOLS = [
  { key: 'worcester', label: T.schoolName('worcester') },
  { key: 'shrewsbury', label: T.schoolName('shrewsbury') },
];

export default function MarkPaidDialog({ row, onConfirm, onClose }) {
  const idBase = useId();
  const [school, setSchool] = useState(null);
  const ready = school !== null;

  return (
    <Dialog title={T.markPaidTitle(T.camperLabel(row))} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.markPaidAmountLine(row.owesCents, row.payingBy)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onConfirm(school);
        }}
        noValidate
      >
        {/* The blue selected style, like the picture and "Paid by" (review item 2). */}
        <div className="field field--last">
          <span id={`${idBase}-school`} className="field-label">
            {T.PAID_AT_WHICH}
          </span>
          <div>
            <ChoiceGroup autoFocus labelId={`${idBase}-school`} value={school} options={SCHOOLS} onChange={setSchool} describedBy={ready ? undefined : `${idBase}-hint`} />
          </div>
          {!ready && (
            <p id={`${idBase}-hint`} className="field-hint">
              {T.PICK_SCHOOL_FIRST}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {T.CANCEL}
          </button>
          <button type="submit" className={`btn btn-primary${ready ? '' : ' is-unavailable'}`} aria-disabled={ready ? undefined : 'true'}>
            {/* ti-check: Color Belt's Mark paid button */}
            <IconCheck size={16} aria-hidden="true" />
            {T.MARK_PAID}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
