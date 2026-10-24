// GradingTab.jsx — the Grading tab of a Black Belt cycle's page (#testing/black-belt/cycle/<id>/grading;
// contract 0025 §14.2; approved mockups G01–G08, proposals G 1–36, rulebook v0.938–v0.947).
// Why it exists: on each testing day graders enter every candidate's grades — letters for graded
// subjects, the NUMBER measured for measured ones (the database works the grade out), extra-points
// counts — at the mat, at the outdoor station or at the desk from paper sheets, on a PC, a tablet
// held sideways or upright, or a phone. Copied in pattern from Star's Grading tab
// (src/screens/testing/star/grading/GradingTab.jsx, v0.512).
//
// Top to bottom:
//   the day switch (G 1): one choice per testing day ("Today · Sat, Apr 3 / Physical"), then Other
//     requirements and Extra points ("Any day"); gray selected side (it only changes the view);
//     phones and 320px: a Day dropdown instead. It opens on today's testing day, else the next one
//     with the gray "No testing today. Showing the next testing day.", after the last day the last
//     one (G 28) — `today` comes from the database. Results' "Open grades" opens a given Dan and day.
//   "Showing Worcester candidates only · Show both schools" on a one-school device (G 29)
//   the Dan switch with counts ("1st Dan 5 · 2nd Dan 3 …", an amber ⚠ on a Dan with Not saved
//     cells) and "Print grading sheet" on its right (phones: under it; hidden on an empty Dan)
//   the save engine's banner (Retry + ✕) and the never-retried answers' banner (✕ only)
//   Other requirements: "Hand-in work was due Sat, May 29. Empty hand-in cells show Late." (G 16);
//   Extra points: "Extra point numbers are still to be confirmed with Master Jeong." (G 20)
//   PC and tablets: the grid (GradeGrid.jsx). Phones (< 640px): ◀ [picker ▾] ▶ and the card
//     (GradeCard.jsx), in the grid's order (own candidates, then make-ups).
//   an empty Dan: one gray line, no grid (G 29)
// Staff see exactly the admin view except the "Choose subjects" link (G 31). No date of birth,
// email or money is ever on this tab (the database never sends them, contract §9).
// The data and the save engine belong to the cycle page (useBbGrading.js), so switching tabs never
// loses Not saved cells; this file only DRAWS and keeps the day / Dan / phone choices.
//
// Breakpoints (useMediaQuery.js, the rest of the dashboard's):
//   phone   < 640px                    → one candidate at a time
//   ≥ 1024px with touch / with a mouse → 'touch' / 'pc' grid (Total and Result at the right end)
//   640–1023px (an upright tablet)     → 'narrow' grid: Total and Result under the name (G 9)
//
// Props:
//   cycle        the cycle page's cycle (name)      grading   useBbGrading()'s answer
//   isAdmin, location, onLocationChange, screenLocked, onNoAccess
//   focus        { dan, dayKey, candidateId, key } from Results' "Open grades" — that Dan and day are
//                chosen once, and that candidate's row is marked (Star's mark: gray tint + dark bar,
//                scrolled into view; phones: the picker set to that candidate — R 17)
//   onModalChange(open)   a dialog (Choose subjects) or the picker sheet is open
//   panelId, tabId
import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconChevronDown, IconChevronLeft, IconChevronRight, IconInfoCircle, IconPrinter } from '@tabler/icons-react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../../lib/device.js';
import { NARROW_PHONE_QUERY, PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../lib/useMediaQuery.js';
import { RUBRIC_DANS } from '../../../lib/blackBelt/rubric.js';
import { danLabel as danLabelOf } from '../../../lib/blackBelt/resultEmail.js';
import ChoiceGroup from '../../../screens/testing/events/ChoiceGroup.jsx';
import SelectField from '../parts/SelectField.jsx';
import { placeText, shortDate, timeRange, weekdayMonthDay } from '../text.js';
import GradeCard from './GradeCard.jsx';
import GradeGrid from './GradeGrid.jsx';
import GradingSheet from './GradingSheet.jsx';
import MakeupSubjectsDialog from './MakeupSubjectsDialog.jsx';
import PickerSheet from './PickerSheet.jsx';
import { columnsFor, dayChoices, groupWords, openingChoice, partName, rowName, unitOf } from './model.js';
import * as T from './text.js';
import './grading.css';

// The Dan and the day chosen, per cycle, while the app is open (switching tabs keeps them).
const danByCycle = new Map();
const dayByCycle = new Map(); // { key, auto } — auto: chosen by G 28, not by the person
const pickByCycleDan = new Map(); // the phone's candidate per cycle and Dan
const focusSeen = new Set(); // Results' Open grades already applied

export default function GradingTab({ cycle, grading, isAdmin, location, onLocationChange, screenLocked, onNoAccess, focus = null, onModalChange, panelId, tabId }) {
  const cycleId = cycle.id;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isNarrowPhone = useMediaQuery(NARROW_PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const size = isWide ? (isTouch ? 'touch' : 'pc') : 'narrow';
  const { live, saves } = grading;
  const data = live.data;

  // Opened from Results' "Open grades": that Dan and that day (once per click).
  if (focus && !focusSeen.has(focus.key)) {
    focusSeen.add(focus.key);
    if (focus.dan) danByCycle.set(cycleId, focus.dan);
    if (focus.dayKey) dayByCycle.set(cycleId, { key: focus.dayKey, auto: false });
    if (focus.dan && focus.candidateId) pickByCycleDan.set(`${cycleId}|${focus.dan}`, focus.candidateId);
  }
  const [danSel, setDanState] = useState(() => danByCycle.get(cycleId) ?? null);
  const [daySel, setDayState] = useState(() => dayByCycle.get(cycleId) ?? null);
  const [pick, setPickState] = useState(() => {
    const d = danByCycle.get(cycleId);
    return d ? pickByCycleDan.get(`${cycleId}|${d}`) ?? null : null;
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [choose, setChoose] = useState(null); // { row, opener }
  const [printing, setPrinting] = useState(null); // GradingSheet's props + opener
  const dayLabelId = `${panelId}-day`;
  const danLabelId = `${panelId}-dan`;

  // ----- What shows -----
  const schoolCode = location === 'Both' ? null : LOCATION_CODE[location] ?? null;
  const oneSchool = schoolCode !== null;
  const schoolLabel = oneSchool ? LOCATION_NAME[schoolCode] ?? location : null;
  const inSchool = (row) => !oneSchool || row.locationCode === schoolCode;
  const countOf = (dan) => (data?.danCounts ?? []).filter((x) => x.dan === dan && (!oneSchool || x.locationCode === schoolCode)).reduce((n, x) => n + x.count, 0);
  // The Dan: the one chosen, else the first with candidates (this school), else 1st Dan.
  const dan = danSel ?? (data ? RUBRIC_DANS.find((d) => countOf(d) > 0) ?? 1 : 1);
  const rubric = data?.rubrics?.[dan] ?? null;
  const today = data?.today ?? null;
  const submissionsDue = data?.cycle?.submissionsDue ?? null;
  const choices = data ? dayChoices(data.cycle, rubric, today) : [];
  const opening = data ? openingChoice(choices, today) : null;
  const chosen = daySel && choices.some((c) => c.key === daySel.key) ? daySel : opening ? { key: opening.key, auto: true } : null;
  const choice = choices.find((c) => c.key === chosen?.key) ?? null;
  const noTestingToday = Boolean(chosen?.auto && opening?.noTestingToday && chosen.key === opening.key);
  const danRowsAll = (data?.rows ?? []).filter((r) => r.dan === dan);
  const rows = danRowsAll.filter(inSchool);
  const columns = columnsFor(choice, rubric);
  const danName = danLabelOf(dan);
  const ctx = { saves, isAdmin, rubric, submissionsDue };
  const warnDans = new Set(saves.unsaved.dans);

  function setDan(next) {
    danByCycle.set(cycleId, next);
    setDanState(next);
    setPickState(pickByCycleDan.get(`${cycleId}|${next}`) ?? null);
  }
  function setDay(key) {
    const next = { key, auto: false };
    dayByCycle.set(cycleId, next);
    setDayState(next);
  }
  function setPick(rowId) {
    pickByCycleDan.set(`${cycleId}|${dan}`, rowId);
    setPickState(rowId);
  }

  // A dialog or the picker sheet makes the page behind it inert (App.jsx, through the cycle page).
  const modalOpen = (choose !== null || sheetOpen) && !screenLocked;
  useEffect(() => {
    onModalChange?.(modalOpen);
  }, [modalOpen, onModalChange]);
  useEffect(() => () => onModalChange?.(false), [onModalChange]);

  // ----- Print grading sheet (G 33–G 35): draw the sheet, print, remove it again -----
  // Never while the lock screen shows (security review): the sheet goes and nothing prints.
  useEffect(() => {
    if (screenLocked && printing) setPrinting(null);
  }, [screenLocked, printing]);
  useEffect(() => {
    if (!printing || screenLocked) return undefined;
    const done = () => {
      const opener = printing.opener;
      setPrinting(null);
      window.requestAnimationFrame(() => (opener?.isConnected ? opener : document.querySelector('.bbg-print'))?.focus());
    };
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing, screenLocked]);

  function printSheet(opener) {
    if (!choice || !data || screenLocked) return;
    const what = choice.kind === 'day' ? choice.what : choice.kind === 'other' ? partName(rubric, 'other') : T.EXTRA_POINTS;
    let when;
    if (choice.kind === 'day') {
      const d = choice.day;
      when = T.sheetWhenLine([
        shortDate(d.date), timeRange(d.start, d.end), placeText(d.place),
        d.second ? T.secondPartWords(timeRange(d.second.start, d.second.end), placeText(d.second.place)) : null, T.BOTH_SCHOOLS,
      ]);
    } else if (choice.kind === 'other' && submissionsDue) {
      when = T.sheetWhenLine([T.handInDueWords(shortDate(submissionsDue)), T.BOTH_SCHOOLS]);
    } else when = T.BOTH_SCHOOLS;
    // The help line: graded letters, measured numbers, "—", kept.
    const help = [];
    const measured = columns.filter((c) => c.subject?.scoring === 'measured');
    const graded = columns.filter((c) => c.subject && c.subject.scoring !== 'measured');
    if (choice.kind === 'extra') help.push(T.SHEET_EXTRA_HELP);
    if (graded.length > 0) {
      const letters = [...new Set(graded.flatMap((c) => (c.part === 'physical' ? ['A+', 'A', 'B+', 'B', 'C', 'D'] : ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C-', 'D'])))];
      help.push(T.sheetGradesHelp(letters));
    }
    if (measured.length > 0 && graded.length === 0) help.push(T.SHEET_MEASURED_HELP);
    else for (const c of measured) help.push(T.sheetWriteNumber(c.subject.name, unitOf(c.subject.ways?.[0]) || null));
    const minutes = measured.filter((c) => (c.subject.ways ?? []).some((w) => /^min/i.test(String(w.unit ?? ''))));
    if (minutes.length > 0) help.push(T.SHEET_MINUTES_HELP(minutes.map((c) => c.subject.name).join(', ')));
    const printRows = danRowsAll; // both schools (G 33)
    const anyNa = printRows.some((r) => columns.some((c) => c.subject && !(r.result?.subjects ?? []).find((s) => s.id === c.id)?.applies));
    if (anyNa) help.push(T.SHEET_DASH_HELP);
    if (printRows.some((r) => r.isMakeup)) help.push(T.SHEET_KEPT_HELP);
    setPrinting({
      opener,
      title: T.sheetTitle(data.cycle.name, danName, what),
      whenLine: when,
      helpLines: help,
      footWhat: T.sheetFootWhat(data.cycle.name, danName),
      columns,
      rows: printRows,
      rubric,
      printedAt: new Date(),
    });
  }

  // ----- Choose subjects (admins, G 21–G 23) -----
  function closeChoose(changed) {
    const opener = choose?.opener;
    setChoose(null);
    if (changed) grading.reload();
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }
  const onChooseSubjects = isAdmin ? (row, opener) => setChoose({ row, opener }) : undefined;

  // ----- The day switch -----
  let daySwitch = null;
  if (data && choices.length > 0) {
    daySwitch = isPhone ? (
      <div className="bbg-dayfield">
        <span id={dayLabelId} className="field-label">
          {T.DAY_LABEL}
        </span>
        <SelectField
          id={`${panelId}-dayfield`}
          labelId={dayLabelId}
          value={choice?.key ?? null}
          options={choices.map((c) => ({ value: c.key, label: c.kind === 'day' ? T.dayOption(c.top, c.what) : c.what }))}
          onChange={setDay}
        />
      </div>
    ) : (
      <div className="ev-side bbg-days">
        <span id={dayLabelId} className="visually-hidden">
          {T.DAY_SWITCH_LABEL}
        </span>
        <ChoiceGroup
          labelId={dayLabelId}
          value={choice?.key ?? null}
          onChange={setDay}
          options={choices.map((c) => ({
            key: c.key,
            label: `${c.top}, ${c.what}`,
            content: (
              <span className="bbg-day">
                <small>{c.top}</small>
                <span>{c.what}</span>
              </span>
            ),
          }))}
        />
      </div>
    );
  }

  // ----- The Dan switch and Print -----
  const danSwitch = (
    <div className="ev-side bbg-dan-switch">
      <span id={danLabelId} className="visually-hidden">
        {T.DAN_SWITCH_LABEL}
      </span>
      <ChoiceGroup
        labelId={danLabelId}
        value={dan}
        onChange={setDan}
        options={RUBRIC_DANS.map((d) => {
          const count = countOf(d);
          const warn = warnDans.has(d);
          const label = danLabelOf(d);
          return {
            key: d,
            label: T.danChoiceLabel(label, count, warn),
            content: (
              <>
                {T.danWord(label)}
                <span className="bbg-dw">{' '}{T.DAN_WORD}</span>
                {/* ti-alert-triangle = this Dan has grades not saved */}
                {warn && <IconAlertTriangle size={14} aria-hidden="true" className="bbg-dan-warn" />}
                <span className="ev-side-count">{count}</span>
              </>
            ),
          };
        })}
      />
    </div>
  );
  const printButton = rows.length > 0 && choice && (
    <button type="button" className="btn bbg-print" onClick={(event) => printSheet(event.currentTarget)}>
      {/* ti-printer = print */}
      <IconPrinter size={16} aria-hidden="true" />
      {T.PRINT_SHEET}
    </button>
  );

  // ----- Lines under the bar -----
  let underLine = null;
  if (choice?.kind === 'other' && submissionsDue && today && today > submissionsDue && columns.some((c) => c.subject?.handed_in === true)) {
    underLine = T.handInLine(weekdayMonthDay(submissionsDue));
  }
  if (choice?.kind === 'extra' && rubric?.extra_points?.to_confirm === true) underLine = T.TO_CONFIRM_LINE;

  // ----- The body -----
  const pickRef = useRef(null);
  let body;
  if (!data && !saves.online) {
    // Opened while offline: nothing to show yet — say so instead of loading forever.
    body = <ErrorBanner text={T.OFFLINE_NO_GRADES} onRetry={() => grading.reload()} />;
  } else if (!data && live.status === 'error') {
    body = <ErrorBanner text={T.LOAD_GRADES_FAILED} onRetry={() => grading.reload()} />;
  } else if (!data) {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_GRADES}</span>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    const parts = oneSchool ? T.emptyOneSchoolParts(schoolLabel, danName) : null;
    body = (
      <p className="tempty bbg-empty">
        {oneSchool ? (
          <>
            {parts[0]}
            <button type="button" className="link-button bbg-inline-link" onClick={() => onLocationChange('Both')}>
              {parts[1]}
            </button>
            {parts[2]}
          </>
        ) : (
          T.emptyDanBoth(danName)
        )}
      </p>
    );
  } else if (isPhone) {
    // own candidates, then make-ups (G 14) — the grid's order
    const ordered = [...rows.filter((r) => !r.isMakeup), ...rows.filter((r) => r.isMakeup)];
    const index = Math.max(0, ordered.findIndex((r) => r.id === pick));
    const row = ordered[index];
    const focusPicker = () => window.requestAnimationFrame(() => pickRef.current?.focus());
    body = (
      <>
        <div className="bbg-pick">
          <button
            type="button"
            className="btn bbg-pick-nav"
            aria-label={T.PREVIOUS_CANDIDATE}
            aria-disabled={index === 0 ? 'true' : undefined}
            onClick={() => index > 0 && setPick(ordered[index - 1].id)}
          >
            {/* ti-chevron-left = previous candidate */}
            <IconChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            ref={pickRef}
            type="button"
            className="input bbg-pick-sel"
            aria-haspopup="menu"
            aria-expanded={sheetOpen ? 'true' : 'false'}
            aria-label={T.pickerLabel(rowName(row))}
            onClick={() => setSheetOpen(true)}
          >
            {/* 320px: the age group on its own line; only the name is ever shortened (G 10) */}
            {isNarrowPhone ? (
              <span className="bbg-pick-two">
                <span className="bbg-pick-name">{rowName(row)}</span>
                <small>{groupWords(saves.resultFor(row))}</small>
              </span>
            ) : (
              <span className="bbg-pick-name">{T.pickerText(rowName(row), groupWords(saves.resultFor(row)))}</span>
            )}
            {/* ti-chevron-down = open the list */}
            <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />
          </button>
          <button
            type="button"
            className="btn bbg-pick-nav"
            aria-label={T.NEXT_CANDIDATE}
            aria-disabled={index === ordered.length - 1 ? 'true' : undefined}
            onClick={() => index < ordered.length - 1 && setPick(ordered[index + 1].id)}
          >
            {/* ti-chevron-right = next candidate */}
            <IconChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <GradeCard key={`${row.id}|${choice?.key}`} row={row} columns={columns} kind={choice?.kind} ctx={ctx} sheetLists={isNarrowPhone} onChooseSubjects={onChooseSubjects} />
        {sheetOpen && !screenLocked && (
          <PickerSheet
            title={T.pickerTitle(danName, ordered.length)}
            sub={T.PICKER_SUB}
            rows={ordered}
            currentId={row.id}
            ctx={ctx}
            onPick={(id) => {
              setPick(id);
              setSheetOpen(false);
              focusPicker();
            }}
            onClose={() => {
              setSheetOpen(false);
              focusPicker();
            }}
          />
        )}
      </>
    );
  } else {
    const bands = choice && choice.kind === 'day' && choice.parts.length > 1
      ? choice.parts.map((code) => ({ name: partName(rubric, code), span: columns.filter((c) => c.part === code).length })).filter((b) => b.span > 0)
      : null;
    body = (
      <GradeGrid
        key={`${dan}|${choice?.key}`}
        rows={rows}
        columns={columns}
        kind={choice?.kind}
        bands={bands}
        ctx={ctx}
        size={size}
        typing={!isTouch}
        isTouch={isTouch}
        danLabel={danName}
        dayWords={choice ? (choice.kind === 'day' ? `${choice.top}, ${choice.what}` : choice.what) : ''}
        onChooseSubjects={onChooseSubjects}
        markedId={focus?.candidateId && focus.dan === dan ? focus.candidateId : null}
        markKey={focus?.key ?? null}
      />
    );
  }

  const chooseRow = choose ? (data?.rows ?? []).find((r) => r.id === choose.row.id) ?? choose.row : null;

  return (
    <>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel bbg-panel">
        {daySwitch}
        {noTestingToday && (
          <p className="bbg-grayline">
            {/* ti-info-circle = information */}
            <IconInfoCircle size={14} aria-hidden="true" />
            {T.NO_TESTING_TODAY}
          </p>
        )}
        {oneSchool && (
          <p className="ev-filter-line bbg-school-line">
            {T.oneSchoolLine(schoolLabel)} ·{' '}
            <button type="button" className="link-button bbg-inline-link" onClick={() => onLocationChange('Both')}>
              {T.SHOW_BOTH_SCHOOLS}
            </button>
          </p>
        )}
        {data && (
          <div className={`bbg-bar${isPhone ? ' bbg-bar--phone' : ''}`}>
            {danSwitch}
            {printButton}
          </div>
        )}
        {saves.banner && <ErrorBanner text={saves.banner.text} onRetry={saves.retryAll} onDismiss={saves.dismissBanner} />}
        {grading.pageBanner && <ErrorBanner text={grading.pageBanner} onDismiss={grading.dismissPageBanner} />}
        {underLine && rows.length > 0 && <p className="bbg-grayline">{underLine}</p>}
        {body}
        <p className="visually-hidden" aria-live="polite">
          {saves.announcement}
        </p>
      </div>
      {choose && chooseRow && !screenLocked && (
        <MakeupSubjectsDialog
          candidate={{ id: chooseRow.id, firstName: chooseRow.firstName, lastName: chooseRow.lastName }}
          result={saves.resultFor(chooseRow)}
          rubric={data?.rubrics?.[chooseRow.dan] ?? rubric}
          isAdmin={isAdmin}
          isPhone={isPhone}
          onClose={closeChoose}
          onNoAccess={onNoAccess}
        />
      )}
      {printing && !screenLocked && <GradingSheet {...printing} />}
    </>
  );
}
