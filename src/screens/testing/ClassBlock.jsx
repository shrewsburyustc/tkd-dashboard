// ClassBlock.jsx — one class in the list: its line, and (when open) its ranks.
// Why it exists: approved mockup screen 1. Classes are a collapsible list in belt order. Each
// line shows the class name and how many ranks it has; clicking the chevron or the name opens
// or closes it (any number can be open at once). Two parts (CB14, rulebook v0.427; ctx.part):
//   - Settings → Classes and ranks: admins get, on the line, the grip (drag to reorder) left of the
//     chevron (v0.63, approved detail 12; 44×44 touch area on touch screens), Edit (opens Edit class:
//     the name) and ⋯ (Move up, Move down, Delete class)
//   - Color belt testing → Prices: under the line, the class's final award ("Final award: LT Black");
//     admins get one pencil on the line (opens Final award). No grip, no ⋯, no Add rank.
// On the phone the chevron sits AFTER the rank count and the whole name area (48px tall)
// opens or closes the class (approved detail 3).
//
// An open class shows its ranks (RankRows.jsx) and, in Settings, an outline "Add rank" button.
// An open class with no ranks shows "No ranks in this class yet." (+ "Add rank" in Settings; on the
// Prices tab, where to add them).
//
// Keyboard: the class line is one row of the list's arrow-key navigation (useRowArrowNav.js);
// its open/close button is the row's focus target and the other buttons follow with ← →.
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconDots, IconEdit, IconPlus } from '@tabler/icons-react';
import IconButton from '../../components/IconButton.jsx';
import Grip from '../../components/Grip.jsx';
import RankRows, { Tag } from './RankRows.jsx';
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

  const isPrices = ctx.part === 'prices';
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
            label={isPrices ? T.editAwardLabel(cls.name) : T.editClassLabel(cls.name)}
            Icon={IconEdit}
            tabIndex={tabIndex}
            onClick={(event) => handlers.onEditClass(cls, event.currentTarget)}
          />
          {!isPrices && (
            <IconButton
              label={T.moreFor(cls.name)}
              Icon={IconDots}
              tabIndex={tabIndex}
              aria-haspopup="menu"
              aria-expanded={menuFor === cls.id ? 'true' : 'false'}
              data-more-for={lifted ? undefined : cls.id}
              onClick={(event) => handlers.onMoreClass(cls, event.currentTarget)}
            />
          )}
        </span>
      )}
    </div>
  );
}

// The Prices tab's line under a class: its final award, or the amber "not set" reminder.
function FinalAwardRow({ cls }) {
  if (cls.finalAwardState === 'notSet') {
    return (
      <div className="cfinal">
        <span className="tfwarn">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <span>{T.AWARD_NOT_SET_STAFF}</span>
        </span>
      </div>
    );
  }
  return <p className="cfinal">{cls.finalAwardState === 'none' ? T.FINAL_AWARD_LINE_NONE : T.finalAwardLine(cls.finalAward?.name ?? '')}</p>;
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
  const { drag, handlers } = ctx;
  const isPrices = ctx.part === 'prices';
  const canAddRank = ctx.isAdmin && !isPrices; // ranks are added in Settings
  const beingDragged = drag?.group === 'classes' && drag.id === cls.id;
  // Dragged to a new spot: the original fades. Not moved yet: its line lifts where it is.
  const isOrigin = beingDragged && drag.toIndex !== drag.fromIndex;
  return (
    <div className={`cblock${isOrigin ? ' is-drag-origin' : ''}`} data-drag-group="classes" data-drag-id={cls.id}>
      <ClassLine cls={cls} isOpen={isOpen} ctx={ctx} liftedHere={beingDragged && !isOrigin} />
      {isPrices && <FinalAwardRow cls={cls} />}
      {isOpen && cls.ranks.length > 0 && (
        <>
          <RankRows cls={cls} ctx={ctx} />
          {canAddRank && (
            <div className="addrow">
              <AddRankButton cls={cls} onAddRank={handlers.onAddRank} />
            </div>
          )}
        </>
      )}
      {isOpen && cls.ranks.length === 0 && (
        <div className="emptyrow">
          <span>{isPrices ? T.EMPTY_CLASS_PRICES : T.EMPTY_CLASS}</span>
          {canAddRank && <AddRankButton cls={cls} onAddRank={handlers.onAddRank} />}
        </div>
      )}
    </div>
  );
}
