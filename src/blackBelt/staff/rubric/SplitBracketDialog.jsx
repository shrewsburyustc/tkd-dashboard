// SplitBracketDialog.jsx — "Split “All ages”" from a pass-mark bracket's ⋯ (mockup R6).
// Why it exists: CONTRACT-0024 §10.3. Asks the age to split at and shows the two brackets it
// makes; both keep the pass mark (change either one after), and a subject limited to the bracket
// stays limited to both halves (rubric.js splitBracket does the work).
// PC and tablet: a small dialog over the editor. Phones: a full-screen page over the full-screen
// editor (InnerDialog, so the editor keeps the browser-history step).
import { useId, useState } from 'react';
import Dialog from '../../../components/Dialog.jsx';
import { AGE_MAX, bracketLabel } from '../../../lib/blackBelt/rubric.js';
import InnerDialog from '../parts/InnerDialog.jsx';
import { FieldNote, NumberBox } from './fields.jsx';
import * as T from '../text.js';

export default function SplitBracketDialog({ bracket, danNo, where, isPhone, onSplit, onCancel }) {
  const id = useId();
  const [age, setAge] = useState('');
  const [tried, setTried] = useState(false);
  const from = typeof bracket.from === 'number' ? bracket.from : null;
  const to = typeof bracket.to === 'number' ? bracket.to : null;
  const min = (from ?? 0) + 1; // the first half must keep at least one age
  const max = to ?? AGE_MAX;
  const value = typeof age === 'number' ? age : null;
  const valid = Number.isInteger(value) && value >= min && value <= max;
  const label = bracketLabel(bracket);
  const points = bracket.pass_mark ?? '';
  const problem = (tried || String(age) !== '') && !valid ? T.splitAgeProblem(min, max) : null;

  function split() {
    if (!valid) {
      setTried(true);
      return;
    }
    onSplit(value);
  }

  const content = (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        split();
      }}
    >
      <p className="tdialog-sub">{T.splitSub(danNo, where)}</p>
      <div className="field">
        <label htmlFor={`${id}-age`}>{T.SPLIT_AT_AGE}</label>
        <NumberBox id={`${id}-age`} whole autoFocus value={age} onChange={setAge} invalid={Boolean(problem)} className="bbs-split-age" />
        <FieldNote text={problem} />
      </div>
      {valid && (
        <ul className="bbs-split-preview">
          <li>{T.splitPreview(bracketLabel({ from, to: value - 1 }), points)}</li>
          <li>{T.splitPreview(bracketLabel({ from: value, to }), points)}</li>
        </ul>
      )}
      <p className="field-hint">{T.SPLIT_HINT}</p>
      {isPhone ? (
        <div className="dialog-page-submit">
          <button type="submit" className={`btn btn-primary btn-block${valid ? '' : ' is-unavailable'}`} aria-disabled={valid ? undefined : 'true'}>
            {T.SPLIT}
          </button>
        </div>
      ) : (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {T.CANCEL}
          </button>
          <button type="submit" className={`btn btn-primary${valid ? '' : ' is-unavailable'}`} aria-disabled={valid ? undefined : 'true'}>
            {T.SPLIT}
          </button>
        </div>
      )}
    </form>
  );

  const Frame = isPhone ? InnerDialog : Dialog;
  return (
    <Frame title={T.splitTitle(label)} fullScreen={isPhone} onRequestClose={onCancel}>
      {content}
    </Frame>
  );
}
