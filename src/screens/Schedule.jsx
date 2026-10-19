// Schedule.jsx — the Schedule section (rail icon ti-clock, "Schedule"; rulebook v0.233).
// Why it exists: each school's weekly classes, shown like a calendar (times down the side, box
// height = class length), with planned future schedules. This file draws the frame:
//   - one school: the page header ("Schedule", the school, Plan a change, + Add time slot) and
//     that school's schedule (schedule/ScheduleSchool.jsx does the rest)
//   - "Both": the two schools one above the other, each with its own heading and schedule picker
//     (decided v0.233 — schedules are never mixed into one grid). The page header keeps ONE
//     "Plan a change" and ONE blue "+ Add time slot"; they first ask which school (mockup
//     screen 8), then that school opens its dialog.
//   - for staff, the line "View only. Ask an admin to make changes."
//
// Props (from App.jsx), the same as Testing's:
//   location, isAdmin, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast,
//   onModalOpenChange (true while any Schedule dialog is open: the page behind becomes inert)
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCalendarPlus, IconDots, IconPlus } from '@tabler/icons-react';
import Dialog from '../components/Dialog.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { LOCATION_CODE, LOCATIONS } from '../lib/device.js';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useShortcutN } from '../lib/useShortcutN.js';
import ScheduleSchool from './schedule/ScheduleSchool.jsx';
import * as T from './schedule/text.js';

function PageHeader({ subtitle, buttons }) {
  return (
    <div className="phead">
      <div className="phead-titles">
        <h1 className="ptitle">{T.PAGE_TITLE}</h1>
        {subtitle && <p className="psub">{subtitle}</p>}
      </div>
      {buttons}
    </div>
  );
}

export default function Schedule({ location, isAdmin, onModalOpenChange, ...rest }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const device = isPhone ? 'phone' : isWide ? 'pc' : 'tablet';

  // Each school (and the "Which school?" choice) reports its own dialog; the page is "modal"
  // while any of them has one open.
  const openRef = useRef(new Set());
  const handleModal = useCallback(
    (key, open) => {
      if (open) openRef.current.add(key);
      else openRef.current.delete(key);
      onModalOpenChange(openRef.current.size > 0);
    },
    [onModalOpenChange],
  );

  // ----- Both: "Which school?" -----
  const [choosing, setChoosing] = useState(null); // { kind: 'add' | 'plan', opener } while asking
  const [request, setRequest] = useState(null); // { kind, school, seq } → handed to that school
  const [menuAnchor, setMenuAnchor] = useState(null); // phone ⋯ (Plan a change)
  const both = location === 'Both';
  const asking = both && choosing !== null && !rest.screenLocked;
  useEffect(() => {
    handleModal('chooser', asking);
  }, [asking, handleModal]);
  useEffect(() => {
    if (!both) setChoosing(null);
  }, [both]);

  function ask(kind, opener) {
    setMenuAnchor(null);
    setChoosing({ kind, opener });
  }
  function choose(school) {
    const kind = choosing.kind;
    setChoosing(null);
    // The "Which school?" box takes its Back-button step out of the browser history a moment
    // after closing (Dialog.jsx). Open the school's dialog only once that has happened, or the
    // late "Back" would close the new dialog straight away. (Fallback: 300 ms.)
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', go);
      setRequest((r) => ({ kind, school, seq: (r?.seq ?? 0) + 1 }));
    };
    window.addEventListener('popstate', go);
    window.setTimeout(go, 300);
  }
  function cancelChoosing() {
    const opener = choosing?.opener;
    setChoosing(null);
    window.requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }

  useShortcutN({
    enabled: both && isAdmin && choosing === null && !rest.screenLocked,
    onPress: () => ask('add', document.querySelector('[data-both-add]')),
  });

  const common = { isAdmin, device, onModalOpenChange: handleModal, ...rest };

  if (both) {
    const buttons = isAdmin ? (
      <div className="sactions">
        {isPhone ? (
          <button
            type="button"
            className="icon-button"
            aria-label={T.MORE_ACTIONS}
            aria-haspopup="menu"
            aria-expanded={menuAnchor ? 'true' : 'false'}
            onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
          >
            <IconDots size={20} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn" onClick={(e) => ask('plan', e.currentTarget)}>
            <IconCalendarPlus size={16} aria-hidden="true" />
            {T.PLAN_A_CHANGE}
          </button>
        )}
        <button type="button" className="btn btn-primary" data-both-add onClick={(e) => ask('add', e.currentTarget)}>
          <IconPlus size={16} aria-hidden="true" />
          {isPhone ? T.ADD_SHORT : T.ADD_TIME_SLOT}
        </button>
      </div>
    ) : null;

    return (
      <div className="schedule">
        <PageHeader buttons={buttons} />
        {!isAdmin && <p className="viewonly">{T.VIEW_ONLY_LINE}</p>}
        {LOCATIONS.map((school) => (
          <ScheduleSchool
            key={school}
            school={school}
            locationCode={LOCATION_CODE[school]}
            headerMode="section"
            shortcutEnabled={false}
            request={request?.school === school ? request : null}
            {...common}
          />
        ))}
        {menuAnchor && !rest.screenLocked && (
          <RowMenu
            anchor={menuAnchor}
            isSheet
            title={T.PAGE_TITLE}
            subtitle={T.BOTH_SCHOOLS}
            label={T.MORE_ACTIONS}
            items={[{ key: 'plan', label: T.PLAN_A_CHANGE, Icon: IconCalendarPlus, onSelect: () => ask('plan', menuAnchor) }]}
            onClose={(reason) => {
              const anchor = menuAnchor;
              setMenuAnchor(null);
              if (reason === 'escape' || reason === 'tab') anchor?.focus();
            }}
          />
        )}
        {asking && (
          <Dialog title={T.WHICH_SCHOOL} onRequestClose={cancelChoosing}>
            <p className="tdialog-sub">{T.whichSchoolFor(choosing.kind)}</p>
            <div className="swhich">
              {LOCATIONS.map((school, i) => (
                <button key={school} type="button" className="btn" data-autofocus={i === 0 ? true : undefined} onClick={() => choose(school)}>
                  {school}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={cancelChoosing}>
                {T.CANCEL}
              </button>
            </div>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="schedule">
      <ScheduleSchool
        key={location}
        school={location}
        locationCode={LOCATION_CODE[location]}
        headerMode="page"
        shortcutEnabled
        renderPageHeader={(buttons, subtitle) => <PageHeader subtitle={subtitle} buttons={buttons} />}
        {...common}
      />
    </div>
  );
}
