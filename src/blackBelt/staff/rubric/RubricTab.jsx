// RubricTab.jsx — the "Rubric and prices" tab of Black Belt testing.
// Why it exists: approved mockup Cycles 6 with the v0.902 redraw (prices moved to each cycle), and
// contract CONTRACT-0016-B1 §3, OP-3, OP-8, OP-9. For now it holds:
//   - "Same for both schools. Prices are set on each cycle."
//   - the Waiver block: "Version 2027-1", the first lines and Read all (the whole text), who signs,
//     and for admins the Edit icon (Edit waiver → a new version). The seeded waiver is a
//     placeholder: an amber line says to save the school's waiver before opening registration.
//   - the Keeping block: "Keep signed waivers for N years after the last testing day. For a
//     candidate under 18: …" — while the insurer hasn't answered, "Not set: nothing is deleted
//     until both numbers are entered." Admins edit it (KeepYearsDialog.jsx).
//   - staff: "View only. Ask an admin to make changes." under the tabs, no Edit icons.
// The rubric itself (parts, subjects, scoring) arrives here with grading (P7: no placeholder).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import IconButton from '../../../components/IconButton.jsx';
import { loadRubric } from '../../../lib/blackBelt/api.js';
import { PHONE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { LIVE_REFRESH_MS, useLiveLoad } from '../../../screens/testing/events/useLiveLoad.js';
import KeepYearsDialog from './KeepYearsDialog.jsx';
import ReadAllDialog from './ReadAllDialog.jsx';
import WaiverDialog from './WaiverDialog.jsx';
import * as T from '../text.js';

const LIVE_KEY = 'black-belt-rubric';
const load = () => loadRubric();

// The first few lines of the waiver for the block (the whole text is in Read all).
function firstLines(body) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 320).replace(/\s+\S*$/, '')} …` : text;
}

export default function RubricTab({ isAdmin, panelId, tabId, renderHeader, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange }) {
  const live = useLiveLoad({ key: LIVE_KEY, enabled: !screenLocked, load, refreshMs: LIVE_REFRESH_MS });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [dialog, setDialog] = useState(null); // { type: 'read' | 'waiver' | 'keep', opener, … }
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  function close() {
    const opener = dialog?.opener;
    setDialog(null);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => opener?.isConnected && opener.focus()));
  }
  function saved(text) {
    close();
    showToast(text, { icon: false });
    liveRef.current.reload();
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

        <section className="bb-block" aria-labelledby={`${panelId}-waiver`}>
          <div className="bb-block-head">
            <h2 id={`${panelId}-waiver`} className="bb-block-title">
              {T.WAIVER}
            </h2>
            <span className="bb-block-meta">{T.versionLabel(current.versionName)}</span>
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
          <p className="bb-waiver-start">
            {firstLines(current.body)}{' '}
            <button type="button" className="link-button bb-read-all" onClick={(event) => setDialog({ type: 'read', opener: event.currentTarget, key: Date.now() })}>
              {T.READ_ALL}
            </button>
          </p>
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
        {banner && <ErrorBanner text={banner.text} onDismiss={() => setBanner(null)} />}
        {body}
      </div>
      {dialogElement}
    </>
  );
}
