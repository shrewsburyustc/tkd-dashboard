// DanBlock.jsx — one Dan in the Rubrics and prices list: its line and (when open) its categories.
// Why it exists: approved mockup screens 1, 4, 6 and 11 (v0.66).
//
// The Dan line: chevron · "1st Dan" · "11 categories · 70 credits · pass 245 of 315 · up to 4
// stars". Clicking the chevron or the name opens / closes it (several can be open at once).
// Admins also get an Edit icon at the right (Edit Dan settings — no menu in between). When the
// credits don't add up to 70, ONE amber tag: "Total is 75 credits (usually 70)" (v0.61).
// Phone: the name and chevron on top, the summary underneath, the Edit icon at the right.
//
// An open Dan lists its categories in rubric order (the order of the paper grading sheet):
//   - PC and tablet: a dense row — [grip] name · "15 credits" · "max 67.5" · Edit ⋯
//     (no column headers: each row says "credits" and "max")
//   - phone: a two-line row — [grip] name, then "15 credits · max 67.5" — Edit ⋯
// The Assistant Instructor row carries a gray "From class count" tag. One tag per row at most:
// an amber "Not saved" (failed reorder) wins, and the words then show as gray text instead.
// Under the categories: "+ Add category" (admins) on the left and the running total on the right
// ("Total 70 credits · max 315").
//
// Admins (every device, v0.63): the grip at the left drags the row (only the grip starts a drag;
// touching elsewhere scrolls); Edit and ⋯ (Move up, Move down, Delete category) at the right;
// clicking a row opens Edit category. Staff: no grips, no Edit, no ⋯, no Add — rows don't open.
//
// Keyboard (useRowArrowNav.js, as Color Belt): the list is ONE Tab stop; ↑ ↓ move between Dan
// lines and category rows, Enter opens a row, ← → move between a row's own buttons.
import { Fragment } from 'react';
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconDots, IconEdit, IconGripVertical, IconPlus } from '@tabler/icons-react';
import IconButton, { placeTip } from '../../../components/IconButton.jsx';
import { maxFor } from './rubricRules.js';
import * as T from './text.js';

// The arrow-key navigation key of a Dan line (category rows use the category id).
export const danNavKey = (dan) => `d:${dan}`;
// The drag group of a Dan's categories (useReorderDrag.js).
export const dragGroup = (dan) => `star-dan-${dan}`;

// The table columns (CSS grid) for a category row.
export function categoryColumns({ isAdmin, isTouch }) {
  if (isAdmin) return isTouch ? '36px minmax(0, 1fr) 96px 88px 88px' : '24px minmax(0, 1fr) 88px 88px 64px';
  return isTouch ? 'minmax(0, 1fr) 96px 88px' : 'minmax(0, 1fr) 88px 88px';
}

export function Tag({ kind, text }) {
  if (kind === 'warn') {
    return (
      <span className="ttag ttag--warn">
        <IconAlertTriangle size={12} aria-hidden="true" />
        {text}
      </span>
    );
  }
  return <span className="ttag">{text}</span>;
}

// The grip: focusable for its tooltip; the keyboard way to move is ⋯ → Move up / Move down.
function Grip({ label, gripProps, tabIndex }) {
  return (
    <button type="button" className="grip" aria-label={label} tabIndex={tabIndex} onPointerEnter={placeTip} onFocus={placeTip} {...gripProps}>
      <IconGripVertical size={16} aria-hidden="true" />
      <span className="grip-tip" aria-hidden="true">
        {T.GRIP_TOOLTIP}
      </span>
    </button>
  );
}

// The Dan line. `facts` = danFacts() (totals, max …).
function DanLine({ dan, facts, isOpen, ctx }) {
  const { isAdmin, layout, nav, handlers } = ctx;
  const key = danNavKey(dan.dan);
  const tabIndex = nav.itemTabIndex(key);
  const Chevron = isOpen ? IconChevronUp : IconChevronDown;
  const summary = T.danSummary(facts);
  const tag = facts.notUsual ? <Tag kind="warn" text={T.totalNotUsual(facts.credits)} /> : null;
  return (
    <div className={`st-dline${isAdmin ? '' : ' is-staff'}`} {...nav.groupProps(key)}>
      <button
        type="button"
        className="st-dtoggle"
        aria-expanded={isOpen ? 'true' : 'false'}
        // A fixed name ("1st Dan"); open or closed is said once, by aria-expanded — a label that
        // also changed ("Expand …" / "Collapse …") made screen readers say the state twice.
        aria-label={dan.label}
        data-star-dan-toggle={dan.dan}
        {...nav.targetProps(key)}
        onClick={() => handlers.onToggleDan(dan.dan)}
      >
        {layout.isPhone ? (
          <span className="st-dtext">
            <span className="st-dl1">
              <span className="st-dname">{dan.label}</span>
              <Chevron size={16} aria-hidden="true" className="st-dchev" />
              {tag}
            </span>
            <span className="st-dl2">{summary}</span>
          </span>
        ) : (
          <>
            <span className="tib-box st-dchev-box">
              <Chevron size={16} aria-hidden="true" />
            </span>
            <span className="st-dname">{dan.label}</span>
            <span className="st-dsum">
              <span className="st-dcnt">{summary}</span>
              {tag}
            </span>
          </>
        )}
      </button>
      {isAdmin && (
        <span className="acts">
          <IconButton
            label={T.editDanSettingsLabel(dan.label)}
            Icon={IconEdit}
            tabIndex={tabIndex}
            data-star-dan-edit={dan.dan}
            onClick={(event) => handlers.onEditDan(dan, event.currentTarget)}
          />
        </span>
      )}
    </div>
  );
}

// The name with its one tag (or the tag's words as gray text when "Not saved" took the tag).
function NameAndTag({ category, notSaved }) {
  return (
    <>
      <span className="st-cname">{category.name}</span>
      {notSaved && <Tag kind="warn" text={T.TAG_NOT_SAVED} />}
      {!notSaved && category.fromClassCount && <Tag text={T.TAG_FROM_CLASS_COUNT} />}
      {notSaved && category.fromClassCount && <span className="st-muted">{T.TAG_FROM_CLASS_COUNT}</span>}
    </>
  );
}

function RowActions({ category, ctx, tabIndex }) {
  const { handlers, menuFor } = ctx;
  return (
    <span className="acts">
      <IconButton
        label={T.editCategoryLabel(category.name)}
        Icon={IconEdit}
        tabIndex={tabIndex}
        onClick={(event) => handlers.onEditCategory(category, event.currentTarget)}
      />
      <IconButton
        label={T.moreFor(category.name)}
        Icon={IconDots}
        tabIndex={tabIndex}
        aria-haspopup="menu"
        aria-expanded={menuFor === category.id ? 'true' : 'false'}
        data-star-more={category.id}
        onClick={(event) => handlers.onMoreCategory(category, event.currentTarget)}
      />
    </span>
  );
}

// One category row. `lifted` = the gray copy shown at the landing spot during a drag.
function CategoryRow({ dan, category, ctx, lifted = false }) {
  const { isAdmin, layout, nav, drag, gripProps, notSavedId, selectedId, aPlus, handlers } = ctx;
  const notSaved = notSavedId === category.id;
  const beingDragged = !lifted && drag?.id === category.id;
  const isOrigin = beingDragged && drag.toIndex !== drag.fromIndex; // moved: the original fades
  const liftedHere = beingDragged && !isOrigin; // not moved yet: lifts where it is
  const tabIndex = lifted ? -1 : nav.itemTabIndex(category.id);
  const max = maxFor(category.credits, aPlus);

  const classes = ['st-crow', layout.isPhone ? 'is-phone' : 'is-table'];
  if (lifted || liftedHere) classes.push('is-lifted');
  if (isOrigin) classes.push('is-drag-origin');
  if (!lifted && selectedId === category.id) classes.push('is-selected');
  if (!isAdmin) classes.push('is-staff');

  let attributes;
  if (lifted) attributes = { 'aria-hidden': 'true', inert: true };
  else if (isAdmin) {
    attributes = {
      ...nav.rowProps(category.id),
      role: 'row',
      'aria-label': category.name,
      'data-drag-group': dragGroup(dan.dan),
      'data-drag-id': category.id,
      'data-star-row': category.id,
      onClick: (event) => {
        if (event.target.closest('button')) return; // the buttons do their own thing
        handlers.onEditCategory(category, event.currentTarget);
      },
    };
  } else attributes = { role: 'row' };

  const grip = isAdmin && (
    <span role="cell" className="st-cgrip">
      <Grip label={T.dragToReorder(category.name)} gripProps={gripProps(dragGroup(dan.dan), category.id)} tabIndex={tabIndex} />
    </span>
  );

  if (layout.isPhone) {
    return (
      <div className={classes.join(' ')} {...attributes}>
        {grip}
        <div role="cell" className="st-cmain">
          <div className="st-l1">
            <NameAndTag category={category} notSaved={notSaved} />
          </div>
          {/* Each part never breaks inside itself; the "·" travels with the part after it. */}
          <div className="st-l2">
            <span>{T.rowCredits(category.credits)}</span> <span>· {T.rowMax(max)}</span>
          </div>
        </div>
        {isAdmin && (
          <span role="cell" className="st-cacts">
            <RowActions category={category} ctx={ctx} tabIndex={tabIndex} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={classes.join(' ')} style={{ gridTemplateColumns: ctx.columns }} {...attributes}>
      {grip}
      <span role="cell" className="st-cnamecell">
        <NameAndTag category={category} notSaved={notSaved} />
      </span>
      <span role="cell" className="num">
        {T.rowCredits(category.credits)}
      </span>
      <span role="cell" className="num">
        {T.rowMax(max)}
      </span>
      {isAdmin && (
        <span role="cell" className="st-cacts">
          <RowActions category={category} ctx={ctx} tabIndex={tabIndex} />
        </span>
      )}
    </div>
  );
}

export default function DanBlock({ dan, facts, isOpen, ctx }) {
  const { isAdmin, drag, handlers } = ctx;
  // A category of THIS Dan is being dragged to a new spot: the blue line + lifted copy go there.
  const group = dragGroup(dan.dan);
  const moving = drag && drag.group === group && drag.toIndex !== drag.fromIndex;
  const liftedCategory = moving ? dan.categories.find((c) => c.id === drag.id) : null;
  const landing = liftedCategory ? (
    <>
      <div className="st-dropline" aria-hidden="true" />
      <CategoryRow dan={dan} category={liftedCategory} ctx={ctx} lifted />
    </>
  ) : null;

  return (
    <div className="st-dblock">
      <DanLine dan={dan} facts={facts} isOpen={isOpen} ctx={ctx} />
      {isOpen && (
        <>
          <div role="table" aria-label={dan.label} className="st-ctable">
            {dan.categories.map((category, index) => (
              <Fragment key={category.id}>
                {moving && drag.gap === index && landing}
                <CategoryRow dan={dan} category={category} ctx={ctx} />
              </Fragment>
            ))}
            {moving && drag.gap === dan.categories.length && landing}
          </div>
          <div className={`st-addrow${isAdmin ? '' : ' is-staff'}`}>
            {isAdmin && (
              <button type="button" className="btn btn-sm" data-star-add={dan.dan} onClick={(event) => handlers.onAddCategory(dan, event.currentTarget)}>
                {/* ti-plus = add new */}
                <IconPlus size={16} aria-hidden="true" />
                {T.ADD_CATEGORY}
              </button>
            )}
            <span className="st-tot">{T.totalLine(facts.credits, facts.max)}</span>
          </div>
        </>
      )}
    </div>
  );
}
