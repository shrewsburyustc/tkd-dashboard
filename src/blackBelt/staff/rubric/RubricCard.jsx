// RubricCard.jsx — a rubric card: the read view of one Dan with its Dan switcher, and the editor
// when an admin presses "Edit 1st Dan". Used twice:
//   - the Default rubric card on Rubric and prices (DefaultRubricCard.jsx; mockups R1–R11)
//   - a cycle's own copy on the cycle page's Rubric tab (cycle/CycleRubricTab.jsx; R12, R13)
// Why it exists: CONTRACT-0024 §10.3 — "the same read view and editor on the cycle copy". The
// two places differ only in their words and in which save / undo they call, so this file takes
// those as props and does the rest once:
//   - the gray Dan switcher (1st–4th Dan; it only changes what is shown — rule 1.2, v0.89)
//   - Edit [Dan] (admins, while the copy can change) → the editor (PC and tablet: in the card,
//     with a sticky edit bar; phones: a full-screen page with a bottom footer)
//   - Save [Dan]: the draft is checked as a whole (R8), then saved in ONE call with the rev it was
//     loaded at. "1st Dan rubric saved" + Undo (5 seconds; only when the database says an undo is
//     possible) (R11). Another admin's newer save → the amber banner with Reload and Save
//     disabled ("Reload first — another admin saved"); the live refresh shows the banner as soon
//     as it notices. After Reload: their version in the editor, a gray line naming their change
//     and a gray box with "Your N changes weren't saved" (R11).
//   - leaving with unsaved changes: PC and tablet ask "Discard changes to 1st Dan?" (Keep editing
//     / Discard) for the Dan switcher and — through setGuard — every other way out; phones show
//     the v0.56 note with Discard changes (R10). Closing or reloading the browser tab: the
//     browser's own question.
// The database decides everything again (admins only, the lock at first opening, the rev check,
// every value). This screen only makes the common case smooth.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconEdit } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { danDiff, newSubjectId, RUBRIC_DANS, subjectLetters, workedPoints } from '../../../lib/blackBelt/rubric.js';
import Choice from '../parts/Choice.jsx';
import CopyDanDialog from './CopyDanDialog.jsx';
import DiscardDialog from './DiscardDialog.jsx';
import RubricEditor, { PhoneUnsavedNote } from './RubricEditor.jsx';
import RubricReadView from './RubricReadView.jsx';
import SplitBracketDialog from './SplitBracketDialog.jsx';
import SubjectDialog from './SubjectDialog.jsx';
import { prepareDan } from './draft.js';
import { useRubricDraft } from './useRubricDraft.js';
import * as T from '../text.js';

// The Dan shown last, per card (kept while the dashboard is open).
const lastDan = new Map();

export default function RubricCard({
  cardKey, // 'default' or the cycle id (remembers the Dan shown)
  title,
  subtitle, // gray line under the title (a cycle's "Copied from …"), or null
  readLine, // gray line under the Dan switcher in the read view, or null
  editorLine, // gray line under the switcher in the editor
  where, // the edit bar's "default rubric" / "Fall 2027 only"
  phoneWhere, // the phone editor's "Default rubric" / "Fall 2027"
  rubric, // the loaded document (schema_version 2)
  canEdit, // admins, and the copy can still change
  isAdmin,
  isPhone,
  screenLocked,
  saveDan, // ({ dan, expectedRev, sheet }) → api answer
  undoDan, // ({ dan, expectedRev }) → api answer
  reload, // () → Promise (quiet reload of `rubric`)
  onLocked, // a cycle's copy answered 'locked' (registration opened meanwhile)
  setGuard, // (fn | null) — the leave guard for every way out of this screen
  onModalChange, // (bool) — a dialog / the phone page is open
  showToast,
  clearToast,
  onNoAccess,
  onRefreshProfile,
}) {
  const [danNo, setDanNo] = useState(lastDan.get(cardKey) ?? 1);
  const d = useRubricDraft();
  const [triedSave, setTriedSave] = useState(false);
  const [serverProblems, setServerProblems] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [banner, setBanner] = useState(null); // { text, retry? } — read view and editor
  const [afterReload, setAfterReload] = useState(null);
  const [pendingReload, setPendingReload] = useState(null); // { yours } while Reload waits for the newer version
  const [override, setOverride] = useState(null); // a just-saved Dan, until the reload brings it
  const [dialog, setDialog] = useState(null); // { type: 'subject'|'split'|'copy'|'discard', … }
  const [phoneNote, setPhoneNote] = useState(false);
  const keptWaysRef = useRef(new Map()); // subject id → its ways while switched to Graded
  const subjectCloseRef = useRef(null);
  const editTopRef = useRef(null);

  const loadedDan = rubric?.dans?.find((x) => x.dan === danNo) ?? null;
  const shownDan = override && override.dan === danNo && (!loadedDan || override.rev > loadedDan.rev) ? override : loadedDan;
  const editing = d.editing;
  const count = d.changes.length;

  function chooseDan(n) {
    lastDan.set(cardKey, n);
    setDanNo(n);
  }

  // ----- Starting and stopping -----
  function resetEditState() {
    setTriedSave(false);
    setServerProblems(null);
    setStale(false);
    setAfterReload(null);
    setPendingReload(null);
    setPhoneNote(false);
    keptWaysRef.current = new Map();
  }
  function startEdit(n = danNo) {
    const dan = n === danNo ? shownDan : rubric?.dans?.find((x) => x.dan === n);
    if (!dan || !canEdit) return;
    clearToast();
    setBanner(null);
    resetEditState();
    d.start(dan);
  }
  function stopEdit() {
    d.stop();
    resetEditState();
    setDialog(null);
  }

  // A newer version of the Dan being edited arrived (another admin saved): the banner.
  const loadedRev = loadedDan?.rev ?? null;
  useEffect(() => {
    if (!editing || !d.base || loadedRev === null) return;
    if (loadedRev > d.base.rev && !pendingReload) setStale(true);
  }, [editing, d.base, loadedRev, pendingReload]);

  // Reload pressed: as soon as the newer version is here, it becomes the draft (R11).
  useEffect(() => {
    if (!pendingReload || !editing || !d.base || !loadedDan || loadedDan.rev <= d.base.rev) return;
    let theirs = [];
    try {
      theirs = danDiff(d.base, loadedDan);
    } catch {
      theirs = [];
    }
    d.restart(loadedDan);
    setAfterReload({ theirLine: T.nowShowing(loadedDan.saved_by_name, T.timeOfDay(loadedDan.saved_at), theirs.join('; ')), yours: pendingReload.yours });
    setPendingReload(null);
    setStale(false);
    setTriedSave(false);
    setServerProblems(null);
  }, [pendingReload, editing, d, loadedDan]);

  // The live reload has caught up with a Dan just saved here: stop showing the local copy.
  useEffect(() => {
    if (override && loadedDan && loadedDan.dan === override.dan && loadedDan.rev >= override.rev) setOverride(null);
  }, [override, loadedDan]);

  // The copy can't be edited any more (locked, or the admin became staff): leave the editor.
  useEffect(() => {
    if (!canEdit && editing) stopEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // ----- Leaving with unsaved changes (R10) -----
  const guardRef = useRef(null);
  useLayoutEffect(() => {
    guardRef.current = (proceed) => {
      if (!d.editing || d.changes.length === 0) return false;
      setDialog({ type: 'discard', proceed });
      return true;
    };
  });
  useEffect(() => {
    if (!setGuard) return undefined;
    setGuard((proceed) => guardRef.current?.(proceed) ?? false);
    return () => setGuard(null);
  }, [setGuard]);

  const hasUnsaved = editing && count > 0;
  useEffect(() => {
    if (!hasUnsaved) return undefined;
    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = ''; // older browsers need this to show their own "Leave site?" question
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  const modal = (dialog !== null || (editing && isPhone)) && !screenLocked;
  useEffect(() => {
    onModalChange?.(modal);
  }, [modal, onModalChange]);
  useEffect(() => () => onModalChange?.(false), [onModalChange]);

  // ----- Saving (R8, R11) -----
  async function save() {
    if (!d.editing || saving || stale) return;
    const { dan, problems } = d.check;
    if (problems.length > 0) {
      setTriedSave(true);
      setServerProblems(null);
      window.requestAnimationFrame(() => editTopRef.current?.querySelector('.bbe-errors')?.scrollIntoView?.({ block: 'nearest' }));
      return;
    }
    if (d.changes.length === 0) {
      stopEdit();
      return;
    }
    const base = d.base;
    setSaving(true);
    setBanner(null);
    clearToast();
    const result = await saveDan({ dan: danNo, expectedRev: base.rev, sheet: dan });
    setSaving(false);
    const status = result.status;
    if (status === 'ok') {
      stopEdit();
      if (result.changed) {
        setOverride({ ...dan, dan: danNo, rev: result.rev, saved_at: result.savedAt, saved_by_name: result.savedByName });
        const savedRev = result.rev;
        showToast(T.danRubricSaved(danNo), {
          icon: false,
          action: result.undoAvailable ? { label: T.UNDO, onAction: () => undo(danNo, savedRev, base) } : null,
        });
      }
      reload();
    } else if (status === 'invalid') {
      setTriedSave(true);
      setServerProblems(result.problems?.length ? result.problems : [{ code: 'shape' }]);
    } else if (status === 'stale') {
      setStale(true);
      reload();
    } else if (status === 'locked') {
      stopEdit();
      setBanner({ text: T.RUBRIC_LOCKED_NOW });
      onLocked?.();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.RUBRIC_NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'not_found') {
      stopEdit();
      onLocked?.();
    } else {
      setBanner({ text: T.SAVE_FAILED, retry: () => save() });
    }
  }

  async function undo(n, rev, previous) {
    const result = await undoDan({ dan: n, expectedRev: rev });
    const status = result.status;
    if (status === 'ok') {
      setOverride({ ...previous, rev: result.rev, saved_at: result.savedAt, saved_by_name: result.savedByName });
      showToast(T.TOAST_UNDONE, { icon: false });
      reload();
    } else if (status === 'no_access') {
      onNoAccess();
    } else if (status === 'stale') {
      setBanner({ text: T.UNDO_RUBRIC_STALE });
      reload();
    } else if (status === 'locked') {
      setBanner({ text: T.RUBRIC_LOCKED_NOW });
      onLocked?.();
    } else if (status === 'not_allowed') {
      setBanner({ text: T.RUBRIC_NOT_ALLOWED });
      onRefreshProfile();
    } else if (status === 'invalid' || status === 'not_found') {
      setBanner({ text: T.UNDO_RUBRIC_STALE });
      reload();
    } else {
      setBanner({ text: T.RUBRIC_UNDO_FAILED, retry: () => undo(n, rev, previous) });
    }
  }

  function pressReload() {
    let yours = [];
    try {
      yours = danDiff(d.base, d.check.dan);
    } catch {
      yours = [];
    }
    setPendingReload({ yours });
    reload();
  }

  // ----- The dialogs on top of the editor -----
  function closeDialog() {
    const opener = dialog?.opener;
    setDialog(null);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => opener?.isConnected && opener.focus()));
  }
  function openSubject(code, id, opener) {
    const part = d.draft.parts.find((p) => p.code === code);
    const subject = part?.subjects.find((s) => s.id === id);
    if (!subject) return;
    setDialog({ type: 'subject', code, subject, isNew: false, opener, key: Date.now() });
  }
  function addSubject(code, opener) {
    const part = d.draft.parts.find((p) => p.code === code);
    if (!part) return;
    const { dan } = prepareDan(d.draft);
    const preparedPart = dan.parts.find((p) => p.code === code);
    const subject = {
      id: newSubjectId(dan),
      name: '',
      credits: 1,
      scoring: 'graded',
      ways: [],
      points_mode: 'worked',
      points: {},
      limited_to: null,
      outdoor: false,
      handed_in: false,
      note: null,
    };
    const worked = workedPoints(preparedPart, subject);
    subject.points = Object.fromEntries(subjectLetters(code, 'graded').map((l) => [l, worked[l] ?? '']));
    setDialog({ type: 'subject', code, subject, isNew: true, opener, key: Date.now() });
  }

  // Phones: the back arrow (or Back) on the full-screen editor.
  function phoneRequestClose() {
    if (dialog?.type === 'subject') {
      subjectCloseRef.current?.();
      return;
    }
    if (dialog) {
      closeDialog();
      return;
    }
    if (count === 0) {
      stopEdit();
      return;
    }
    setPhoneNote(true);
  }

  // ----- Drawing -----
  if (!rubric) return null;

  const switcher = (
    <div className="bbr-switcher">
      <span id={`bbr-switch-${cardKey}`} className="visually-hidden">
        {T.DAN_SWITCHER}
      </span>
      <Choice
        labelId={`bbr-switch-${cardKey}`}
        className="bbr-gray bbr-dans"
        options={RUBRIC_DANS.map((n) => ({ key: n, label: T.DAN_LABELS[n] }))}
        value={danNo}
        onChange={(n) => {
          if (!editing) {
            chooseDan(n);
            return;
          }
          const go = () => {
            chooseDan(n);
            startEdit(n);
          };
          if (count > 0) setDialog({ type: 'discard', proceed: go });
          else go();
        }}
      />
    </div>
  );

  const bannerElement = banner ? <ErrorBanner text={banner.text} onRetry={banner.retry ? () => banner.retry() : undefined} retrying={saving} onDismiss={() => setBanner(null)} /> : null;
  const staleBanner = stale ? (
    <div className="errbar" role="alert">
      <IconAlertTriangle size={16} aria-hidden="true" className="errbar-icon" />
      <span className="errbar-text">{T.otherAdminSaved(danNo)}</span>
      <span className="errbar-actions">
        <button type="button" className="btn errbar-retry" onClick={pressReload}>
          {T.RELOAD}
        </button>
      </span>
    </div>
  ) : null;

  let editor = null;
  if (editing && d.draft && !screenLocked) {
    const editorElement = (
      <div ref={editTopRef}>
        <RubricEditor
          d={d}
          isPhone={isPhone}
          where={where}
          phoneWhere={phoneWhere}
          editorLine={editorLine}
          switcher={isPhone ? null : switcher}
          triedSave={triedSave}
          serverProblems={serverProblems}
          stale={stale}
          saving={saving}
          topBanners={
            <>
              {staleBanner}
              {bannerElement}
            </>
          }
          afterReload={afterReload}
          onHideReload={() => setAfterReload((a) => (a ? { ...a, yours: [] } : a))}
          footerNote={phoneNote ? <PhoneUnsavedNote onDiscard={stopEdit} /> : null}
          onCancel={stopEdit}
          onSave={save}
          onCopy={(opener) => setDialog({ type: 'copy', opener })}
          onEditSubject={openSubject}
          onAddSubject={addSubject}
          onSplit={(index, opener) => setDialog({ type: 'split', index, opener })}
        />
      </div>
    );
    editor = isPhone ? (
      <Dialog title={T.editDan(danNo)} fullScreen onRequestClose={phoneRequestClose}>
        {editorElement}
      </Dialog>
    ) : (
      editorElement
    );
  }

  let dialogElement = null;
  if (dialog && !screenLocked && d.draft) {
    if (dialog.type === 'subject') {
      dialogElement = (
        <SubjectDialog
          key={dialog.key}
          draft={d.draft}
          partCode={dialog.code}
          subject={dialog.subject}
          isNew={dialog.isNew}
          keptWays={keptWaysRef.current.get(dialog.subject.id) ?? null}
          where={where}
          isPhone={isPhone}
          requestCloseRef={subjectCloseRef}
          onCancel={closeDialog}
          onDone={(subject, kept) => {
            if (kept) keptWaysRef.current.set(subject.id, kept);
            else keptWaysRef.current.delete(subject.id);
            d.putSubject(dialog.code, subject);
            setPhoneNote(false);
            closeDialog();
          }}
        />
      );
    } else if (dialog.type === 'split') {
      const bracket = prepareDan(d.draft).dan.pass.brackets[dialog.index];
      dialogElement = bracket ? (
        <SplitBracketDialog
          bracket={bracket}
          danNo={danNo}
          where={where}
          isPhone={isPhone}
          onCancel={closeDialog}
          onSplit={(age) => {
            if (d.splitPassBracket(dialog.index, age)) closeDialog();
          }}
        />
      ) : null;
    } else if (dialog.type === 'copy') {
      dialogElement = (
        <CopyDanDialog
          rubric={rubric}
          danNo={danNo}
          where={where}
          unsaved={count}
          isPhone={isPhone}
          onCancel={closeDialog}
          onCopy={(from) => {
            const source = rubric.dans.find((x) => x.dan === from);
            if (source) d.copyFrom({ ...JSON.parse(JSON.stringify(source)), dan: danNo, rev: d.base.rev, saved_at: d.base.saved_at, saved_by_name: d.base.saved_by_name }, from);
            setPhoneNote(false);
            closeDialog();
          }}
        />
      );
    } else if (dialog.type === 'discard') {
      dialogElement = (
        <DiscardDialog
          danNo={danNo}
          count={count}
          nested={isPhone && editing}
          onKeep={closeDialog}
          onDiscard={() => {
            const proceed = dialog.proceed;
            stopEdit();
            proceed?.();
          }}
        />
      );
    }
  }

  return (
    <section className={`bbr-card${editing && !isPhone ? ' is-editing' : ''}`} aria-label={title}>
      {editing && !isPhone ? (
        editor
      ) : (
        <>
          <div className="bbr-card-head">
            <h2 className="bbr-card-title">{title}</h2>
            {canEdit && (
              <button type="button" className="btn btn-sm bbr-edit" onClick={() => startEdit()}>
                {/* ti-edit = edit */}
                <IconEdit size={16} aria-hidden="true" />
                {T.editDan(danNo)}
              </button>
            )}
          </div>
          {subtitle && <p className="bbr-sub">{subtitle}</p>}
          {switcher}
          {readLine && <p className="bbr-sub">{readLine}</p>}
          {bannerElement}
          <RubricReadView key={danNo} dan={shownDan} isPhone={isPhone} showStamp={isAdmin} />
          {isPhone && editor}
        </>
      )}
      {dialogElement}
    </section>
  );
}
