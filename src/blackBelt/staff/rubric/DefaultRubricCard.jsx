// DefaultRubricCard.jsx — the "Default rubric" card on Rubric and waiver (mockups R1–R11).
// Why it exists: CONTRACT-0024 §10.3, rulebook v0.921: the default rubric is what every new
// cycle starts from. Admins edit it any time (one Dan at a time); staff see it read-only. This
// file loads it (and keeps it fresh every 15 seconds, so another admin's save shows up) and
// hands it to RubricCard.jsx, which draws the read view and the editor.
// It sits below the Waiver and Keeping cards (the mockups' placement).
// "Couldn't load" is the page's amber bar under the top bar (PageBar, v1.128).
import { useEffect, useLayoutEffect, useRef } from 'react';
import PageBar from '../../../components/PageBar.jsx';
import { loadDefaultRubric, saveDefaultDan, undoDefaultDan } from '../../../lib/blackBelt/api.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../lib/useLiveLoad.js';
import RubricCard from './RubricCard.jsx';
import { focusCurrentTab } from '../parts/focusCurrentTab.js';
import { useBarFocusReturn } from '../parts/useBarFocusReturn.js';
import * as T from '../text.js';

const LIVE_KEY = 'black-belt-default-rubric';
const load = () => loadDefaultRubric();

export default function DefaultRubricCard({ isAdmin, isPhone, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, setGuard, onModalChange }) {
  const live = useLiveLoad({ key: LIVE_KEY, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  // C5: "couldn't load" is a PageBar drawn from the load's status: when a Retry works, focus goes to the tab.
  useBarFocusReturn(live.status === 'error' || (live.status === 'ready' && !live.data?.rubric), focusCurrentTab);

  if (live.status === 'loading' || live.status === 'idle') {
    return (
      <div className="bbr-card tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_RUBRIC_CARD}</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  }
  if (live.status === 'noAccess') return null;
  if (live.status === 'error' || !live.data?.rubric) {
    return <PageBar text={T.RUBRIC_LOAD_FAILED} onRetry={() => liveRef.current.reload()} />;
  }

  return (
    <RubricCard
      cardKey="default"
      title={T.DEFAULT_RUBRIC}
      subtitle={null}
      readLine={T.DEFAULT_USED_BY}
      editorLine={T.DEFAULT_USED_BY}
      where={T.WHERE_DEFAULT}
      phoneWhere={T.DEFAULT_RUBRIC_WHERE}
      rubric={live.data.rubric}
      canEdit={isAdmin}
      isAdmin={isAdmin}
      isPhone={isPhone}
      screenLocked={screenLocked}
      saveDan={({ dan, expectedRev, sheet }) => saveDefaultDan({ dan, expectedRev, sheet })}
      undoDan={({ dan, expectedRev }) => undoDefaultDan({ dan, expectedRev })}
      reload={() => liveRef.current.reload()}
      setGuard={setGuard}
      onModalChange={onModalChange}
      showToast={showToast}
      clearToast={clearToast}
      onNoAccess={onNoAccess}
      onRefreshProfile={onRefreshProfile}
    />
  );
}
