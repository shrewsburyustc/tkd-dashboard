// FormsList.jsx — the list of forms (mockup screens 1 and 10).
// Why it exists: all the school's forms in one place. Each row shows the form, its status, how
// many sign-ups it got this month and its type.
//   - PC / tablet: a table-like list (Form · Status · This month · Type · actions).
//   - Phone: two-line rows (name + status, then "Type · N this month").
//   - Admins: click a row → the builder; Share; ⋯ (Fill in, Duplicate, Close form, Delete).
//   - Staff: click a row → a read-only preview; "Fill in" and Share on each row (no ⋯).
//   - On "Both" each row has a W / S letter for its school.
import { IconDots, IconShare } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import * as T from './text.js';

function StatusTag({ status }) {
  return <span className={`ttag${status === 'live' ? ' ftag--live' : ''}`}>{T.STATUS[status]}</span>;
}

export default function FormsList({ forms, monthCounts, both, isAdmin, isPhone, busy, onOpen, onShare, onFillIn, onMore }) {
  if (forms.length === 0) {
    return <p className="tempty">{isAdmin ? T.NO_FORMS_ADMIN : T.NO_FORMS}</p>;
  }
  const letter = (f) => both && <span className="cchip-letters flist-letter" aria-label={T.SCHOOL_NAME[f.locationCode]}>{T.SCHOOL_LETTER[f.locationCode]}</span>;
  const count = (f) => monthCounts.get(f.id) ?? 0;

  const actions = (f) => (
    <span className="flist-acts">
      {!isAdmin && !isPhone && (
        <button type="button" className="btn btn-sm" disabled={f.status !== 'live'} title={f.status !== 'live' ? T.DRAFT_NO_FILL : undefined} onClick={(e) => onFillIn(f, e.currentTarget)}>
          {T.FILL_IN}
        </button>
      )}
      <IconButton label={T.shareLabel(f.name)} Icon={IconShare} data-form-share={f.id} onClick={(e) => onShare(f, e.currentTarget)} />
      {(isAdmin || isPhone) && (
        <IconButton
          label={T.moreLabel(f.name)}
          Icon={IconDots}
          aria-haspopup="menu"
          data-form-more={f.id}
          disabled={busy}
          onClick={(e) => onMore(f, e.currentTarget)}
        />
      )}
    </span>
  );

  if (isPhone) {
    return (
      <ul className="flist flist--phone">
        {forms.map((f) => (
          <li key={f.id} className="prow flist-row">
            <button type="button" className="prow-main flist-open" data-form-row={f.id} aria-label={T.openLabel(f.name)} onClick={(e) => onOpen(f, e.currentTarget)}>
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
            <button type="button" className="link-button flist-open" data-form-row={f.id} onClick={(e) => onOpen(f, e.currentTarget)}>
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
