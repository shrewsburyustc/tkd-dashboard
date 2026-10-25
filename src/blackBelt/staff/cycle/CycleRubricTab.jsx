// CycleRubricTab.jsx — a cycle's own Rubric tab (mockups R12 and R13).
// Why it exists: CONTRACT-0024 §10.3, rulebook v0.921 / v0.929 / v0.930. Every cycle has its own
// copy of the rubric, made from the default rubric when the cycle was added. It shows the same
// read view and editor as the default rubric (RubricCard.jsx), titled "Fall 2027 rubric" with
// "Copied from the default rubric when the cycle was added (Mar 22, 2027)." Under the tabs:
//   - before registration first opens: "This cycle's rubric can be changed until registration
//     first opens. Opening registration locks it." (admins and staff) — admins get Edit 1st Dan (the edit bar says
//     "Fall 2027 only" and "Changes here are for Fall 2027 only. The default rubric stays as it is.")
//   - once registration has opened (even if it closed again): locked for everyone, admins
//     included — a lock icon, "Locked since registration opened on Mar 1, 2027. Changes go into
//     the default rubric for next season." and a "Go to the default rubric" link
//   - staff always see "View only. Ask an admin to make changes." (the cycle page draws it)
// A save answered "locked" (an admin opened registration meanwhile) reloads into the locked view.
// Migration 0025 (contract §14.5; Q-G1 v0.948, OI-2 = B v0.956): once grading started on the cycle
// (its first grade, extra-points count, chosen subject or copied make-up grade), the copy is locked
// for good — even if every grade is cleared again. The line then says "Locked — grading started
// Jun 5, 2027. …" with the lock icon (the date from bb_cycle_grading_state's grading_started_at,
// read with the rubric). A save / undo answered has_grades (grading started meanwhile) stops the
// editor, says so in a toast and reloads into that locked view.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { IconLock } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { loadCycleRubric, saveCycleDan, undoCycleDan } from '../../../lib/blackBelt/api.js';
import { loadGradingState } from '../../../lib/blackBelt/gradingApi.js';
import { FRESH_COPY_SOURCE } from '../../../lib/blackBelt/rubric.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import RubricCard from '../rubric/RubricCard.jsx';
import * as T from '../text.js';

// The cycle's copy plus, since 0025, when grading started (null = not locked by grading). If the
// grading state can't be read, the rubric still shows — the database refuses a save anyway.
async function load(cycleId) {
  const [rubric, grading] = await Promise.all([loadCycleRubric({ cycleId }), loadGradingState({ cycleId })]);
  if (rubric.status !== 'ok') return rubric;
  if (grading.status === 'no_access') return grading;
  return { ...rubric, gradingStartedAt: grading.status === 'ok' ? grading.gradingStartedAt : null };
}

// The gray line under the cycle page's tabs while the Rubric tab is open (admins and staff).
// gradingStartedAt (0025): set once grading started — locked for good, whatever registration says.
export function CycleRubricLine({ locked, firstOpenedAt, gradingStartedAt = null, onGoToDefaultRubric }) {
  if (locked || gradingStartedAt) {
    return (
      <p className="viewonly bbr-locked-line">
        {/* ti-lock = locked */}
        <IconLock size={16} aria-hidden="true" />
        <span>
          {gradingStartedAt ? T.lockedByGrading(T.stampDate(gradingStartedAt)) : T.lockedSince(T.stampDate(firstOpenedAt))}{' '}
          <button type="button" className="link-button bbr-go-default" onClick={onGoToDefaultRubric}>
            {T.GO_TO_DEFAULT}
          </button>
        </span>
      </p>
    );
  }
  // Admins AND staff see it (R13: staff learn when the rubric stops changing).
  return <p className="viewonly">{T.CYCLE_RUBRIC_EDITABLE}</p>;
}

export default function CycleRubricTab({
  cycle, // the cycle page's CycleDetail (id, name, version, firstOpenedAt, createdAt)
  live, // this tab's load (useCycleRubricLoad below), shared with the cycle page's gray line
  isAdmin,
  isPhone,
  screenLocked,
  panelId,
  tabId,
  setGuard,
  onModalChange,
  onLockedNow, // reload the cycle page (registration opened meanwhile)
  showToast,
  clearToast,
  onNoAccess,
  onRefreshProfile,
}) {
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  let body;
  if (live.status === 'loading' || live.status === 'idle' || live.status === 'notFound' || live.status === 'noAccess') {
    body = (
      <div className="bbr-card tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_RUBRIC_CARD}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error' || !live.data?.rubric) {
    body = <ErrorBanner text={T.RUBRIC_LOAD_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else {
    const data = live.data;
    const added = T.stampDate(data.createdAt ?? cycle.createdAt);
    const fromDefault = data.rubric.source === FRESH_COPY_SOURCE;
    const lockedByGrading = Boolean(data.gradingStartedAt);
    // 0025: a has_grades answer (grading started meanwhile) — the card stops editing and reloads
    // (it is passed on as not_found, which RubricCard answers that way without its own banner) and
    // the toast says why.
    const gradingGuard = (call) => async (args) => {
      const result = await call(args);
      if (result.status !== 'has_grades') return result;
      showToast(T.RUBRIC_LOCKED_GRADING_NOW, { icon: false });
      return { status: 'not_found' };
    };
    body = (
      <RubricCard
        cardKey={cycle.id}
        title={T.cycleRubricTitle(cycle.name)}
        subtitle={fromDefault ? T.copiedWhenAdded(added) : T.copiedFromStartingPoint(added)}
        readLine={null}
        editorLine={T.cycleOnlyLine(cycle.name)}
        where={T.whereCycle(cycle.name)}
        phoneWhere={cycle.name}
        rubric={data.rubric}
        canEdit={isAdmin && !data.locked && !lockedByGrading}
        isAdmin={isAdmin}
        isPhone={isPhone}
        screenLocked={screenLocked}
        saveDan={gradingGuard(({ dan, expectedRev, sheet }) => saveCycleDan({ cycleId: cycle.id, dan, expectedRev, sheet }))}
        undoDan={gradingGuard(({ dan, expectedRev }) => undoCycleDan({ cycleId: cycle.id, dan, expectedRev }))}
        reload={() => liveRef.current.reload()}
        onLocked={() => {
          liveRef.current.reload();
          onLockedNow?.();
        }}
        setGuard={setGuard}
        onModalChange={onModalChange}
        showToast={showToast}
        clearToast={clearToast}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
      />
    );
  }

  return (
    <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel bb-cycle-rubric">
      {body}
    </div>
  );
}

// The Rubric tab's load, kept by the cycle page (so its gray "Locked since …" line and the tab
// agree). It reloads when the cycle's version changes (e.g. registration was opened or undone).
export function useCycleRubricLoad({ cycleId, version, enabled, onNoAccess }) {
  const live = useLiveLoad({ key: cycleId, enabled, load, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version === firstVersion.current) return;
    firstVersion.current = version;
    liveRef.current.reload();
  }, [version]);
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  return live;
}
