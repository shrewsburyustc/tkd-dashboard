// ResultRows.jsx — the rows of Star testing's Results tab: one Dan, one row per candidate (build
// phase 6).
// Why it exists: approved Results mockups screens 1–3 (v0.138, v0.146) and the Phase 6 gap mockups
// R1, R2, R5, R6, R10 (rulebook v0.514). This file only DRAWS the rows; ResultsTab.jsx decides what
// the buttons do. Rows come in belt order from the database (v0.117), and the result on each row
// is the DATABASE's (star_event_results — the screen never works a result out, v0.158).
//
// Layouts (proposal 6; the breakpoints of useMediaQuery.js, as the rest of the dashboard):
//   PC and the tablet held sideways (≥ 1024px): five columns
//     Candidate (+ school) · Testing for · Total of 315 · Result (tag, reason, sent line) · actions
//   the upright tablet (640–1023px): four columns — Testing for goes under the name
//     Candidate (+ "Shrewsbury · 0 → 1 star") · Total · Result · actions
//   phones (< 640px): stacked rows — name + school, "0 → 1 star · 280", the tag, the reason, the sent
//     line, then Email result; ⋯ at the right
// On touch the only buttons in a row are Email result and Mark as sent, plus ⋯ (§2.5); rows grow to
// fit (about 76px). Each button keeps a 44px tap area on touch (results.css).
//
// The Result column (proposals 3–5, 10, 20, 25–27):
//   the tag — green "Passed", amber "⚠ Make-up", gray "Not finished", gray "Testing privately" with
//     ti-calendar-event (not purple, proposal 5)
//   the reason — resultsApi.resultReason (with the late-grade note); admins get "Choose subjects"
//     after "Below 245 · an admin chooses subjects" (the Grading dialog, v0.513)
//   the sent line — the database's ("Not sent yet", "Sent Nov 16 · Staff", "Not sent yet · an earlier
//     Make-up result was sent Nov 16"), or after an Email result click on THIS device (page memory
//     only, proposal 10): "Message copied — paste it into the email (Ctrl+V)." then "Email opened —
//     did you send it? [Mark as sent]"
// Email result shows only where the email can say what to work on (proposal 7, canMarkSent). With
// Hide private details on it is grayed (Q4 = A; the line above the list says why).
// PRIVACY (v0.160): a row holds no date of birth, email or payment.
//
// Props:
//   rows   ResultRows (resultsApi.loadResults) of the Dan, already filtered by school
//   ctx    { layout: { isPhone, isWide, isTouch }, nav (useRowArrowNav), isAdmin, hidden, maxScore,
//            testingDate, label, menuFor, busyId, asked(row) → { copied: bool } | null,
//            handlers: { onOpen(row), onEmail(row, opener), onMarkSent(row, opener),
//                        onMore(row, anchor), onChooseSubjects(row, opener) } }
import { IconAlertTriangle, IconCalendarEvent, IconCopy, IconDots, IconMail } from '@tabler/icons-react';
import IconButton from '../../../../components/IconButton.jsx';
import { canMarkSent, resultReason, resultTag, resultsTotalText, sentLine } from '../../../../lib/star/resultsApi.js';
import { schoolName } from '../candidates/text.js';
import * as T from './text.js';

const { R } = T;
const nameOf = (row) => `${row.firstName} ${row.lastName}`;

// The tag (proposals 3, 5). One per row.
function Tag({ result }) {
  const tag = resultTag(result);
  const tone = tag.tone === 'green' ? ' ttag--ok' : tag.tone === 'amber' ? ' ttag--warn' : '';
  return (
    <span className={`ttag${tone}`}>
      {/* ti-alert-triangle = a warning (never colour alone) · ti-calendar-event = a dated thing on the calendar (the private day) */}
      {tag.tone === 'amber' && <IconAlertTriangle size={12} aria-hidden="true" />}
      {tag.icon === 'calendar' && <IconCalendarEvent size={12} aria-hidden="true" />}
      {tag.text}
    </span>
  );
}

// The Total: "280", a make-up's "250 so far" (the "so far" in gray), or "—".
function Total({ row }) {
  const text = resultsTotalText(row.result, row.isMakeup);
  if (!text.endsWith(' so far')) return text;
  return (
    <>
      {text.slice(0, -' so far'.length)}
      <small className="str-sofar"> so far</small>
    </>
  );
}

// The reason under the tag, with the admins' "Choose subjects" link.
function Reason({ row, ctx }) {
  const reason = resultReason(row, { testingDate: ctx.testingDate, isAdmin: ctx.isAdmin });
  if (!reason.text) return null;
  return (
    <span className="str-line">
      {reason.text}
      {reason.link === 'choose_subjects' && (
        <>
          {' · '}
          <button
            type="button"
            className="link-button st-inline-link str-choose"
            tabIndex={ctx.nav.itemTabIndex(row.id)}
            onClick={(event) => {
              event.stopPropagation();
              ctx.handlers.onChooseSubjects(row, event.currentTarget);
            }}
          >
            {R.CHOOSE_SUBJECTS}
          </button>
        </>
      )}
    </span>
  );
}

// The sent line (R1, R2, R5, R6).
function SentLine({ row, ctx }) {
  const line = sentLine(row);
  if (!line) return null;
  // A row that can't be emailed yet (e.g. "an admin chooses subjects") has nothing to send:
  // no "Not sent yet" there. (A sent record still shows.)
  if (line.kind === 'not_sent' && !canMarkSent(row)) return null;
  const asked = ctx.asked(row); // (also on a Sent row: Email result again asks again, proposal 23)
  if (!asked) return <span className="str-sent">{line.text}</span>;
  const busy = ctx.busyId === row.id;
  return (
    <span className="str-sent str-sent--asked">
      {asked.copied && (
        <span className="str-copied">
          {/* ti-copy = copied to the clipboard */}
          <IconCopy size={12} aria-hidden="true" />
          {ctx.layout.isTouch ? R.MESSAGE_COPIED_TOUCH : R.MESSAGE_COPIED_MOUSE}
        </span>
      )}
      <span className="str-ask">
        {R.EMAIL_OPENED}{' '}
        <button
          type="button"
          className="btn btn-sm str-tap str-mark"
          aria-label={T.markSentLabel(nameOf(row))}
          aria-disabled={busy ? 'true' : undefined}
          tabIndex={ctx.nav.itemTabIndex(row.id)}
          data-str-mark={row.id}
          onClick={(event) => {
            event.stopPropagation();
            if (!busy) ctx.handlers.onMarkSent(row, event.currentTarget);
          }}
        >
          {R.MARK_AS_SENT}
        </button>
      </span>
    </span>
  );
}

function EmailButton({ row, ctx }) {
  if (!canMarkSent(row)) return null;
  const off = ctx.hidden || ctx.busyId === row.id;
  return (
    <button
      type="button"
      className="btn btn-sm str-tap str-email"
      aria-label={T.emailResultLabel(nameOf(row))}
      aria-disabled={off ? 'true' : undefined}
      tabIndex={ctx.nav.itemTabIndex(row.id)}
      data-str-email={row.id}
      onClick={(event) => {
        event.stopPropagation();
        if (!off) ctx.handlers.onEmail(row, event.currentTarget);
      }}
    >
      {/* ti-mail = email a family (§2.4) */}
      <IconMail size={16} aria-hidden="true" />
      {R.EMAIL_RESULT}
    </button>
  );
}

function ResultRow({ row, ctx }) {
  const { layout, nav, handlers } = ctx;
  const name = nameOf(row);
  const school = schoolName(row.locationCode);
  const testingFor = T.testingFor(row.starsFrom, row.starsTo, row.isMakeup);
  const open = ctx.menuFor === row.id;
  const more = (
    <IconButton
      label={T.moreFor(name)}
      Icon={IconDots}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-str-more={row.id}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        handlers.onMore(row, event.currentTarget);
      }}
    />
  );
  const rowProps = {
    className: `str-row${open ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: () => handlers.onOpen(row),
  };
  const result = (
    <>
      <span className="str-tagline">
        <Tag result={row.result} />
      </span>
      <Reason row={row} ctx={ctx} />
      <SentLine row={row} ctx={ctx} />
    </>
  );

  if (layout.isPhone) {
    return (
      <div {...rowProps}>
        <span className="str-phone-main" role="cell">
          <span className="str-l1">
            <span className="str-name">{name}</span>
            <span className="str-school">{school}</span>
          </span>
          <span className="str-line">
            {testingFor} · <b className="str-total">{<Total row={row} />}</b>
          </span>
          {result}
          {canMarkSent(row) && (
            <span className="str-acts2">
              <EmailButton row={row} ctx={ctx} />
            </span>
          )}
        </span>
        <span className="acts" role="cell">
          {more}
        </span>
      </div>
    );
  }
  return (
    <div {...rowProps}>
      <span className="str-namecell" role="cell">
        <span className="str-name">{name}</span>
        <span className="str-line">{layout.isWide ? school : `${school} · ${testingFor}`}</span>
      </span>
      {layout.isWide && (
        <span className="str-cell" role="cell">
          {testingFor}
        </span>
      )}
      <span className="str-cell str-total" role="cell">
        <Total row={row} />
      </span>
      <span className="str-resultcell" role="cell">
        {result}
      </span>
      <span className="acts" role="cell">
        <EmailButton row={row} ctx={ctx} />
        {more}
      </span>
    </div>
  );
}

export default function ResultRows({ rows, ctx }) {
  const { layout, nav } = ctx;
  return (
    <div className={`clist str-list${layout.isWide ? ' is-wide' : ''}${layout.isTouch ? ' is-touch' : ''}`} role="table" aria-label={ctx.label}>
      {!layout.isPhone && (
        <div className="str-row str-head" role="row">
          <span role="columnheader">{T.COL_CANDIDATE}</span>
          {layout.isWide && <span role="columnheader">{T.COL_TESTING_FOR}</span>}
          <span role="columnheader">{layout.isWide && ctx.maxScore !== null ? T.totalOf(ctx.maxScore) : T.COL_TOTAL}</span>
          <span role="columnheader">{T.COL_RESULT}</span>
          <span role="columnheader" aria-label={T.ACTIONS_COL} />
        </div>
      )}
      <div role="rowgroup" {...nav.containerProps}>
        {rows.map((row) => (
          <ResultRow key={row.id} row={row} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
