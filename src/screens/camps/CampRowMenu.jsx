// CampRowMenu.jsx — the ⋯ menu of a camp and the actions behind it (C1 row ⋯, C4 header ⋯).
// Why it exists: the same camp menu appears in two places — on each row of the Camps list and in
// the camp page's header — with the same items, the same rules and the same dialogs. Writing it
// once (as a React "hook", a function that keeps its own state for the screen that uses it)
// means the two can never drift apart.
//
// The items, in the approved order (one order for every event list's ⋯: Close / Open, then
// Edit, then the rest — design review S-8, rulebook v1.047; it was Edit first, C1 / Star v0.92).
// On the camp page's header ⋯ on phones, "Fill in for a family" comes before all of them (v0.741).
//   Close sign-up / Open sign-up     (no icon; Close is hidden while Not open yet; nothing once
//                                     the camp is over; staff can't Open after the closing
//                                     date — grayed, with "The closing date has passed. Ask an
//                                     admin to open it." — Star v0.86; "Open", not "Reopen",
//                                     since rulebook v0.725, design review C12)
//   Edit camp (admin; on PC / tablet rows it's the pencil instead, so it's left out there)
//   Save as template (admin)  → SaveTemplateDialog (toast "Template saved · <name>" with Undo =
//                               delete the new template, rulebook v0.726)
//   Print roster              → PrintRoster (the attendance grid on paper)
//   Delete camp (admin, red)  → DeleteCampDialog (asks first; permanent)
// Close / Open are instant with a 5-second Undo toast (C1, 2026-10-19).
//
// The page's line of saves (design review R2-05, rulebook v1.125–v1.129): this hook no longer keeps
// a busy flag of its own. The page (the camp page, or the Camps list) makes one line with
// useSaveLine (src/lib/saveLine.js) and passes it in as `line`, so a Close sign-up and a Mark paid
// on the same page can't run at once, and the Undo of Close / Open sign-up and of Save as template
// is line.undoAction(…): pressed during another save it waits its turn ("Undoing…") instead of
// being dropped, and the LINE says "Undone" or shows the bar when it didn't save (the page draws
// that bar with PageBar). Each save ends the line exactly once, from a `finally` (lineSave.js).
//
//   const actions = useCampActions({ … });
//   actions.items(camp, days, { includeEdit, onEdit })  → the RowMenu items
//   actions.elements   → the open dialog and the print sheet (draw them once on the page)
//   actions.dialogOpen → true while one of its dialogs shows (the page behind goes inert)
// "Hide private details" (rulebook v0.722): Delete camp's sentence names no amount while it is on
// (read here, so the Camps list and the camp page both follow it); Print roster reads it itself.
import { useEffect, useRef, useState } from 'react';
import { IconEdit, IconPrinter, IconTemplate, IconTrash } from '@tabler/icons-react';
import { deleteTemplate, loadCamp, setSignup } from '../../lib/camps/campsApi.js';
import { signupState } from '../../lib/camps/campRules.js';
import { usePrivateDetailsHidden } from '../../lib/privateDetails.js';
import DeleteCampDialog from './DeleteCampDialog.jsx';
import { focusSoon } from './focusSoon.js';
import { reloadBounded, saveOnLine, undoAnswer } from './lineSave.js';
import PrintRoster from './PrintRoster.jsx';
import SaveTemplateDialog from './SaveTemplateDialog.jsx';
import * as T from './text.js';

// A menu item with no icon (Close / Open sign-up are drawn without one, like Star's built ⋯).
export function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}

// Can this person open sign-up again right now ("Open sign-up", v0.725)? Staff only before the
// closing date (Star v0.86); admins any time before the camp is over (the database then moves
// the closing date to the camp's last day, contract §1.14 camp_set_signup).
export function canOpenSignup(camp, today, isAdmin) {
  return isAdmin || today <= camp.signupClosesOn;
}

export function useCampActions({
  isAdmin,
  today,
  screenLocked,
  line, // the page's save line (useSaveLine): one save at a time, the Undos queue on it
  showToast,
  clearToast,
  onNoAccess,
  onRefreshProfile,
  setBanner,
  reload, // () => Promise — quiet reload of the list / page after a change
  onDeleted, // (camp) => void — e.g. the camp page goes back to the list
}) {
  const [dialog, setDialog] = useState(null); // { type: 'template' | 'delete', … }
  const [printing, setPrinting] = useState(null); // the loaded camp data while it prints
  const [detailsHidden] = usePrivateDetailsHidden(); // Hide private details (v0.506 / v0.722)
  const busy = line.busy; // a save or an Undo is running on the page's line

  // One save or read on the page's line (lineSave.js): null = something else is running (do nothing,
  // as the old begin() returning false); a save that didn't work clears the toast, as before.
  const save = (call, retry = null) => saveOnLine(line, call, { retry, onNotOk: () => clearToast() });

  // ----- Close / Open sign-up (instant, with Undo) -----
  async function switchSignup(camp, days, open) {
    const result = await save(() => setSignup(camp.id, camp.version, open), () => switchSignup(camp, days, open));
    if (!result) return; // something else is running
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'switch' ? null : current));
      reload();
      // An admin opening it after the closing date: the database moved that date to the last day.
      const moved = open && today > camp.signupClosesOn;
      const lastDay = days[days.length - 1]?.day ?? null;
      const text = open ? (moved && lastDay ? T.signupOpenUntil(lastDay) : T.TOAST_SIGNUP_OPEN) : T.TOAST_SIGNUP_CLOSED;
      const newVersion = result.version;
      showToast(text, {
        icon: false,
        // The Undo of Close opens sign-up again, so its toast says so; the Undo of Open says just
        // "Undone" (design review R2-07, rulebook v1.051 (1)). The line says it, not this page.
        action: line.undoAction(() => undoSwitchSignup(camp, newVersion, !open), {
          words: text,
          doneText: !open ? T.TOAST_UNDONE_SIGNUP_OPEN : null,
        }),
      });
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: open ? T.OPEN_NEEDS_ADMIN : T.CAMPS_NOT_ALLOWED });
      onRefreshProfile();
      reload();
    } else if (status === 'finished') {
      setBanner({ text: T.CAMP_FINISHED });
      reload();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: T.someoneElseChanged(camp.name) }); // R2-07: names the camp
      reload();
    } else {
      // Didn't reach the database: the banner says so and offers Retry (never silent, rule 3.5).
      setBanner({
        kind: 'switch',
        text: open ? T.signupNotOpened(camp.name) : T.signupNotClosed(camp.name),
        retry: () => switchSignup(camp, days, open),
      });
    }
  }
  // The Undo of Close / Open sign-up, as the line wants it (its run(): { status, reason?, … }). The
  // page reloads inside it, so the list or roster shows the Undo before the toast says "Undone".
  // Refusals say why (reasons in the page's own words); a connection failure ('error') is the
  // line's "Undo didn't save" bar with Retry.
  async function undoSwitchSignup(camp, version, open) {
    const result = await setSignup(camp.id, version, open);
    const answer = undoAnswer(result, {
      notAllowed: open ? T.OPEN_NEEDS_ADMIN : T.CAMPS_NOT_ALLOWED,
      // 'finished' is its own refusal (the camp is over); stale, not_found and invalid name the camp.
      stale: result.status === 'finished' ? T.CAMP_FINISHED : T.someoneElseChanged(camp.name),
    });
    // Bounded: a reload that hangs must not hold the line (the Undo already saved; lineSave.js).
    if (answer.status === 'ok') await reloadBounded(reload);
    else if (answer.status === 'no_access') onNoAccess();
    else if (answer.status === 'not_allowed') {
      onRefreshProfile();
      reload();
    } else if (answer.status !== 'error') reload(); // refused: show what changed
    return answer;
  }

  // ----- Delete camp: read the camp fresh first, so the warning names the real numbers -----
  async function startDelete(camp, opener) {
    if (!isAdmin) return;
    let fresh = null;
    const ran = await save(async () => {
      fresh = await loadCamp(camp.id);
      // (a camp deleted meanwhile is an answer, not a failed read: it doesn't clear the toast)
      return { status: fresh.status === 'not_found' ? 'ok' : fresh.status };
    });
    if (!ran) return; // something else is running
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      // Couldn't read it (no connection): the bar offers Retry, which clears the bar and reads the
      // camp again (design review S-2, rulebook v1.051). Deleted meanwhile ('not_found'): nothing
      // to retry — "Someone else changed [camp] just now …" (R2-07), and the list reloads without it.
      // (No reload after a failed read: it would fail too and put its own bar over this one's Retry.)
      if (fresh.status === 'not_found') {
        setBanner({ text: T.someoneElseChanged(camp.name) });
        reload();
      } else {
        setBanner({
          text: T.LOAD_CAMP_FAILED,
          takeFocus: true, // the page's bar (PageBar) puts focus on its Retry
          retry: () => {
            setBanner(null);
            startDelete(camp, opener);
          },
        });
      }
      return;
    }
    clearToast();
    const roster = fresh.roster ?? [];
    // The database checks every camper (withdrawn ones too) and the payments net of reversals.
    const count = roster.length;
    // …while the sentence uses the same number as the camp's header (active) and names removed ones apart.
    const active = roster.filter((r) => r.status === 'active').length;
    const cents = roster.reduce((sum, r) => sum + (r.paidCents ?? 0), 0);
    setDialog({
      type: 'delete',
      key: Date.now(),
      camp: fresh.camp,
      count,
      active,
      cents,
      opener,
    });
  }

  // ----- Print roster: load the camp (the list has no campers), print, done -----
  async function startPrint(camp) {
    const fresh = await save(() => loadCamp(camp.id));
    if (!fresh) return; // something else is running
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: T.printLoadFailed, retry: () => startPrint(camp) });
      return;
    }
    setPrinting({ ...fresh, printedAt: new Date().toISOString() });
  }
  // (The camp page already has everything loaded: it prints without a new request.)
  function printLoaded(data) {
    setPrinting({ ...data, printedAt: new Date().toISOString() });
  }

  // ----- Undo of Save as template: delete the new template (as Add camp's Undo deletes the new
  // camp; rulebook v0.726). It is the line's Undo (its run()): edited or deleted meanwhile →
  // 'stale' / 'not_found' → "Someone else changed [template] just now, so nothing was done. …"
  // (R2-07). No connection → the line's "Undo didn't save" bar with Retry. Nothing to reload: the
  // Templates tab reads its list when it opens. -----
  async function undoSaveTemplate(saved, name) {
    const result = await deleteTemplate(saved.id, saved.version);
    const answer = undoAnswer(result, { notAllowed: T.CAMPS_NOT_ALLOWED, stale: T.someoneElseChanged(name) });
    if (answer.status === 'no_access') onNoAccess();
    else if (answer.status === 'not_allowed') onRefreshProfile();
    return answer;
  }

  function startSaveTemplate(camp, days, opener) {
    if (!isAdmin) return;
    clearToast();
    setDialog({ type: 'template', key: Date.now(), camp, days, opener });
  }

  // Focus goes back to the ⋯ button that opened a dialog (or the page header if it's gone).
  const focusRef = useRef(null);
  function closeDialog() {
    focusRef.current = dialog?.opener ?? null;
    setDialog(null);
  }
  useEffect(() => {
    if (dialog || screenLocked || !focusRef.current) return;
    const target = focusRef.current;
    focusRef.current = null;
    // focusSoon waits until the page behind is no longer inert: one frame was not enough on the
    // Camps list (the "dialog closed" news goes CampsTab → Camps → App first), so focus fell to
    // <body> after Keep camp (design review, 390 and PC).
    focusSoon(target);
  }, [dialog, screenLocked]);

  // ----- The menu items -----
  // includeEdit: true on phones (rows have no pencil there) and in the camp page's header.
  // fillIn: only the camp page's header on phones (v0.741) — { reason, onSelect }; "Fill in for a
  // family" comes first, gray with its reason line when reason is set (as Open sign-up's below).
  function items(camp, days, { includeEdit = false, onEdit = null, anchor = null, onPrint = null, fillIn = null } = {}) {
    const state = signupState(camp, days, today);
    const list = [];
    if (fillIn) {
      list.push({
        key: 'fillIn',
        label: fillIn.reason ? (
          <span className="ev-menu-two">
            <span>{T.FILL_IN_ITEM}</span>
            <span className="ev-menu-reason">{fillIn.reason}</span>
          </span>
        ) : (
          T.FILL_IN_ITEM
        ),
        Icon: NoIcon,
        disabled: Boolean(fillIn.reason),
        onSelect: fillIn.onSelect,
      });
    }
    if (state === 'open') {
      list.push({ key: 'close', label: T.CLOSE_SIGNUP, Icon: NoIcon, disabled: busy, onSelect: () => switchSignup(camp, days, false) });
    } else if (state === 'closed') {
      const allowed = canOpenSignup(camp, today, isAdmin);
      list.push({
        key: 'open',
        label: allowed ? (
          T.OPEN_SIGNUP
        ) : (
          <span className="ev-menu-two">
            <span>{T.OPEN_SIGNUP}</span>
            <span className="ev-menu-reason">{T.OPEN_NEEDS_ADMIN}</span>
          </span>
        ),
        Icon: NoIcon,
        disabled: busy || !allowed,
        onSelect: () => switchSignup(camp, days, true),
      });
    }
    // Edit camp comes right after Close / Open sign-up, as in every event list's ⋯ (design review
    // S-8, rulebook v1.047). On PC / tablet rows it's the row's pencil instead, so it's left out there.
    if (isAdmin && includeEdit && onEdit) list.push({ key: 'edit', label: T.EDIT_CAMP, Icon: IconEdit, disabled: busy, onSelect: () => onEdit(camp, anchor) });
    // ti-template = Save as template (C2b)
    if (isAdmin) list.push({ key: 'template', label: T.SAVE_AS_TEMPLATE, Icon: IconTemplate, onSelect: () => startSaveTemplate(camp, days, anchor) });
    // ti-printer = print
    list.push({ key: 'print', label: T.PRINT_ROSTER, Icon: IconPrinter, disabled: busy, onSelect: () => (onPrint ? onPrint() : startPrint(camp)) });
    if (isAdmin) {
      list.push({ key: 'delete', label: T.DELETE_CAMP, Icon: IconTrash, danger: true, separatorBefore: true, disabled: busy, onSelect: () => startDelete(camp, anchor) });
    }
    return list;
  }

  let dialogElement = null;
  if (dialog && !screenLocked) {
    if (dialog.type === 'template') {
      dialogElement = (
        <SaveTemplateDialog
          key={dialog.key}
          camp={dialog.camp}
          onClose={closeDialog}
          onSaved={(name, saved) => {
            closeDialog();
            const words = T.templateSavedToast(name);
            showToast(words, { icon: false, action: line.undoAction(() => undoSaveTemplate(saved, name), { words }) });
          }}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
        />
      );
    } else {
      dialogElement = (
        <DeleteCampDialog
          key={dialog.key}
          camp={dialog.camp}
          count={dialog.count}
          active={dialog.active}
          cents={dialog.cents}
          detailsHidden={detailsHidden}
          onClose={closeDialog}
          onDeleted={() => {
            const camp = dialog.camp;
            setDialog(null);
            showToast(T.deletedToast(camp.name), { icon: false }); // permanent: no Undo
            reload();
            onDeleted?.(camp);
          }}
          onProblem={(status) => {
            setDialog(null);
            if (status === 'no_access') onNoAccess();
            else {
              setBanner({ text: status === 'not_allowed' ? T.CAMPS_NOT_ALLOWED : T.someoneElseChanged(dialog.camp.name) }); // R2-07
              if (status === 'not_allowed') onRefreshProfile();
              reload();
            }
          }}
        />
      );
    }
  }

  const elements = (
    <>
      {dialogElement}
      {printing && <PrintRoster data={printing} onDone={() => setPrinting(null)} />}
    </>
  );

  return { items, elements, busy, dialogOpen: dialog !== null && !screenLocked, printLoaded, switchSignup };
}
