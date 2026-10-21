// PrivateGradingPage.jsx — grading ONE private testing (a candidate with a private day and time).
// Why it exists: private students are off the Grading tab's grid and its printed sheet (v0.151,
// v0.153); their own testing is graded here, one column at most 520px wide on every device (PC,
// tablet sideways and upright, phone). Approved: Phase 5 gap mockups H5 (proposals 18–21) with
// Q1 = A and Q2 = B (rulebook v0.512).
//
//   ← Fall 2026 Star Testing                                  [Print grading sheet]
//   Private testing · Alex Kim
//   Tue, Dec 1, 2026 · 4:00 PM · 1st Dan · 1 star → 2 stars · Shrewsbury
//   (the save engine's banner / a never-retried answer's banner)
//   GradeCard: a line per subject with a grade dropdown, the two class counts, Total and Result
//
// How it fits in (Q1 = A): this is a VIEW INSIDE the event page, not a page with its own address.
// StarEventPage opens it from the Candidates tab's ⋯ → "Grade private testing"; the address bar
// never changes, the browser tab title stays "Star testing" (proposal 21, so browser history never
// shows a name), and a reload returns to the Candidates tab. ← goes back to the Candidates tab and
// never asks (proposal 8: the saves belong to the event page and keep going); leaving the event
// page asks while anything is Not saved (proposal 7).
// The row comes from StarEventPage (gradingApi.loadPrivateGrading, refreshed every 15 seconds) and
// is part of the rows of the event page's ONE useStarGradingSaves, so its Not saved cells keep
// retrying after ← and the leave guard counts them.
// Hide private details (v0.506, H7): nothing here changes — no date of birth, email or payment is
// shown at all (the read keeps only grading fields).
//
// Props:
//   event, copy           the event and its rubric copy (subjects, credits, letters)
//   row                   loadPrivateGrading's row (null until the first read answers)
//   loadFailed            true when the first read failed (amber banner with Retry)
//   saves                 the event page's useStarGradingSaves()
//   isAdmin               shows "Choose subjects" to admins (a below-the-pass-mark make-up)
//   onBack()              ← back to the Candidates tab
//   onPrint(opener)       Print grading sheet (Q2 = B): StarEventPage prints the one-row sheet
//   onRetryLoad()
//   onGradingChanged()    after Choose subjects saved: reload
//   pageBanner, onDismissPageBanner   a never-retried answer (H2) — ✕ only
//   screenLocked, onNoAccess, onModalOpenChange(open)
import { useEffect, useState } from 'react';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import { gradeLetters, judgedSubjects } from '../../../../lib/star/gradingApi.js';
import { shortDate } from '../../../../lib/star/eventsText.js';
import { startTimeLabel } from '../../../../lib/star/starEventRules.js';
import { PHONE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import { schoolName, testingFor } from '../candidates/text.js';
import GradeCard from './GradeCard.jsx';
import MakeupChoiceDialog from './MakeupChoiceDialog.jsx';
import * as T from './text.js';
import './grading.css';

export default function PrivateGradingPage({
  event,
  copy,
  row,
  loadFailed,
  saves,
  isAdmin,
  onBack,
  onPrint,
  onRetryLoad,
  onGradingChanged,
  pageBanner,
  onDismissPageBanner,
  screenLocked,
  onNoAccess,
  onModalOpenChange,
}) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [choose, setChoose] = useState(null); // { opener } — Choose subjects (admins)

  // The dialog makes the page behind it inert (App.jsx).
  const dialogOpen = choose !== null && !screenLocked && row !== null;
  useEffect(() => {
    onModalOpenChange(dialogOpen);
  }, [dialogOpen, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // Keyboard focus starts on the title when the page opens (it replaced the Candidates tab).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.querySelector('.stg-private-head .ptitle, .stg-private-head .st-back')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function closeChoose(changed) {
    const opener = choose?.opener;
    setChoose(null);
    if (changed) onGradingChanged();
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }

  const name = row ? `${row.firstName} ${row.lastName}` : '';
  const backLink = (
    <button type="button" className="link-button st-back" aria-label={T.backToEventLabel(event.name)} onClick={onBack}>
      {/* ti-arrow-left = back */}
      <IconArrowLeft size={16} aria-hidden="true" />
      {event.name}
    </button>
  );

  let body;
  if (!row && loadFailed) {
    body = <ErrorBanner text={T.LOAD_PRIVATE_FAILED} onRetry={onRetryLoad} />;
  } else if (!row) {
    body = (
      <div className="clist tskeleton stg-private-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_PRIVATE}</span>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="stg-private-body">
        {saves.banner && <ErrorBanner text={saves.banner.text} onRetry={saves.retryAll} onDismiss={saves.dismissBanner} />}
        {pageBanner && <ErrorBanner text={pageBanner} onDismiss={onDismissPageBanner} />}
        <GradeCard
          row={row}
          subjects={judgedSubjects(copy, row.dan)}
          letters={gradeLetters(copy)}
          saves={saves}
          isAdmin={isAdmin}
          onChooseSubjects={isAdmin ? (_r, opener) => setChoose({ opener }) : undefined}
          label={T.privateGradesLabel(name)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="phead st-event-head stg-private-head">
        <div className="phead-titles">
          {backLink}
          {row ? (
            <>
              <h1 className="ptitle" tabIndex={-1}>
                {T.privatePageTitle(name)}
              </h1>
              <p className="st-summary">
                {T.privatePageLine(
                  shortDate(row.privateOn),
                  startTimeLabel(row.privateTime),
                  row.danLabel,
                  testingFor(row),
                  schoolName(row.locationCode),
                )}
              </p>
            </>
          ) : (
            !loadFailed && (
              <div className="st-head-skeleton" aria-hidden="true">
                <span className="st-skel-bar st-skel-title" />
                <span className="st-skel-bar st-skel-line" />
              </div>
            )
          )}
        </div>
        {row && (
          <div className="st-event-buttons">
            <button type="button" className="btn stg-print" onClick={(clickEvent) => onPrint(clickEvent.currentTarget)}>
              {/* ti-printer = print */}
              <IconPrinter size={16} aria-hidden="true" />
              {T.PRINT_SHEET}
            </button>
          </div>
        )}
      </div>
      {body}
      {choose && row && !screenLocked && (
        <MakeupChoiceDialog
          row={row}
          result={saves.resultFor(row)}
          letters={gradeLetters(copy)}
          isPhone={isPhone}
          onClose={closeChoose}
          onNoAccess={onNoAccess}
        />
      )}
    </>
  );
}
