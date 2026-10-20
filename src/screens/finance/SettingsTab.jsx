// SettingsTab.jsx — Finance → Settings, admins only (mockup D9, v0.203, v0.207).
// Why it exists: it sets the Close-the-day reminder that Home shows (D10). An On / Off switch,
// then a time (or Off) for each day of the week, per school — Saturday's classes end earlier
// than a weekday's. "Copy each school's Monday to Tue–Fri" fills the weekdays in one click
// (phones: only the school shown, as approved in D9).
// There is no Save button: each change saves at once and shows a toast with a 5-second Undo,
// and the database logs it. With the reminder Off the times stay but are grayed out.
// Times are Off, then every 15 minutes from 11:00 AM to 11:00 PM.
// PC / tablet: a small table (Day · Shrewsbury · Worcester). Phone: one school at a time with a
// Shrewsbury / Worcester switch (gray selected side, as v0.89).
// Address: #finance/settings (App.jsx sends staff to #finance; the database refuses them too).
//
// Every write sends the settings' version number; if someone else changed them in the meantime
// the database answers 'stale' and the screen reloads with an amber "Someone else changed this".
//
// Props: isPhone, location, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast
import { useEffect, useId, useRef, useState } from 'react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../lib/device.js';
import {
  financeCopyMonday,
  financeSetReminderOn,
  financeSetReminderTime,
  financeSettingsGet,
} from '../../lib/finance/financeApi.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import { useLiveLoad } from '../testing/events/useLiveLoad.js';
import { REMINDER_TIMES, shortTime } from './format.js';
import * as T from './text.js';

// Column order as drawn in D9.
const SCHOOL_CODES = ['shrewsbury', 'worcester'];
const OFF_VALUE = ''; // the dropdown's value for Off (the database gets null)

export default function SettingsTab({ isPhone, location, screenLocked, onNoAccess, onRefreshProfile, showToast, clearToast }) {
  const id = useId();
  const live = useLiveLoad({ key: 'settings', enabled: !screenLocked, load: () => financeSettingsGet() });
  const [banner, setBanner] = useState(null); // { text, retry? }
  const [busy, setBusy] = useState(false);
  // Phones: the school shown (the top bar's school, or Shrewsbury on Both).
  const [phoneSchool, setPhoneSchool] = useState(location === 'Both' ? 'shrewsbury' : LOCATION_CODE[location]);

  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);

  const data = live.data;
  // The newest settings, for writes started from an older screen (e.g. a banner's Retry).
  const dataRef = useRef(data);
  dataRef.current = data;
  const timeOf = (school, weekday) => shortTime(data?.times?.find((t) => t.school === school && t.weekday === weekday)?.remind_at ?? null);

  // Runs one write. op(version) → the database's answer. undo (optional) → op for the toast's Undo.
  async function save(op, toastText, undo) {
    const current = dataRef.current;
    if (busy || !current) return;
    setBusy(true);
    setBanner(null);
    clearToast();
    const answer = await op(current.version);
    setBusy(false);
    if (answer.status === 'ok') {
      await live.reload();
      showToast(
        toastText,
        undo ? { action: { label: T.UNDO, onAction: () => runUndo(undo, answer.version) }, icon: false } : { icon: false },
      );
      return;
    }
    handleProblem(answer, () => save(op, toastText, undo));
  }

  // The toast's Undo: puts the old value(s) back, using the version the change itself returned.
  async function runUndo(undo, version) {
    setBusy(true);
    const answer = await undo(version);
    setBusy(false);
    if (answer.status === 'ok') {
      live.reload();
      return;
    }
    handleProblem(answer, null);
  }

  function handleProblem(answer, retry) {
    if (answer.status === 'no_access') {
      onNoAccess();
      return;
    }
    if (answer.status === 'stale') {
      setBanner({ text: T.STALE });
      live.reload();
      return;
    }
    if (answer.status === 'not_allowed') {
      setBanner({ text: T.NOT_ALLOWED });
      onRefreshProfile();
      return;
    }
    setBanner({ text: T.SETTINGS_SAVE_FAILED, retry });
  }

  // Several writes one after the other, each with the version the previous one returned.
  const chain = (steps) => async (version) => {
    let v = version;
    let last = { status: 'ok', version };
    for (const step of steps) {
      last = await step(v);
      if (last.status !== 'ok') return last;
      v = last.version;
    }
    return last;
  };

  function changeOn(on) {
    save(
      (version) => financeSetReminderOn({ on, expectedVersion: version }),
      on ? T.REMINDER_ON_TOAST : T.REMINDER_OFF_TOAST,
      (version) => financeSetReminderOn({ on: !on, expectedVersion: version }),
    );
  }

  function changeTime(school, weekday, value) {
    const before = timeOf(school, weekday);
    const time = value === OFF_VALUE ? null : value;
    save(
      (version) => financeSetReminderTime({ locationCode: school, weekday, time, expectedVersion: version }),
      T.timeSavedToast(T.WEEKDAYS[weekday - 1], LOCATION_NAME[school]),
      (version) => financeSetReminderTime({ locationCode: school, weekday, time: before, expectedVersion: version }),
    );
  }

  function copyMonday() {
    // PC / tablet: both schools (finance_copy_monday). Phone: ONLY the school shown (D9) — four
    // single-time saves (Tue, Wed, Thu, Fri), each with the version the previous one returned.
    const schools = isPhone ? [phoneSchool] : SCHOOL_CODES;
    // Undo puts back every Tue–Fri time that was copied over, as it was before the copy.
    const before = schools.flatMap((school) => [2, 3, 4, 5].map((weekday) => ({ school, weekday, time: timeOf(school, weekday) })));
    const monday = timeOf(phoneSchool, 1);
    save(
      isPhone
        ? chain([2, 3, 4, 5].map((weekday) => (version) => financeSetReminderTime({ locationCode: phoneSchool, weekday, time: monday, expectedVersion: version })))
        : (version) => financeCopyMonday({ expectedVersion: version }),
      T.COPIED_TOAST,
      chain(before.map((b) => (version) => financeSetReminderTime({ locationCode: b.school, weekday: b.weekday, time: b.time, expectedVersion: version }))),
    );
  }

  if (live.status === 'loading') {
    return (
      <div className="fin-skeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING}</span>
      </div>
    );
  }
  if (!data) return <ErrorBanner text={T.LOAD_SETTINGS_FAILED} onRetry={() => live.reload()} />;

  const on = Boolean(data.reminder_on);
  const select = (school, weekday) => (
    <select
      className={`input fin-select${on ? '' : ' is-off'}`}
      aria-label={T.timeFor(T.WEEKDAYS[weekday - 1], LOCATION_NAME[school])}
      value={timeOf(school, weekday) ?? OFF_VALUE}
      disabled={!on}
      aria-disabled={busy ? 'true' : undefined}
      onChange={(event) => {
        if (!busy) changeTime(school, weekday, event.target.value);
      }}
    >
      <option value={OFF_VALUE}>{T.OFF}</option>
      {REMINDER_TIMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fin-settings">
      {banner && <ErrorBanner text={banner.text} onRetry={banner.retry ?? undefined} retrying={busy} onDismiss={() => setBanner(null)} />}
      <h2 className="fin-section-title">{T.REMINDER_TITLE}</h2>
      <p className="fin-hint fin-settings-hint">{T.REMINDER_HINT}</p>

      {/* On / Off: a switch (role="switch" tells screen readers it is on or off). */}
      <button
        type="button"
        role="switch"
        aria-checked={on ? 'true' : 'false'}
        aria-label={T.REMINDER_SWITCH}
        className="fin-switch"
        onClick={() => {
          if (!busy) changeOn(!on);
        }}
      >
        <span className="fin-switch-track" aria-hidden="true" />
        <span>{on ? T.ON : T.OFF}</span>
      </button>

      {isPhone ? (
        <>
          <span id={`${id}-school`} className="visually-hidden">
            {T.SCHOOL_SWITCH}
          </span>
          <div className="fin-seg">
            <ChoiceGroup
              labelId={`${id}-school`}
              value={phoneSchool}
              onChange={setPhoneSchool}
              options={SCHOOL_CODES.map((code) => ({ key: code, label: LOCATION_NAME[code] }))}
            />
          </div>
          <div className="fin-set-list">
            {T.WEEKDAYS.map((name, index) => (
              <div key={name} className="fin-set-row">
                <span>{name}</span>
                {select(phoneSchool, index + 1)}
              </div>
            ))}
          </div>
        </>
      ) : (
        <table className="fin-table fin-set-table">
          <thead>
            <tr>
              <th>{T.COL_DAY}</th>
              {SCHOOL_CODES.map((code) => (
                <th key={code}>{LOCATION_NAME[code]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {T.WEEKDAYS.map((name, index) => (
              <tr key={name}>
                <td>{name}</td>
                {SCHOOL_CODES.map((code) => (
                  <td key={code}>{select(code, index + 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="fin-set-copy">
        <button
          type="button"
          className="btn"
          aria-disabled={!on || busy ? 'true' : undefined}
          onClick={() => {
            if (on && !busy) copyMonday();
          }}
        >
          {T.COPY_MONDAY}
        </button>
      </div>
      <p className="fin-hint fin-settings-foot">{T.SETTINGS_FOOT}</p>
    </div>
  );
}
