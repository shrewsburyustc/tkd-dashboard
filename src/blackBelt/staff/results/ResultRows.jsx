// ResultRows.jsx — the rows of Black Belt testing's Results tab: one Dan, one row per candidate.
// Why it exists: approved Results mockups R01, R02, R04 (proposals 4–11, 14–17, 33, 34, 36),
// copied from Star's ResultRows.jsx with Black Belt's columns. This file only DRAWS the rows;
// ResultsTab.jsx decides what the buttons do. Rows come in roster order from the database
// (school, then last name — proposal 4; not grouped by result), and the result on each row is the
// DATABASE's (bb_cycle_results — rulebook v0.938: the screen never works a result out).
//
// Layouts (proposal 9; the breakpoints of useMediaQuery.js):
//   PC and the tablet held sideways (≥ 1024px): five columns
//     Candidate (+ school, + "Make-up from Spring 2027") · Total (+ "pass 275") · Result (tag,
//     reason, sent line) · Email result · ⋯
//   the upright tablet (640–1023px): four columns — Email result and ⋯ together at the right
//   phones (< 640px): stacked rows — name + school, "Total 305.75 · pass 275", the tag, the reason,
//     the sent line, then Email result; ⋯ at the top right
// On touch the only buttons in a row are Email result and Mark as sent, plus ⋯ (§2.5); each keeps
// a 44px tap area (results.css). "Choose subjects" (admins) gets a 44px tap area too (proposal 11).
//
// The Result column:
//   the tag — green "Passed", amber "⚠ Make-up", gray "Not finished" (one per row, rule 8)
//   the reason — resultLines.reasonOf; admins get "Choose subjects" after "Below 275 · an admin
//     chooses subjects" (C1's MakeupSubjectsDialog)
//   the sent line — "Not sent yet", "Sent Jun 7 · Staff", "Not sent yet · an earlier Passed result
//     was sent Jun 7", or after Email result on THIS device (page memory only, proposal 14):
//     "Message copied — paste it into the email (Ctrl+V)." then "Email opened — did you send it?
//     [Mark as sent]"; with no email on file (after the keeping time): "No email on file — deleted
//     after the keeping time." and Email result grayed (proposal 33)
// Email result shows only on rows that can say what to work on (proposal 8, Q-G6 B). It is grayed
// while Hide payments is on (proposal 36), offline (proposal 35) or while that row is busy.
// PRIVACY: a row holds no date of birth, email or payment.
//
// Props:
//   rows   the Dan's rows (already filtered by school)
//   ctx    { layout: { isPhone, isWide, isTouch }, nav (useRowArrowNav), isAdmin, emailOff,
//            markOff, today, danObj, submissionsDue, label, menuFor, busyId, asked(row) →
//            { copied } | null, handlers: { onOpen(row), onEmail(row), onMarkSent(row),
//            onMore(row, anchor), onChooseSubjects(row, opener) } }
import { IconAlertTriangle, IconCopy, IconDots, IconMail } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { canEmail, reasonOf, resultTag, sentLine, totalParts } from './resultLines.js';
import * as T from './text.js';

const nameOf = (row) => `${row.firstName} ${row.lastName}`;

// The tag (proposal 6). One per row; never colour alone (⚠ on Make-up).
function Tag({ result }) {
  const tag = resultTag(result);
  const tone = tag.tone === 'green' ? ' ttag--ok' : tag.tone === 'amber' ? ' ttag--warn' : '';
  return (
    <span className={`ttag${tone}`}>
      {/* ti-alert-triangle = a warning */}
      {tag.tone === 'amber' && <IconAlertTriangle size={12} aria-hidden="true" />}
      {tag.text}
    </span>
  );
}

// The Total: "305.75", "275.5 so far" (the "so far" in gray), or "—".
function Total({ result }) {
  const t = totalParts(result);
  return (
    <>
      {t.number}
      {t.soFar && <small className="bbres-sofar"> {T.SO_FAR}</small>}
    </>
  );
}

const passLine = (result) => (Number.isFinite(result?.pass_mark) ? T.passMarkLine(result.pass_mark) : null);

// The reason under the tag, with the admins' "Choose subjects" link.
function Reason({ row, ctx }) {
  const reason = reasonOf(row, ctx.danObj, ctx.submissionsDue, ctx.isAdmin);
  if (!reason.text) return null;
  return (
    <span className="bbres-line">
      {reason.text}
      {reason.link === 'choose_subjects' && (
        <>
          {' · '}
          <button
            type="button"
            className="link-button bbres-inline-link bbres-choose"
            aria-label={T.chooseSubjectsLabel(nameOf(row))}
            tabIndex={ctx.nav.itemTabIndex(row.id)}
            onClick={(event) => {
              event.stopPropagation();
              ctx.handlers.onChooseSubjects(row, event.currentTarget);
            }}
          >
            {T.CHOOSE_SUBJECTS}
          </button>
        </>
      )}
    </span>
  );
}

// The sent line (proposals 14–16) and, with no email on file, its gray line (proposal 33).
function SentLine({ row, ctx }) {
  const line = sentLine(row, ctx.today);
  const noEmail = canEmail(row) && !row.hasEmail ? <span className="bbres-noemail">{T.NO_EMAIL_ON_FILE}</span> : null;
  if (!line) return noEmail;
  const asked = row.hasEmail ? ctx.asked(row) : null; // (also on a Sent row: Email result again asks again, proposal 20)
  if (!asked) {
    return (
      <>
        <span className="bbres-sent">{line.text}</span>
        {noEmail}
      </>
    );
  }
  const off = ctx.busyId === row.id || ctx.markOff;
  return (
    <span className="bbres-sent bbres-sent--asked">
      {asked.copied && (
        <span className="bbres-copied">
          {/* ti-copy = copied to the clipboard */}
          <IconCopy size={12} aria-hidden="true" />
          {ctx.layout.isTouch ? T.MESSAGE_COPIED_TOUCH : T.MESSAGE_COPIED_MOUSE}
        </span>
      )}
      <span className="bbres-ask">
        {T.EMAIL_OPENED}{' '}
        <button
          type="button"
          className="btn btn-sm bbres-tap bbres-mark"
          aria-label={T.markSentLabel(nameOf(row))}
          aria-disabled={off ? 'true' : undefined}
          tabIndex={ctx.nav.itemTabIndex(row.id)}
          data-bbres-mark={row.id}
          onClick={(event) => {
            event.stopPropagation();
            if (!off) ctx.handlers.onMarkSent(row);
          }}
        >
          {T.MARK_AS_SENT}
        </button>
      </span>
    </span>
  );
}

function EmailButton({ row, ctx }) {
  if (!canEmail(row)) return null;
  const off = ctx.emailOff || !row.hasEmail || ctx.busyId === row.id;
  return (
    <button
      type="button"
      className="btn btn-sm bbres-tap bbres-email"
      aria-label={T.emailResultLabel(nameOf(row))}
      aria-disabled={off ? 'true' : undefined}
      tabIndex={ctx.nav.itemTabIndex(row.id)}
      data-bbres-email={row.id}
      onClick={(event) => {
        event.stopPropagation();
        if (!off) ctx.handlers.onEmail(row);
      }}
    >
      {/* ti-mail = email a family (§2.4) */}
      <IconMail size={16} aria-hidden="true" />
      {T.EMAIL_RESULT}
    </button>
  );
}

function ResultRow({ row, ctx }) {
  const { layout, nav, handlers } = ctx;
  const name = nameOf(row);
  const school = T.schoolName(row.locationCode);
  const open = ctx.menuFor === row.id;
  const pass = passLine(row.result);
  const more = (
    <IconButton
      label={T.moreFor(name)}
      Icon={IconDots}
      aria-haspopup="menu"
      aria-expanded={open ? 'true' : 'false'}
      data-bbres-more={row.id}
      tabIndex={nav.itemTabIndex(row.id)}
      onClick={(event) => {
        event.stopPropagation();
        handlers.onMore(row, event.currentTarget);
      }}
    />
  );
  const rowProps = {
    className: `bbres-row${open ? ' is-selected' : ''}${layout.isPhone ? ' is-phone' : ''}`,
    role: 'row',
    'aria-label': name,
    ...nav.rowProps(row.id),
    onClick: () => handlers.onOpen(row),
  };
  // A carried-in make-up's gray line (proposal 7): plain text, never a tag.
  const makeupLine = row.isMakeup && row.makeupOfCycleName ? <span className="bbres-line">{T.makeupFrom(row.makeupOfCycleName)}</span> : null;
  const result = (
    <>
      <span className="bbres-tagline">
        <Tag result={row.result} />
      </span>
      <Reason row={row} ctx={ctx} />
      <SentLine row={row} ctx={ctx} />
    </>
  );

  if (layout.isPhone) {
    return (
      <div {...rowProps}>
        <span className="bbres-phone-main" role="cell">
          <span className="bbres-l1">
            <span className="bbres-name">{name}</span>
            <span className="bbres-school">{school}</span>
          </span>
          {makeupLine}
          <span className="bbres-line">
            {T.phoneTotalWord}{' '}
            <b className="bbres-total">
              <Total result={row.result} />
            </b>
            {pass && ` · ${pass}`}
          </span>
          {result}
          {canEmail(row) && (
            <span className="bbres-acts2">
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
      <span className="bbres-namecell" role="cell">
        <span className="bbres-name">{name}</span>
        <span className="bbres-line">{school}</span>
        {makeupLine}
      </span>
      <span className="bbres-totalcell" role="cell">
        <span className="bbres-total">
          <Total result={row.result} />
        </span>
        {pass && <span className="bbres-line">{pass}</span>}
      </span>
      <span className="bbres-resultcell" role="cell">
        {result}
      </span>
      {layout.isWide ? (
        <>
          <span className="acts" role="cell">
            <EmailButton row={row} ctx={ctx} />
          </span>
          <span className="acts" role="cell">
            {more}
          </span>
        </>
      ) : (
        <span className="acts" role="cell">
          <EmailButton row={row} ctx={ctx} />
          {more}
        </span>
      )}
    </div>
  );
}

export default function ResultRows({ rows, ctx }) {
  const { layout, nav } = ctx;
  return (
    <div className={`clist bbres-list${layout.isWide ? ' is-wide' : ''}${layout.isTouch ? ' is-touch' : ''}`} role="table" aria-label={ctx.label}>
      {!layout.isPhone && (
        <div className="bbres-row bbres-head" role="row">
          <span role="columnheader">{T.COL_CANDIDATE}</span>
          <span role="columnheader">{T.COL_TOTAL}</span>
          <span role="columnheader">{T.COL_RESULT}</span>
          {layout.isWide ? (
            <>
              <span role="columnheader" aria-label={T.ACTIONS_COL} />
              <span role="columnheader" aria-hidden="true" />
            </>
          ) : (
            <span role="columnheader" aria-label={T.ACTIONS_COL} />
          )}
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
