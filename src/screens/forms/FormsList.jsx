// FormsList.jsx — the list of forms (mockup screens 1 and 10).
// Why it exists: all the school's forms in one place. Each row shows the form, its status, how
// many sign-ups it got this month and its type.
//   - PC / tablet: a table-like list (Form · Status · This month · Type · actions).
//   - Phone: two-line rows (name + status, then "Type · N this month").
//   - Admins: click a row → the builder; Share; ⋯ (Fill in, Duplicate, Copy to [the other school],
//     Close form, Delete).
//   - Staff: click a row → a read-only preview; "Fill in" and Share on each row (no ⋯).
//   - On "Both" each row has a W / S letter for its school, and its buttons' names say the school
//     too ("More actions for Walk-in, Worcester"), as a copy keeps its form's name (v0.644).
import { IconDots, IconShare } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import * as T from './text.js';

function StatusTag({ status }) {
  return <span className={`ttag${status === 'live' ? ' ftag--live' : ''}`}>{T.STATUS[status]}</span>;
}

// fillAtDesk: this device hides private details, so Fill in is desk-only (v0.616): the button
// grays (still focusable, pressing it does nothing) and points at the page's line that says why.
// A Draft / Closed form's Fill in grays the same way (rulebook v0.628).
export default function FormsList({ forms, monthCounts, both, isAdmin, isPhone, busy, fillAtDesk, onOpen, onShare, onFillIn, onMore }) {
  if (forms.length === 0) {
    return <p className="tempty">{isAdmin ? T.NO_FORMS_ADMIN : T.NO_FORMS}</p>;
  }
  const letter = (f) => both && <span className="cchip-letters flist-letter" aria-label={T.SCHOOL_NAME[f.locationCode]}>{T.SCHOOL_LETTER[f.locationCode]}</span>;
  // the name the row's buttons say: on Both with its school (v0.644)
  const rowName = (f) => (both ? T.withSchool(f.name, T.SCHOOL_NAME[f.locationCode]) : f.name);
  const count = (f) => monthCounts.get(f.id) ?? 0;

  const actions = (f) => {
    const live = f.status === 'live';
    // Fill in can't be used on a Draft / Closed form, nor anywhere while desk-only: it grays in the
    // approved "unavailable" look (v0.616; a Draft's too since "(now)" point 1, rulebook v0.628), stays
    // focusable (aria-disabled, never disabled) and pressing it does nothing. A Draft's title says
    // "publish first", a Closed form's "an admin can open it again" (v0.629); a live one points at
    // the page's desk-only line.
    const unavailable = fillAtDesk || !live;
    return (
      <span className="flist-acts">
        {!isAdmin && !isPhone && (
          <button
            type="button"
            className={`btn btn-sm${unavailable ? ' is-unavailable' : ''}`}
            title={live ? undefined : f.status === 'closed' ? T.CLOSED_NO_FILL : T.DRAFT_NO_FILL}
            aria-disabled={unavailable ? 'true' : undefined}
            aria-describedby={fillAtDesk && live ? 'forms-fill-at-desk' : undefined}
            onClick={(e) => !unavailable && onFillIn(f, e.currentTarget)}
          >
            {T.FILL_IN}
          </button>
        )}
        <IconButton label={T.shareLabel(rowName(f))} Icon={IconShare} data-form-share={f.id} onClick={(e) => onShare(f, e.currentTarget)} />
        {(isAdmin || isPhone) && (
          <IconButton
            label={T.moreLabel(rowName(f))}
            Icon={IconDots}
            aria-haspopup="menu"
            data-form-more={f.id}
            disabled={busy}
            onClick={(e) => onMore(f, e.currentTarget)}
          />
        )}
      </span>
    );
  };

  if (isPhone) {
    return (
      <ul className="flist flist--phone">
        {forms.map((f) => (
          <li key={f.id} className="prow flist-row">
            <button type="button" className="prow-main flist-open" data-form-row={f.id} aria-label={T.openLabel(rowName(f))} onClick={(e) => onOpen(f, e.currentTarget)}>
              <span className="l1">
                {letter(f)}
                <span className="flist-name">{f.name}</span> <StatusTag status={f.status} />
              </span>
              <span className="l2">
                {T.KIND[f.kind]} · {T.thisMonth(count(f))}
              </span>
            </button>
            {actions(f)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flist" role="table" aria-label={T.PAGE_TITLE}>
      <div className="flist-head" role="row">
        <span role="columnheader">{T.COL_FORM}</span>
        <span role="columnheader">{T.COL_STATUS}</span>
        <span role="columnheader">{T.COL_MONTH}</span>
        <span role="columnheader">{T.COL_TYPE}</span>
        <span role="columnheader" className="visually-hidden">
          {T.MORE_ACTIONS}
        </span>
      </div>
      {forms.map((f) => (
        <div key={f.id} className="flist-row rrow" role="row">
          <span role="cell" className="flist-namecell">
            {letter(f)}
            {/* on Both its name says the school too ("Open Walk-in, Worcester", v0.644); elsewhere
                the visible name is enough */}
            <button type="button" className="link-button flist-open" data-form-row={f.id} aria-label={both ? T.openLabel(rowName(f)) : undefined} onClick={(e) => onOpen(f, e.currentTarget)}>
              {f.name}
            </button>
          </span>
          <span role="cell">
            <StatusTag status={f.status} />
          </span>
          <span role="cell">{T.signups(count(f))}</span>
          <span role="cell" className="flist-sub">
            {T.KIND[f.kind]}
          </span>
          <span role="cell">{actions(f)}</span>
        </div>
      ))}
    </div>
  );
}
