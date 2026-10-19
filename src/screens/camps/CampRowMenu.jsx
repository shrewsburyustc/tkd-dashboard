// CampRowMenu.jsx — the ⋯ menu of a camp and the actions behind it (C1 row ⋯, C4 header ⋯).
// Why it exists: the same camp menu appears in two places — on each row of the Camps list and in
// the camp page's header — with the same items, the same rules and the same dialogs. Writing it
// once (as a React "hook", a function that keeps its own state for the screen that uses it)
// means the two can never drift apart.
//
// The items, in the approved order (C1 phone sheet, follows Star v0.92):
//   Edit camp (admin; on PC / tablet rows it's the pencil instead, so it's left out there)
//   Close sign-up / Reopen sign-up   (no icon; Close is hidden while Not open yet; nothing once
//                                     the camp is over; staff can't Reopen after the closing
//                                     date — grayed, with "The closing date has passed. Ask an
//                                     admin to reopen." — Star v0.86)
//   Save as template (admin)  → SaveTemplateDialog
//   Print roster              → PrintRoster (the attendance grid on paper)
//   Delete camp (admin, red)  → DeleteCampDialog (asks first; permanent)
// Close / Reopen are instant with a 5-second Undo toast (C1, 2026-10-19).
//
//   const actions = useCampActions({ … });
//   actions.items(camp, days, { includeEdit, onEdit })  → the RowMenu items
//   actions.elements   → the open dialog and the print sheet (draw them once on the page)
//   actions.dialogOpen → true while one of its dialogs shows (the page behind goes inert)
import { useEffect, useRef, useState } from 'react';
import { IconEdit, IconPrinter, IconTemplate, IconTrash } from '@tabler/icons-react';
import { loadCamp, setSignup } from '../../lib/camps/campsApi.js';
import { signupState } from '../../lib/camps/campRules.js';
import DeleteCampDialog from './DeleteCampDialog.jsx';
import PrintRoster from './PrintRoster.jsx';
import SaveTemplateDialog from './SaveTemplateDialog.jsx';
import * as T from './text.js';

// A menu item with no icon (Close / Reopen sign-up are drawn without one, like Star's built ⋯).
export function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}

// Can this person reopen sign-up right now? Staff only before the closing date (Star v0.86);
// admins any time before the camp is over (the database then moves the closing date to the
// camp's last day, contract §1.14 camp_set_signup).
export function canReopen(camp, today, isAdmin) {
  return isAdmin || today <= camp.signupClosesOn;
}

export function useCampActions({
  isAdmin,
  today,
  screenLocked,
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
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  function begin() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function end(status) {
    busyRef.current = false;
    setBusy(false);
    if (status && status !== 'ok') clearToast();
  }

  // ----- Close / Reopen sign-up (instant, with Undo) -----
  async function switchSignup(camp, days, open, isUndo = false, expectedVersion = camp.version) {
    if (!begin()) return;
    const result = await setSignup(camp.id, expectedVersion, open);
    end(result.status);
    const status = result.status;
    if (status === 'ok') {
      setBanner((current) => (current?.kind === 'switch' ? null : current));
      reload();
      if (isUndo) {
        showToast(T.TOAST_UNDONE, { icon: false });
        return;
      }
      // Admin reopening after the closing date: the database moved it to the last day.
      const moved = open && today > camp.signupClosesOn;
      const lastDay = days[days.length - 1]?.day ?? null;
      const text = open ? (moved && lastDay ? T.signupReopenedUntil(lastDay) : T.TOAST_SIGNUP_REOPENED) : T.TOAST_SIGNUP_CLOSED;
      const newVersion = result.version;
      showToast(text, {
        icon: false,
        action: { label: T.UNDO, onAction: () => switchSignup({ ...camp, version: newVersion }, days, !open, true, newVersion) },
      });
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_allowed') {
      setBanner({ text: open ? T.REOPEN_NEEDS_ADMIN : T.CAMPS_NOT_ALLOWED });
      onRefreshProfile();
      reload();
    } else if (status === 'finished') {
      setBanner({ text: T.CAMP_FINISHED });
      reload();
    } else if (['stale', 'not_found', 'invalid'].includes(status)) {
      setBanner({ text: isUndo ? T.UNDO_STALE : T.STALE });
      reload();
    } else {
      // Didn't reach the database: the banner says so and offers Retry (never silent, rule 3.5).
      setBanner({
        kind: 'switch',
        text: open ? T.signupNotReopened(camp.name) : T.signupNotClosed(camp.name),
        retry: () => switchSignup(camp, days, open, isUndo, expectedVersion),
      });
    }
  }

  // ----- Delete camp: read the camp fresh first, so the warning names the real numbers -----
  async function startDelete(camp, opener) {
    if (!isAdmin || !begin()) return;
    const fresh = await loadCamp(camp.id);
    end(fresh.status === 'ok' || fresh.status === 'not_found' ? 'ok' : fresh.status);
    if (fresh.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (fresh.status !== 'ok') {
      setBanner({ text: fresh.status === 'not_found' ? T.STALE : T.LOAD_CAMP_FAILED });
      reload();
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
    if (!begin()) return;
    const fresh = await loadCamp(camp.id);
    end(fresh.status === 'ok' ? 'ok' : fresh.status);
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
    if (dialog || screenLocked || !focusRef.current) return undefined;
    const target = focusRef.current;
    focusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialog, screenLocked]);

  // ----- The menu items -----
  // includeEdit: true on phones (rows have no pencil there) and in the camp page's header.
  function items(camp, days, { includeEdit = false, onEdit = null, anchor = null, onPrint = null } = {}) {
    const state = signupState(camp, days, today);
    const list = [];
    if (isAdmin && includeEdit && onEdit) list.push({ key: 'edit', label: T.EDIT_CAMP, Icon: IconEdit, disabled: busy, onSelect: () => onEdit(camp, anchor) });
    if (state === 'open') {
      list.push({ key: 'close', label: T.CLOSE_SIGNUP, Icon: NoIcon, disabled: busy, onSelect: () => switchSignup(camp, days, false) });
    } else if (state === 'closed') {
      const allowed = canReopen(camp, today, isAdmin);
      list.push({
        key: 'reopen',
        label: allowed ? (
          T.REOPEN_SIGNUP
        ) : (
          <span className="ev-menu-two">
            <span>{T.REOPEN_SIGNUP}</span>
            <span className="ev-menu-reason">{T.REOPEN_NEEDS_ADMIN}</span>
          </span>
        ),
        Icon: NoIcon,
        disabled: busy || !allowed,
        onSelect: () => switchSignup(camp, days, true),
      });
    }
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
          onSaved={(name) => {
            closeDialog();
            showToast(T.templateSavedToast(name), { icon: false });
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
              setBanner({ text: status === 'not_allowed' ? T.CAMPS_NOT_ALLOWED : T.STALE });
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
