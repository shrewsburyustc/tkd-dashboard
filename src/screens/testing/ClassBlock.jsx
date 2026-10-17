// ClassBlock.jsx — one class in the list: its line, and (when open) its ranks.
// Why it exists: approved mockup screen 1. Classes are a collapsible list in belt order. Each
// line shows the class name and how many ranks it has; clicking the chevron or the name opens
// or closes it (any number can be open at once). Admins also get, on the line:
//   - every device (v0.63): the grip (drag to reorder) left of the chevron (approved detail 12);
//     on touch screens it has a 44×44 touch area
//   - Edit (opens Edit class: name + final award) and ⋯ (Move up, Move down, Delete class)
// On the phone the chevron sits AFTER the rank count and the whole name area (48px tall)
// opens or closes the class (approved detail 3).
//
// An open class shows its ranks (RankRows.jsx) and, for admins, an outline "Add rank" button.
// An open class with no ranks shows "No ranks in this class yet." (+ "Add rank" for admins).
//
// Keyboard: the class line is one row of the list's arrow-key navigation (useRowArrowNav.js);
// its open/close button is the row's focus target and the other buttons follow with ← →.
import { IconChevronDown, IconChevronUp, IconDots, IconEdit, IconPlus } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import RankRows, { Grip, Tag } from './RankRows.jsx';
import * as T from './text.js';

// The arrow-key navigation key of a class line (rank rows use the rank id).
export const classNavKey = (classId) => `c:${classId}`;

// The class line itself. `lifted` = the gray copy shown at the landing spot during a drag.
export function ClassLine({ cls, isOpen, ctx, lifted = false, liftedHere = false }) {
  const { isAdmin, layout, gripProps, notSavedId, menuFor, handlers, nav } = ctx;
  const key = classNavKey(cls.id);
  const tabIndex = lifted ? -1 : nav.itemTabIndex(key);
  const Chevron = isOpen ? IconChevronUp : IconChevronDown;
  const toggleLabel = isOpen ? T.collapseClass(cls.name) : T.expandClass(cls.name);

  const nameParts = (
    <>
      <span className="cname">{cls.name}</span>
      <span className="ccount">{T.rankCount(cls.rankCount)}</span>
      {notSavedId === cls.id && <Tag kind="notSaved" />}
    </>
  );

  return (
    <div
      className={`cline${lifted || liftedHere ? ' is-lifted' : ''}`}
      {...(lifted ? { 'aria-hidden': 'true', inert: true } : nav.groupProps(key))}
    >
      {layout.hasGrip && <Grip label={T.dragToReorder(cls.name)} gripProps={gripProps('classes', cls.id)} tabIndex={tabIndex} />}
      <button
        type="button"
        className="ctoggle"
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-label={toggleLabel}
        data-class-toggle={lifted ? undefined : cls.id}
        {...(lifted ? { tabIndex: -1 } : nav.targetProps(key))}
        onClick={() => handlers.onToggleClass(cls.id)}
      >
        {layout.isPhone ? (
          <>
            {nameParts}
            <Chevron size={16} aria-hidden="true" className="ctoggle-chevron" />
          </>
        ) : (
          <>
            <span className="tib-box ctoggle-box">
              <Chevron size={16} aria-hidden="true" />
            </span>
            {nameParts}
          </>
        )}
      </button>
      {isAdmin && (
        <span className="acts">
          <IconButton
            label={T.editClassLabel(cls.name)}
            Icon={IconEdit}
            tabIndex={tabIndex}
            onClick={(event) => handlers.onEditClass(cls, event.currentTarget)}
          />
          <IconButton
            label={T.moreFor(cls.name)}
            Icon={IconDots}
            tabIndex={tabIndex}
            aria-haspopup="menu"
            aria-expanded={menuFor === cls.id ? 'true' : 'false'}
            data-more-for={lifted ? undefined : cls.id}
            onClick={(event) => handlers.onMoreClass(cls, event.currentTarget)}
          />
        </span>
      )}
    </div>
  );
}

// The outline "Add rank" button (compact: 28px with a mouse, 36px on touch).
function AddRankButton({ cls, onAddRank }) {
  return (
    <button type="button" className="btn btn-sm" data-add-rank={cls.id} onClick={(event) => onAddRank(cls, event.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {T.ADD_RANK}
    </button>
  );
}

export default function ClassBlock({ cls, isOpen, ctx }) {
  const { isAdmin, drag, handlers } = ctx;
  const beingDragged = drag?.group === 'classes' && drag.id === cls.id;
  // Dragged to a new spot: the original fades. Not moved yet: its line lifts where it is.
  const isOrigin = beingDragged && drag.toIndex !== drag.fromIndex;
  return (
    <div className={`cblock${isOrigin ? ' is-drag-origin' : ''}`} data-drag-group="classes" data-drag-id={cls.id}>
      <ClassLine cls={cls} isOpen={isOpen} ctx={ctx} liftedHere={beingDragged && !isOrigin} />
      {isOpen && cls.ranks.length > 0 && (
        <>
          <RankRows cls={cls} ctx={ctx} />
          {isAdmin && (
            <div className="addrow">
              <AddRankButton cls={cls} onAddRank={handlers.onAddRank} />
            </div>
          )}
        </>
      )}
      {isOpen && cls.ranks.length === 0 && (
        <div className="emptyrow">
          <span>{T.EMPTY_CLASS}</span>
          {isAdmin && <AddRankButton cls={cls} onAddRank={handlers.onAddRank} />}
        </div>
      )}
    </div>
  );
}
