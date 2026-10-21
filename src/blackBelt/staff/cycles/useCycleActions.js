// useCycleActions.js — the two quick actions the Cycles tab AND the cycle page both offer:
// Close / Open registration (at once, with a 5-second Undo — rule 1.4) and Copy link.
// Why it exists: the same rules in two places would drift apart, so they live here once.
//
// Rules (contract CONTRACT-0016-B1 §3, rulebook v0.85 / v0.86 / v0.210):
//   - Close is allowed any time (staff too). Open is allowed to staff only before Application due
//     while the automatic close is on; after it only admins reopen, and the database then turns
//     the automatic close off (the toast says so). The screen only grays the item — the
//     database decides.
//   - Undo sends the opposite switch with the version the first change returned (OP-17: after a
//     reopen, Undo closes again; the automatic close stays off).
//   - Migration 0024 (rulebook v0.929 / v0.930): the FIRST opening of a cycle locks its rubric, so
//     only admins may do it — staff see Open registration grayed with "An admin opens it the first
//     time (it locks the rubric)." The toast's Undo of a first opening calls undoFirstOpen, which
//     puts the cycle back to "never opened" (its rubric editable again). If a family registered in
//     those seconds the database refuses: "Can't undo: a family has already registered."
//   - ONE change at a time: beginWrite() / endWrite() come from the screen.
//
//   const actions = useCycleActions({ isAdmin, today, beginWrite, endWrite, reload, setBanner,
//                                      showToast, clearToast, onNoAccess, onRefreshProfile });
//   actions.canOpen(cycle)      → may this person open it now?
//   actions.openBlockedReason(cycle) → why not (the gray words under the item), or null
//   actions.switchRegistration(cycle, open)    cycle = { id, name, version, autoClose, applicationDue }
//   actions.copyLink(code)
import { useRef } from 'react';
import { setRegistration, undoFirstOpen } from '../../../lib/blackBelt/api.js';
import { blackBeltLink } from '../../../lib/blackBelt/qr.js';
import { canOpenRegistration } from '../../../lib/blackBelt/rules.js';
import * as T from '../text.js';

// Opening after the application date (with the automatic close on) needs an admin.
export function openNeedsAdmin(cycle, today) {
  return Boolean(cycle.autoClose) && typeof cycle.applicationDue === 'string' && today > cycle.applicationDue;
}

// Has this cycle's registration never been opened? A cycle page's CycleDetail knows
// firstOpenedAt; a Cycles-tab row (CycleSummary) only knows its state ("not_open_yet").
export function neverOpened(cycle) {
  if (cycle && Object.hasOwn(cycle, 'firstOpenedAt')) return cycle.firstOpenedAt === null;
  return cycle?.state?.registration === 'not_open_yet';
}

export function useCycleActions({ isAdmin, today, beginWrite, endWrite, reload, setBanner, showToast, onNoAccess, onRefreshProfile }) {
  // The newest callbacks for a toast's Undo, which runs seconds later.
  const latest = useRef({});
  latest.current = { isAdmin, today, beginWrite, endWrite, reload, setBanner, showToast, onNoAccess, onRefreshProfile };

  // Why this person can't open the cycle now (null = they can). The first opening is admin-only
  // (it locks the rubric, v0.930); after the application date only admins reopen (v0.210).
  // (rules.js canOpenRegistration decides; a Cycles-tab row has no firstOpenedAt, so it is
  // filled in from the row's state.)
  function openBlockedReason(cycle) {
    const withFirst = { ...cycle, firstOpenedAt: neverOpened(cycle) ? null : cycle.firstOpenedAt ?? 'opened' };
    const { reason } = canOpenRegistration(withFirst, isAdmin, today);
    if (reason === 'firstOpenNeedsAdmin') return T.FIRST_OPEN_ADMIN;
    if (reason === 'reopenNeedsAdmin') return T.REOPEN_NEEDS_ADMIN;
    return null;
  }
  function canOpen(cycle) {
    return openBlockedReason(cycle) === null;
  }

  // Undo of a FIRST opening (the toast's Undo): back to never opened, rubric editable again.
  async function undoFirstOpening(cycle, expectedVersion) {
    const a = latest.current;
    if (!a.beginWrite()) return;
    const result = await undoFirstOpen({ cycleId: cycle.id, expectedVersion });
    a.endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      a.reload();
      a.showToast(T.TOAST_UNDONE, { icon: false });
    } else if (status === 'no_access') {
      a.onNoAccess();
    } else if (status === 'has_registrations') {
      a.setBanner({ text: T.CANT_UNDO_REGISTERED });
      a.reload();
    } else if (status === 'not_allowed') {
      a.setBanner({ text: T.NOT_ALLOWED });
      a.onRefreshProfile();
      a.reload();
    } else if (status === 'stale' || status === 'not_found' || status === 'invalid') {
      a.setBanner({ text: T.UNDO_OPEN_TOO_LATE });
      a.reload();
    } else {
      a.setBanner({ kind: 'switch', text: T.UNDO_FAILED, retry: () => undoFirstOpening(cycle, expectedVersion) });
    }
  }

  async function switchRegistration(cycle, open, { isUndo = false, expectedVersion = cycle.version } = {}) {
    const a = latest.current;
    if (!a.beginWrite()) return;
    const result = await setRegistration({ cycleId: cycle.id, expectedVersion, open });
    a.endWrite(result.status);
    const status = result.status;
    if (status === 'ok') {
      a.setBanner((current) => (current?.kind === 'switch' ? null : current));
      a.reload();
      if (isUndo) {
        a.showToast(T.TOAST_UNDONE, { icon: false });
        return;
      }
      const removedDate = open && openNeedsAdmin(cycle, a.today);
      const text = open ? (removedDate ? T.TOAST_REG_OPEN_DATE_REMOVED : T.TOAST_REG_OPEN) : T.TOAST_REG_CLOSED;
      const newVersion = result.version;
      const firstOpen = open && result.firstOpen === true;
      a.showToast(text, {
        icon: false,
        action: {
          label: T.UNDO,
          onAction: () => (firstOpen ? undoFirstOpening(cycle, newVersion) : switchRegistration(cycle, !open, { isUndo: true, expectedVersion: newVersion })),
        },
      });
    } else if (status === 'no_access') {
      a.onNoAccess();
    } else if (status === 'not_allowed') {
      a.setBanner({ text: open ? (neverOpened(cycle) ? T.FIRST_OPEN_ADMIN : T.REOPEN_NEEDS_ADMIN) : T.NOT_ALLOWED });
      a.onRefreshProfile();
      a.reload();
    } else if (status === 'waiver_needed' || status === 'finished') {
      a.setBanner({ text: T.switchProblem(status) });
      a.reload();
    } else if (status === 'stale' || status === 'not_found' || status === 'invalid') {
      a.setBanner({ text: isUndo ? T.UNDO_STALE : T.SWITCH_STALE });
      a.reload();
    } else {
      // Didn't reach the database: the banner offers Retry (never closes by itself, rule 3.5).
      a.setBanner({
        kind: 'switch',
        text: isUndo ? T.UNDO_FAILED : T.SAVE_FAILED,
        retry: () => switchRegistration(cycle, open, { isUndo, expectedVersion }),
      });
    }
  }

  async function copyLink(code) {
    const a = latest.current;
    const link = blackBeltLink(code);
    try {
      if (!link || !navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(link);
      a.showToast(T.TOAST_LINK_COPIED, { icon: false });
    } catch {
      a.setBanner({ text: T.COPY_FAILED });
    }
  }

  return { canOpen, openBlockedReason, switchRegistration, copyLink };
}
