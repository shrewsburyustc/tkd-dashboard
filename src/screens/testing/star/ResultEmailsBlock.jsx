// ResultEmailsBlock.jsx — the always-open "Result emails" block at the bottom of Star testing →
// Rubrics and prices (build phase 6, gap mockups R11, proposals 42–45, rulebook v0.514).
// Why it exists: admins choose the wording of the three result emails that Email result copies on
// the Results tab (R3 = B). Staff see the same block READ-ONLY — they send these emails, so they
// can read what goes out (proposal 43); the tab's existing "View only. Ask an admin to make
// changes." line already covers them.
// Drawn like the other blocks under the Dan list (SettingsBlocks.jsx: Grade scale, Assistant-class
// table, Fees):
//   - header "Result emails", the gray line under it
//   - "Subject": the fixed subject line, as plain text, with "the same for every email; it can’t be
//     changed." (proposal 45 — it goes into the email link, so it never carries a name or a result)
//   - one row per email kind (Passed · Make-up with a D · Make-up below 245) with the START of its
//     text (PC / tablet: one line, cut with "…"; phone: up to two lines under the name), and an
//     Edit icon (ti-edit) for admins
//   - the foot line: Email result uses the text as it is when it's clicked (Question Q5 = A)
// PLAIN TEXT ONLY: the texts are whatever an admin typed (they may hold < > &), so they are shown
// as React text — never as HTML.
import { IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { RESULT_KINDS, RESULT_SUBJECT } from '../../../lib/star/resultEmail.js';
import * as R from '../../../lib/star/resultsText.js';
import './resultEmails.css';

// The start of a text on one line: line breaks and runs of spaces become one space.
const oneLine = (body) => String(body ?? '').replace(/\s+/g, ' ').trim();

export default function ResultEmailsBlock({ status, texts, passMark, isAdmin, isPhone, isTouch, selectedKind, onEdit, onRetry }) {
  const grid = isPhone ? 'st-g-remp' : isTouch ? 'st-g-remt' : 'st-g-rem';
  const editCell = (kind) =>
    isAdmin ? (
      <span className="st-cacts">
        <span className="acts">
          <IconButton
            label={R.editTextLabel(kind, passMark)}
            Icon={IconEdit}
            data-star-edit-text={kind}
            onClick={(event) => onEdit(kind, event.currentTarget)}
          />
        </span>
      </span>
    ) : (
      <span aria-hidden="true" />
    );

  let rows;
  if (status === 'loading' || (!texts && status !== 'error')) {
    rows = (
      <div className="tskeleton" aria-busy="true">
        {RESULT_KINDS.map((kind) => (
          <div key={kind} className="tskeleton-row st-rem-skel" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (!texts) {
    rows = (
      <div className="st-rem-error">
        <ErrorBanner text={R.TEXTS_LOAD_FAILED} onRetry={onRetry} />
      </div>
    );
  } else {
    rows = RESULT_KINDS.map((kind) => {
      const name = R.kindName(kind, passMark);
      const start = oneLine(texts[kind]?.body);
      return (
        <div key={kind} className={`st-trow st-remrow ${grid}${selectedKind === kind ? ' is-selected' : ''}${isAdmin ? '' : ' is-staff'}`}>
          {isPhone ? (
            <span className="st-remmain">
              <b>{name}</b>
              <span className="st-remtx">{start}</span>
            </span>
          ) : (
            <>
              <span>
                <b>{name}</b>
              </span>
              <span className="st-remtx">{start}</span>
            </>
          )}
          {editCell(kind)}
        </div>
      );
    });
  }

  return (
    <section className="st-blk" aria-label={R.RESULT_EMAILS_TITLE}>
      <div className="st-bhead">
        <h2 className="st-bname">{R.RESULT_EMAILS_TITLE}</h2>
      </div>
      <p className="st-bsub">{R.RESULT_EMAILS_SUB}</p>
      {/* The subject line: fixed in the app, never stored (v0.248) */}
      <div className={`st-trow st-remrow ${grid}${isAdmin ? '' : ' is-staff'}`}>
        {isPhone ? (
          <span className="st-remmain">
            <b>{R.SUBJECT_LABEL}</b>
            <span className="st-remtx st-remtx--subject">
              {RESULT_SUBJECT}
              <br />
              {R.SUBJECT_FIXED_NOTE}
            </span>
          </span>
        ) : (
          <>
            <span>
              <b>{R.SUBJECT_LABEL}</b>
            </span>
            <span className="st-remsubj">
              {RESULT_SUBJECT} <span className="st-muted-13">· {R.SUBJECT_FIXED_NOTE_INLINE}</span>
            </span>
          </>
        )}
        <span aria-hidden="true" />
      </div>
      {rows}
      <p className="st-bfoot">{R.TEXTS_USED_WHEN_CLICKED}</p>
    </section>
  );
}
