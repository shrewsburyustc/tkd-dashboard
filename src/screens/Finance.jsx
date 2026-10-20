// Finance.jsx — the Finance section (rail icon ti-report-money, "Finance", last on the rail; v0.804, v0.201).
// Why it exists: families pay for Color belt and Star testing at the desk, and each school's
// drawer is counted and closed at the end of the day. This file draws the frame of the section:
//   - the page title "Finance" and the tab bar: Daily report · Settings (Settings for admins only)
//   - the open view, picked by the address (App.jsx):
//       #finance           the Daily report (finance/DayReport.jsx)
//       #finance/history   History, a month of days (finance/HistoryView.jsx) — admins only
//       #finance/settings  the reminder settings (finance/SettingsTab.jsx) — admins only
// It also keeps "which day is shown": staff always see today (v0.806); admins move between days
// and the day is remembered while the dashboard is open (finance/financeState.js).
// "Today" is the school's date (America/New_York), re-checked every minute so a page left open
// past midnight moves on to the new day.
//
// Every word is in finance/text.js; the styles are in styles/finance.css.
//
// Props (from App.jsx):
//   location, onLocationChange   the top-bar school ('Worcester' | 'Shrewsbury' | 'Both')
//   isAdmin        show admin controls (the database enforces the same rules)
//   view           'report' | 'history' | 'settings';  onView(view) changes it (and the address)
//   profileName    the signed-in person's name (printed on the paper copy, D8)
//   screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast, onModalOpenChange
//   onOpenTesting(schoolName)   "Open in Testing" in a payment's detail
import { useEffect, useRef, useState } from 'react';
// eventsApi's schoolToday also follows the preview's __tkdPreview.setToday (the fake database does too).
import { schoolToday } from '../lib/testing/eventsApi.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import DayReport from './finance/DayReport.jsx';
import HistoryView from './finance/HistoryView.jsx';
import SettingsTab from './finance/SettingsTab.jsx';
import { financeState } from './finance/financeState.js';
import { monthStart } from './finance/format.js';
import * as T from './finance/text.js';
import '../styles/finance.css';

// The school's date, re-read every minute (so midnight moves "today" on).
function useSchoolToday() {
  const [today, setToday] = useState(() => schoolToday());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(schoolToday()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

export default function Finance({
  location,
  onLocationChange,
  isAdmin,
  view,
  onView,
  profileName,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
  onOpenTesting,
}) {
  const today = useSchoolToday();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);

  // The shown day: staff → today; admins → the remembered day (never after today).
  const [, redraw] = useState(0);
  const remembered = financeState.day && financeState.day < today ? financeState.day : null;
  const day = isAdmin ? (remembered ?? today) : today;
  const month = financeState.month && financeState.month < monthStart(today) ? financeState.month : monthStart(today);
  // History's "Back to the day" returns to the day you came from (v0.207).
  const backDayRef = useRef(null);

  function setDay(next) {
    financeState.day = next; // null = today
    redraw((n) => n + 1);
  }
  function setMonth(next) {
    financeState.month = next;
    redraw((n) => n + 1);
  }

  const tabs = [{ key: 'report', label: T.TAB_REPORT }];
  if (isAdmin) tabs.push({ key: 'settings', label: T.TAB_SETTINGS });
  const currentTab = view === 'settings' ? 'settings' : 'report';
  const tabRefs = useRef({});

  // ← → move between the tabs (as the Testing tabs).
  function handleTabKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.findIndex((t) => t.key === currentTab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    onView(next.key);
    tabRefs.current[next.key]?.focus();
  }

  let content;
  if (view === 'settings' && isAdmin) {
    content = (
      <SettingsTab
        isPhone={isPhone}
        location={location}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
      />
    );
  } else if (view === 'history' && isAdmin) {
    content = (
      <HistoryView
        location={location}
        today={today}
        month={month}
        onMonth={setMonth}
        onBack={() => {
          if (backDayRef.current !== null) setDay(backDayRef.current === today ? null : backDayRef.current);
          onView('report');
        }}
        onOpenDay={(pickedDay, schoolName) => {
          setDay(pickedDay === today ? null : pickedDay);
          if (schoolName) onLocationChange(schoolName); // a Both row opens that school's day
          onView('report');
        }}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        wide={wide}
        isPhone={isPhone}
        isTouch={isTouch}
      />
    );
  } else {
    content = (
      <DayReport
        location={location}
        isAdmin={isAdmin}
        today={today}
        day={day}
        onDay={setDay}
        onOpenHistory={() => {
          backDayRef.current = day;
          setMonth(monthStart(day)); // History opens on the shown day's month
          onView('history');
        }}
        onLocationChange={onLocationChange}
        profileName={profileName}
        screenLocked={screenLocked}
        onNoAccess={onNoAccess}
        onRefreshProfile={onRefreshProfile}
        showToast={showToast}
        clearToast={clearToast}
        onModalOpenChange={onModalOpenChange}
        onOpenTesting={onOpenTesting}
      />
    );
  }

  return (
    <div className="finance">
      <h1 className="ptitle fin-title">{T.PAGE_TITLE}</h1>
      <div className="ttabs fin-tabs" role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleTabKeyDown}>
        {tabs.map((t) => {
          const current = t.key === currentTab;
          return (
            <button
              key={t.key}
              ref={(element) => {
                tabRefs.current[t.key] = element;
              }}
              type="button"
              role="tab"
              className={`ttab${current ? ' is-current' : ''}`}
              aria-selected={current ? 'true' : 'false'}
              tabIndex={current ? 0 : -1}
              onClick={() => onView(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={currentTab === 'settings' ? T.TAB_SETTINGS : T.TAB_REPORT}>
        {content}
      </div>
    </div>
  );
}
