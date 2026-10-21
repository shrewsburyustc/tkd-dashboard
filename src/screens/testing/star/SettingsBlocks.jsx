// SettingsBlocks.jsx — the three always-open blocks under the Dan list: Grade scale,
// Assistant-class table and Fees (approved mockup screen 1, v0.66).
// Why it exists: these are school-wide (or per-Dan) settings that every Dan's rubric uses. They
// never collapse ("always open", an approved detail). Admins get an Edit icon on each block
// header (Grade scale, Assistant-class table) and on each Fees row; staff see the same blocks
// without Edit icons.
//   - Grade scale: A+ 4.5 … D 0 in seven small cells, then "A D in any category means a
//     make-up, even when the total passes." and the gray "Points = credits × grade value."
//   - Assistant-class table: Grade · 12 and under · 13 and up; A+ "15 or more", A "19 or 18"
//     (a range from the grade above), … D "under 10"; and how age is counted.
//   - Fees: Dan · Standard · Same day · Private (PC / tablet); phone: one line of three prices
//     per Dan, so nothing scrolls sideways.
import { IconEdit } from '@tabler/icons-react';
import IconButton from '../../../components/IconButton.jsx';
import { formatDollars } from '../../../lib/money.js';
import { assistantColumn } from './rubricRules.js';
import * as T from './text.js';

function BlockHead({ title, editLabel, editData, onEdit, isAdmin }) {
  return (
    <div className="st-bhead">
      <h2 className="st-bname">{title}</h2>
      {isAdmin && onEdit && (
        <span className="acts">
          <IconButton label={editLabel} Icon={IconEdit} onClick={(event) => onEdit(event.currentTarget)} {...editData} />
        </span>
      )}
    </div>
  );
}

export function GradeScaleBlock({ grades, isAdmin, onEdit }) {
  const sorted = [...grades].sort((a, b) => a.position - b.position);
  return (
    <section className="st-blk" aria-label={T.GRADE_SCALE}>
      <BlockHead title={T.GRADE_SCALE} editLabel={T.EDIT_GRADE_VALUES_LABEL} editData={{ 'data-star-edit-grades': true }} onEdit={onEdit} isAdmin={isAdmin} />
      <div className="st-bbody">
        <ul className="st-gscale" aria-label={T.GRADE_VALUES_LABEL}>
          {sorted.map((g) => (
            <li key={g.id}>
              <b>{g.grade}</b>
              <span>{T.formatGrade(g.value)}</span>
            </li>
          ))}
        </ul>
        <p className="st-bline">{T.MAKEUP_RULE}</p>
        <p className="st-bline st-bline--sec">{T.POINTS_RULE}</p>
      </div>
    </section>
  );
}

export function AssistantBlock({ assistant, isAdmin, isPhone, onEdit }) {
  const child = assistantColumn(assistant.childMins);
  const adult = assistantColumn(assistant.adultMins);
  const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
  const grid = isPhone ? 'st-g-asp' : 'st-g-as';
  return (
    <section className="st-blk" aria-label={T.ASSISTANT_TABLE}>
      <BlockHead title={T.ASSISTANT_TABLE} editLabel={T.EDIT_ASSISTANT_TABLE_LABEL} editData={{ 'data-star-edit-assistant': true }} onEdit={onEdit} isAdmin={isAdmin} />
      <p className="st-bsub">{T.ASSISTANT_SUB}</p>
      <div role="table" aria-label={T.ASSISTANT_TABLE}>
        <div role="row" className={`st-thead ${grid}`}>
          <span role="columnheader">{T.COL_GRADE}</span>
          <span role="columnheader">{T.childColumn(assistant.childMaxAge)}</span>
          <span role="columnheader">{T.adultColumn(assistant.childMaxAge)}</span>
        </div>
        {grades.map((grade, i) => (
          <div key={grade} role="row" className={`st-trow ${grid}`}>
            <span role="rowheader">
              <b>{grade}</b>
            </span>
            <span role="cell">{child[i]}</span>
            <span role="cell">{adult[i]}</span>
          </div>
        ))}
      </div>
      <p className="st-bfoot">{T.assistantFoot(assistant.childMaxAge)}</p>
    </section>
  );
}

export function FeesBlock({ dans, isAdmin, isPhone, isTouch, selectedDan, onEdit }) {
  const editButton = (dan) =>
    isAdmin && (
      <span className="acts">
        <IconButton label={T.editFeesLabel(dan.label)} Icon={IconEdit} data-star-edit-fees={dan.dan} onClick={(event) => onEdit(dan, event.currentTarget)} />
      </span>
    );

  if (isPhone) {
    return (
      <section className="st-blk" aria-label={T.FEES}>
        <BlockHead title={T.FEES} isAdmin={false} />
        {dans.map((dan) => (
          <div key={dan.dan} className={`st-feerow${isAdmin ? '' : ' is-staff'}${selectedDan === dan.dan ? ' is-selected' : ''}`}>
            <div className="st-cmain">
              <div className="st-l1">{dan.label}</div>
              <div className="st-l2">
                <span>{T.phoneStandard(dan.standardCents)}</span> <span>· {T.phoneSameDay(dan.sameDayCents)}</span>{' '}
                <span>· {T.phonePrivate(dan.privateCents)}</span>
              </div>
            </div>
            {editButton(dan)}
          </div>
        ))}
        <p className="st-bfoot">{T.FEES_FOOT}</p>
      </section>
    );
  }

  let grid = isTouch ? 'st-g-feet' : 'st-g-fee';
  if (!isAdmin) grid += 's';
  return (
    <section className="st-blk" aria-label={T.FEES}>
      <BlockHead title={T.FEES} isAdmin={false} />
      <div role="table" aria-label={T.FEES}>
        <div role="row" className={`st-thead ${grid}`}>
          <span role="columnheader">{T.COL_DAN}</span>
          <span role="columnheader" className="num">
            {T.COL_STANDARD}
          </span>
          <span role="columnheader" className="num">
            {T.COL_SAME_DAY}
          </span>
          <span role="columnheader" className="num">
            {T.COL_PRIVATE}
          </span>
          {isAdmin && <span role="columnheader" aria-hidden="true" />}
        </div>
        {dans.map((dan) => (
          <div key={dan.dan} role="row" className={`st-trow ${grid}${selectedDan === dan.dan ? ' is-selected' : ''}`}>
            <span role="rowheader">{dan.label}</span>
            <span role="cell" className="num">
              {formatDollars(dan.standardCents)}
            </span>
            <span role="cell" className="num">
              {formatDollars(dan.sameDayCents)}
            </span>
            <span role="cell" className="num">
              {formatDollars(dan.privateCents)}
            </span>
            {isAdmin && (
              <span role="cell" className="st-cacts">
                {editButton(dan)}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="st-bfoot">{T.FEES_FOOT}</p>
    </section>
  );
}
