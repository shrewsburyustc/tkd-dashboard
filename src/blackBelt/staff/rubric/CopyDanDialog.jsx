// CopyDanDialog.jsx — "Copy from another Dan" (mockup R9).
// Why it exists: CONTRACT-0024 §6.5 / §10.3. The admin picks one of the other three Dans (each
// shows its subject count, pass mark(s) and most points). The amber box says exactly what
// happens: everything in this Dan's draft is replaced (part names, grade points, subjects,
// scoring, pass-mark brackets, extra points) and its unsaved changes are lost (that sentence is
// left out when there are none). The copy is the other Dan's SAVED version and only lands in the
// draft — nothing is stored until Save [Dan] (decided client-side, §6.5).
// PC and tablet: a dialog. Phones: full screen over the editor, the button at the bottom.
import { useId, useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import { RUBRIC_DANS } from '../../../lib/blackBelt/rubric.js';
import InnerDialog from '../parts/InnerDialog.jsx';
import { mostPointsList, passMarksList } from './summary.js';
import * as T from '../text.js';

export default function CopyDanDialog({ rubric, danNo, where, unsaved, isPhone, onCopy, onCancel }) {
  const id = useId();
  const others = RUBRIC_DANS.filter((n) => n !== danNo);
  const [from, setFrom] = useState(others[0]);

  const choices = (
    <div className="bbs-copy-list" role="radiogroup" aria-labelledby={`${id}-sub`}>
      {others.map((n) => {
        const dan = rubric.dans.find((x) => x.dan === n);
        const subjects = (dan?.parts ?? []).reduce((sum, p) => sum + (p.subjects?.length ?? 0), 0);
        return (
          <label key={n} className={`bbs-copy-choice${from === n ? ' is-checked' : ''}`}>
            <input type="radio" name={`${id}-dan`} className="bbs-radio" checked={from === n} onChange={() => setFrom(n)} data-autofocus={from === n ? true : undefined} />
            <span className="bbs-copy-text">
              <span className="bbs-copy-dan">{T.DAN_LABELS[n]}</span>
              <span className="bbs-copy-line">{T.copyChoiceLine(subjects, passMarksList(dan), mostPointsList(dan))}</span>
            </span>
          </label>
        );
      })}
    </div>
  );

  const warning = (
    <p className="bb-amber-line bbs-copy-warning">
      <IconAlertTriangle size={16} aria-hidden="true" />
      <span>{T.copyWarning(danNo, from, unsaved)}</span>
    </p>
  );

  const content = (
    <>
      <p id={`${id}-sub`} className="tdialog-sub">
        {T.copyInto(danNo, where)}
      </p>
      {choices}
      {warning}
      {isPhone ? (
        <div className="dialog-page-submit">
          <button type="button" className="btn btn-primary btn-block" onClick={() => onCopy(from)}>
            {T.copyDan(from)}
          </button>
        </div>
      ) : (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onCopy(from)}>
            {T.copyDan(from)}
          </button>
        </div>
      )}
    </>
  );

  if (isPhone) {
    return (
      <InnerDialog title={T.COPY_TITLE} fullScreen onRequestClose={onCancel}>
        {content}
      </InnerDialog>
    );
  }
  return (
    <Dialog title={T.COPY_TITLE} size="medium" onRequestClose={onCancel}>
      {content}
    </Dialog>
  );
}
