// RubricTab.jsx — the "Rubric and waiver" tab of Black Belt testing.
// Why it exists: approved mockup Cycles 6 with the v0.902 redraw (prices moved to each cycle), and
// contract CONTRACT-0016-B1 §3, OP-3, OP-8, OP-9. For now it holds:
//   - "Same for both schools. Prices are set on each cycle."
//   - the Waiver block (full width, as drawn): head "Waiver [Version 2027-1]" (the version as a
//     tag) with the admin's Edit icon; the first lines in a gray box; "Read all" (the whole text)
//     under the box; who signs. The Edit icon (Edit waiver → a new version). The seeded waiver is a
//     placeholder: an amber line says to save the school's waiver before opening registration.
//   - the Keeping block (its save: "Keeping time saved · Undo", BB5 v0.967 — runUndoKeep below): "Keep signed waivers for N years after the last testing day. For a
//     candidate under 18: …" — while the insurer hasn't answered, "Not set: nothing is deleted
//     until both numbers are entered." Admins edit it (KeepYearsDialog.jsx).
//   - staff: "View only. Ask an admin to make changes." under the tabs, no Edit icons.
//   - the Result emails block (migration 0025, Results mockup R03; ResultEmailsBlock.jsx): the three
//     result email texts, between the Keeping block and the Default rubric card.
//   - the Default rubric card (migration 0024, mockups R1–R11; DefaultRubricCard.jsx): what every
//     new cycle starts from, below the Waiver and Keeping cards. Admins edit one Dan at a time;
//     while a Dan has unsaved changes every way out asks first (setGuard, from BlackBeltTesting).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { loadRubric, setKeepYears } from '../../../lib/blackBelt/api.js';
import { useSaveLine } from '../../../lib/saveLine.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import KeepYearsDialog from './KeepYearsDialog.jsx';
import ReadAllDialog from './ReadAllDialog.jsx';
import WaiverDialog from './WaiverDialog.jsx';
import DefaultRubricCard from './DefaultRubricCard.jsx';
import ResultEmailsBlock from './ResultEmailsBlock.jsx';
import { focusCurrentTab } from '../parts/focusCurrentTab.js';
import LineBar from '../parts/LineBar.jsx';
import { undoBarFor } from '../parts/undoBar.js';
import * as T from '../text.js';

const LIVE_KEY = 'black-belt-rubric';
const load = () => loadRubric();

// The first few lines of the waiver for the block (the whole text is in Read all).
function firstLines(body) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 320).replace(/\s+\S*$/, '')} …` : text;
}

export default function RubricTab({ isAdmin, panelId, tabId, renderHeader, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange, setGuard }) {
  const live = useLiveLoad({ key: LIVE_KEY, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [dialog, setDialog] = useState(null); // { type: 'read' | 'waiver' | 'keep', opener, … }
  const [banner, setBanner] = useState(null);
  // The toast's Undo goes through the shared save line (R2-05): pressed while another save runs, it waits its turn.
  const line = useSaveLine({ section: T.UNDO_SECTION, showToast, undoBar: undoBarFor(setBanner) });
  const [rubricModal, setRubricModal] = useState(false); // the rubric card's dialogs / phone editor
  const [textsModal, setTextsModal] = useState(false); // the Result emails block's Edit result email

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const modalShown = (dialog !== null || rubricModal || textsModal) && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  function close() {
    const opener = dialog?.opener;
    setDialog(null);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => opener?.isConnected && opener.focus()));
  }
  // undo (Keeping signed waivers only, BB5 v0.967): { version, afterLastDay, after18 } = the numbers
  // from before the save → "Keeping time saved · Undo". Edit waiver passes none: a waiver version
  // is a legal record the database never changes or removes, so it keeps no Undo.
  function saved(text, undo = null) {
    close();
    showToast(text, undo ? { icon: false, action: line.undoAction(() => runUndoKeep(undo), { words: T.TOAST_KEEPING_SAVED }) } : { icon: false });
    liveRef.current.reload();
  }

  // The keeping time's Undo: the same two steps as the dialog's Save. It never deletes anything:
  // if the old numbers would delete details now, it is refused in the amber bar instead of asking
  // the red "This can't be undone" question. Every problem goes in the amber bar (v0.966).
  // Runs inside the save line: answers { status, reason? } and the line shows "Undone" or the bar.
  async function runUndoKeep(undo) {
    const args = { expectedVersion: undo.version, afterLastDay: undo.afterLastDay, after18: undo.after18 };
    let result = await setKeepYears({ ...args, confirmCount: null });
    if (result.status === 'confirm_needed' && (result.removeCount ?? 0) === 0) result = await setKeepYears({ ...args, confirmCount: 0 });
    const status = result.status;
    if (status === 'ok') {
      await liveRef.current.reload();
      return { status: 'ok' };
    }
    if (status === 'no_access') {
      onNoAccess();
      return { status };
    }
    if (status === 'error') return { status };
    if (status === 'not_allowed') onRefreshProfile();
    await liveRef.current.reload();
    const words = { confirm_needed: T.UNDO_KEEP_DELETES, stale: T.UNDO_KEEP_STALE, not_allowed: T.NOT_ALLOWED }[status] ?? T.INVALID;
    return { status, reason: words };
  }

  const data = live.data;
  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_RUBRIC}</span>
        {[0, 1].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error' || (live.status === 'ready' && !data)) {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else {
    const { current, settings } = data;
    const keepSet = Number.isInteger(settings.afterLastDay) && Number.isInteger(settings.after18);
    body = (
      <>
        <p className="bb-rubric-line">{T.RUBRIC_LINE}</p>

        <section className="bb-block bb-block--waiver" aria-labelledby={`${panelId}-waiver`}>
          <div className="bb-block-head bb-block-head--line">
            <h2 id={`${panelId}-waiver`} className="bb-block-title">
              {T.WAIVER}
            </h2>
            <span className="ttag">{T.versionLabel(current.versionName)}</span>
            {isAdmin && (
              <IconButton label={T.EDIT_WAIVER} Icon={IconEdit} className="bb-block-edit" onClick={(event) => setDialog({ type: 'waiver', opener: event.currentTarget, key: Date.now() })} />
            )}
          </div>
          {current.isPlaceholder && (
            <p className="bb-amber-line">
              <IconAlertTriangle size={16} aria-hidden="true" />
              <span>{T.WAIVER_PLACEHOLDER}</span>
            </p>
          )}
          <p className="bb-waiver-start">{firstLines(current.body)}</p>
          <button type="button" className="link-button bb-read-all" onClick={(event) => setDialog({ type: 'read', opener: event.currentTarget, key: Date.now() })}>
            {T.READ_ALL}
          </button>
          <p className="field-hint">{isAdmin ? T.WAIVER_ABOUT_ADMIN : T.WAIVER_ABOUT_STAFF}</p>
        </section>

        <section className="bb-block" aria-label={T.KEEPING}>
          <div className="bb-block-head bb-block-head--plain">
            <p className="bb-keep-line">
              {keepSet ? (
                <>
                  {T.keepSentence1(settings.afterLastDay)} {T.keepSentence2(settings.after18)}
                </>
              ) : (
                T.KEEP_NOT_SET
              )}
            </p>
            {isAdmin && (
              <IconButton label={T.EDIT_KEEPING} Icon={IconEdit} className="bb-block-edit" onClick={(event) => setDialog({ type: 'keep', opener: event.currentTarget, key: Date.now() })} />
            )}
          </div>
          <p className="field-hint">{keepSet ? T.KEEP_DELETED_AFTER : T.KEEP_WAITING}</p>
          {settings.updatedByName && <p className="tmeta">{T.lastChanged(settings.updatedByName, settings.updatedAt)}</p>}
        </section>

        <ResultEmailsBlock
          isAdmin={isAdmin}
          isPhone={isPhone}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          onModalChange={setTextsModal}
        />

        <DefaultRubricCard
          isAdmin={isAdmin}
          isPhone={isPhone}
          screenLocked={screenLocked}
          onNoAccess={onNoAccess}
          onRefreshProfile={onRefreshProfile}
          showToast={showToast}
          clearToast={clearToast}
          setGuard={setGuard}
          onModalChange={setRubricModal}
        />
      </>
    );
  }

  let dialogElement = null;
  if (dialog && !screenLocked && data) {
    const common = { isPhone, onClose: close, onNoAccess, onRefreshProfile, clearToast };
    if (dialog.type === 'read') dialogElement = <ReadAllDialog key={dialog.key} {...common} waiver={data.current} />;
    else if (dialog.type === 'waiver') dialogElement = <WaiverDialog key={dialog.key} {...common} current={data.current} nextVersionName={data.nextVersionName} onSaved={saved} onStale={() => liveRef.current.reload()} />;
    else dialogElement = <KeepYearsDialog key={dialog.key} {...common} settings={data.settings} onSaved={saved} onStale={() => liveRef.current.reload()} />;
  }

  return (
    <>
      {renderHeader(null)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel bb-rubric">
        {banner && <LineBar takeFocus={banner.takeFocus === true} focusKey={banner} text={banner.text} onRetry={banner.retry} retrying={banner.retrying === true} onDismiss={() => { setBanner(null); focusCurrentTab(); }} />}
        {body}
      </div>
      {dialogElement}
    </>
  );
}
