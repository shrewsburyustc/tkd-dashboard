// GradingTab.jsx — the Grading tab of a Star testing event's page (#testing/star/event/<id>/grading,
// build phase 5).
// Why it exists: on the testing day graders enter every candidate's grades at the mat (PC, a tablet
// held sideways or upright, a phone) and the desk types in paper sheets. Approved: Grading mockups
// screens 1–6, 8–10 (v0.124–v0.130, v0.137; screen 7 "results final" is gone, v0.139) and the Phase 5
// gap mockups H1, H2, H6, H7 (v0.512, "Proposals to confirm (31)").
//
// Top to bottom:
//   the page header and tabs (StarEventPage's renderHeader)
//   one banner (proposals 3, 6, 10–12): the save engine's "Couldn't save 3 grades …" / "You're
//     offline …" with Retry and ✕, or an answer that is never retried ("That grade was kept …",
//     "Jordan Kim was moved to 2nd Dan …") with ✕ only
//   "Showing Worcester candidates only · Show both schools" on a one-school device (proposal 22,
//     the Candidates tab's line, v0.508) — the Dan counts are that school's
//   the Dan switch "1st Dan 7 · 2nd Dan 2 · 3rd Dan 1" (an amber ⚠ on a Dan with Not saved cells,
//     proposal 5; below 360px the word "Dan" goes, screen readers still hear it, proposal 24) and
//     "Print grading sheet" on its right (proposal 13; phones: under it; hidden on an empty Dan)
//   PC and tablets: the grid (GradeGrid.jsx). Phones (< 640px): one candidate at a time — ◀, the
//     picker "Mia Patel · 0 → 1 ▾" (opens PickerSheet.jsx), ▶ — and the card (GradeCard.jsx).
//   an empty Dan: one gray line, no grid (proposal 27, screen 10)
// Private candidates are never here (v0.151, v0.153): gradingApi.loadGrading leaves them out.
// Hide private details (v0.506, H7): nothing here changes — the grid shows no date of birth, email
// or payment at all.
// Where the breakpoints come from (useMediaQuery.js, the rest of the dashboard's):
//   phone   width < 640px (PHONE_QUERY)                      → one candidate at a time
//   wide    width ≥ 1024px (WIDE_QUERY) + touch (pointer: coarse) → 'touch' grid (44px tall cells)
//   wide    width ≥ 1024px with a mouse                       → 'pc' grid (36px cells, typed grades)
//   640–1023px (an upright tablet ~820px, a narrow window)   → 'narrow' grid: the full grid,
//           squeezed (~32px grade cells — Q3 = B, a named exception to the 44px rule)
// This file only DRAWS and keeps the Dan / phone choice; the data and the save engine belong to
// StarEventPage (so switching to Candidates never loses Not saved cells, proposal 8).
//
// Props:
//   event, copy           the event and its rubric copy (subjects, credits, letters)
//   grading               { status: 'loading'|'ready'|'error', data: loadGrading's answer | null }
//   saves                 the page's useStarGradingSaves()
//   isAdmin, location, onLocationChange
//   panelId, tabId, renderHeader(addButton)
//   onAddCandidate(opener)   "Add candidate" in the header: opens the Candidates tab's add menu
//   onPrint({ dan, danLabel, opener })   Print grading sheet (Builder C wires the printout)
//   mark                  phase 6: { id, dan, key } from Results' Open grades (proposal 29) — that Dan
//                         is selected and that row marked (gray tint + dark bar, scrolled into view);
//                         on a phone the picker is set to that candidate. null = nothing marked.
//   pageBanner, onDismissPageBanner   the never-retried answers' banner text (✕ only)
//   onRetryLoad()         Retry when the grades couldn't be read
//   onGradingChanged()    after Choose subjects saved: reload
//   screenLocked, onNoAccess, onModalOpenChange(open)
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChevronDown, IconChevronLeft, IconChevronRight, IconPlus, IconPrinter } from '@tabler/icons-react';
import ErrorBanner from '../../../../components/ErrorBanner.jsx';
import { LOCATION_CODE, LOCATION_NAME } from '../../../../lib/device.js';
import { gradeLetters, judgedSubjects } from '../../../../lib/star/gradingApi.js';
import { PHONE_QUERY, TOUCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery.js';
import ChoiceGroup from '../../../../components/ChoiceGroup.jsx';
import { ADD_CANDIDATE } from '../candidates/text.js';
import GradeCard from './GradeCard.jsx';
import GradeGrid from './GradeGrid.jsx';
import MakeupChoiceDialog from './MakeupChoiceDialog.jsx';
import PickerSheet from './PickerSheet.jsx';
import * as T from './text.js';
import './grading.css';

// The Dan chosen on Grading, per event, while the app is open (switching tabs keeps it).
const danByEvent = new Map();
// The phone's candidate per event and Dan.
const pickByEventDan = new Map();
// Results' Open grades marks already applied (each mark selects its Dan and candidate once).
const markSeen = new Set();

export default function GradingTab({
  event,
  copy,
  grading,
  saves,
  isAdmin,
  location,
  onLocationChange,
  panelId,
  tabId,
  renderHeader,
  onAddCandidate,
  onPrint,
  mark = null,
  pageBanner,
  onDismissPageBanner,
  onRetryLoad,
  onGradingChanged,
  screenLocked,
  onNoAccess,
  onModalOpenChange,
}) {
  const eventId = event.id;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTouch = useMediaQuery(TOUCH_QUERY);
  const isWide = useMediaQuery(WIDE_QUERY);
  const size = isWide ? (isTouch ? 'touch' : 'pc') : 'narrow';

  const dans = copy?.dans ?? [];
  const letters = gradeLetters(copy);
  // Opened from Results' Open grades (phase 6, proposal 29): start on that Dan and that candidate.
  if (mark && !markSeen.has(mark.key)) {
    markSeen.add(mark.key);
    danByEvent.set(eventId, mark.dan);
    pickByEventDan.set(`${eventId}|${mark.dan}`, mark.id);
  }
  const [danSel, setDanSelState] = useState(() => danByEvent.get(eventId) ?? dans[0]?.dan ?? 1);
  const [pick, setPickState] = useState(() => pickByEventDan.get(`${eventId}|${danSel}`) ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [choose, setChoose] = useState(null); // { row, opener } — Choose subjects (admins)

  function setDan(dan) {
    danByEvent.set(eventId, dan);
    setDanSelState(dan);
    setPickState(pickByEventDan.get(`${eventId}|${dan}`) ?? null);
  }
  function setPick(rowId) {
    pickByEventDan.set(`${eventId}|${danSel}`, rowId);
    setPickState(rowId);
  }

  // Results' Open grades (phase 6, proposal 29): scroll the marked row into view once the grid has
  // drawn it.
  const markKey = mark?.key ?? null;
  const markDrawn = Boolean(mark && grading.data);
  useEffect(() => {
    if (!markDrawn) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-grade-row="${mark.id}"]`)?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
    // (once per mark, when the grid is there)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markKey, markDrawn]);

  // The dialog makes the page behind it inert (App.jsx).
  const dialogOpen = choose !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(dialogOpen);
  }, [dialogOpen, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // ----- What shows -----
  const schoolCode = location === 'Both' ? null : LOCATION_CODE[location];
  const oneSchool = schoolCode !== null && schoolCode !== undefined;
  const inSchool = (row) => !oneSchool || row.locationCode === schoolCode;
  const data = grading.data;
  const rowsOf = (dan) => (data?.dans?.[dan]?.rows ?? []).filter(inSchool);
  const danCopy = dans.find((d) => d.dan === danSel) ?? dans[0] ?? null;
  const danLabel = danCopy?.label ?? '';
  const rows = rowsOf(danSel);
  const subjects = judgedSubjects(copy, danSel);
  const maxScore = data?.dans?.[danSel]?.maxScore ?? null;
  const warnDans = new Set(saves.unsaved.dans);
  const schoolLabel = oneSchool ? LOCATION_NAME[schoolCode] ?? location : null;

  // ----- Header button: Add candidate (the Candidates tab's add menu) -----
  const addButton = (
    <button type="button" className="btn btn-primary" aria-haspopup="menu" onClick={(clickEvent) => onAddCandidate(clickEvent.currentTarget)}>
      {/* ti-plus = add new */}
      <IconPlus size={16} aria-hidden="true" />
      {ADD_CANDIDATE}
    </button>
  );

  // ----- Choose subjects (admins, v0.130) -----
  function openChoose(row, opener) {
    setChoose({ row, opener });
  }
  function closeChoose(changed) {
    const opener = choose?.opener;
    setChoose(null);
    if (changed) onGradingChanged();
    let tries = 0;
    const tryFocus = () => {
      if (!opener?.isConnected) return;
      if (opener.closest('[inert]') && tries++ < 30) window.requestAnimationFrame(tryFocus);
      else opener.focus();
    };
    window.requestAnimationFrame(tryFocus);
  }

  // ----- The Dan switch -----
  const danLabelId = `${panelId}-dan`;
  const danSwitch = (
    <div className="ev-side stg-dan-switch">
      <span id={danLabelId} className="visually-hidden">
        {T.DAN_SWITCH_LABEL}
      </span>
      <ChoiceGroup
        labelId={danLabelId}
        value={danSel}
        onChange={setDan}
        options={dans.map((d) => {
          const count = rowsOf(d.dan).length;
          const warn = warnDans.has(d.dan);
          return {
            key: d.dan,
            label: T.danChoiceLabel(d.label, count, warn),
            content: (
              <>
                {T.danWord(d.label)}
                <span className="stg-dw">{' '}{T.DAN_WORD}</span>
                {/* ti-alert-triangle = this Dan has grades not saved (proposal 5) */}
                {warn && <IconAlertTriangle size={14} aria-hidden="true" className="stg-dan-warn" />}
                <span className="ev-side-count">{count}</span>
              </>
            ),
          };
        })}
      />
    </div>
  );
  const printButton = rows.length > 0 && onPrint && (
    <button type="button" className="btn stg-print" onClick={(clickEvent) => onPrint({ dan: danSel, danLabel, opener: clickEvent.currentTarget })}>
      {/* ti-printer = print */}
      <IconPrinter size={16} aria-hidden="true" />
      {T.PRINT_SHEET}
    </button>
  );

  // ----- The body: loading, couldn't load, empty Dan, the grid or the phone card -----
  let body;
  if (!data && grading.status === 'error') {
    body = <ErrorBanner text={T.LOAD_GRADES_FAILED} onRetry={onRetryLoad} />;
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
    body = <p className="tempty stg-empty">{oneSchool ? T.emptyDanOneSchool(schoolLabel, danLabel) : T.emptyDanBoth(danLabel)}</p>;
  } else if (isPhone) {
    const index = Math.max(0, rows.findIndex((r) => r.id === pick));
    const row = rows[index];
    body = (
      <>
        <div className="stg-pick">
          <button
            type="button"
            className="btn stg-pick-nav"
            aria-label={T.PREVIOUS_CANDIDATE}
            aria-disabled={index === 0 ? 'true' : undefined}
            onClick={() => index > 0 && setPick(rows[index - 1].id)}
          >
            {/* ti-chevron-left = previous candidate */}
            <IconChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="input stg-pick-sel" aria-haspopup="menu" aria-expanded={sheetOpen ? 'true' : 'false'} aria-label={T.pickerLabel(row)} onClick={() => setSheetOpen(true)}>
            <span className="stg-pick-name">{T.pickerText(row)}</span>
            {/* ti-chevron-down = open the list */}
            <IconChevronDown size={16} aria-hidden="true" className="fa-chevron" />
          </button>
          <button
            type="button"
            className="btn stg-pick-nav"
            aria-label={T.NEXT_CANDIDATE}
            aria-disabled={index === rows.length - 1 ? 'true' : undefined}
            onClick={() => index < rows.length - 1 && setPick(rows[index + 1].id)}
          >
            {/* ti-chevron-right = next candidate */}
            <IconChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <GradeCard
          key={row.id}
          row={row}
          subjects={subjects}
          letters={letters}
          saves={saves}
          isAdmin={isAdmin}
          onChooseSubjects={isAdmin ? openChoose : undefined}
        />
        {sheetOpen && !screenLocked && (
          <PickerSheet
            title={T.pickerTitle(danLabel, rows.length)}
            sub={T.PICKER_SUB}
            rows={rows}
            currentId={row.id}
            saves={saves}
            isAdmin={isAdmin}
            onPick={(id) => {
              setPick(id);
              setSheetOpen(false);
              window.requestAnimationFrame(() => document.querySelector('.stg-pick-sel')?.focus());
            }}
            onClose={() => {
              setSheetOpen(false);
              window.requestAnimationFrame(() => document.querySelector('.stg-pick-sel')?.focus());
            }}
          />
        )}
      </>
    );
  } else {
    body = (
      <GradeGrid
        key={danSel}
        rows={rows}
        subjects={subjects}
        letters={letters}
        maxScore={maxScore}
        danLabel={danLabel}
        saves={saves}
        isAdmin={isAdmin}
        size={size}
        typing={!isTouch}
        onChooseSubjects={isAdmin ? openChoose : undefined}
        markedId={mark?.dan === danSel ? mark.id : null}
      />
    );
  }

  const chooseRow = choose ? [...Object.values(data?.dans ?? {})].flatMap((d) => d.rows).find((r) => r.id === choose.row.id) ?? choose.row : null;

  return (
    <>
      {renderHeader(addButton)}
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel stg-panel">
        {/* The save engine's banner (Retry + ✕) and an answer that is never retried (✕ only). Both
            show only in the rare case that both happen at once. */}
        {saves.banner && <ErrorBanner text={saves.banner.text} onRetry={saves.retryAll} onDismiss={saves.dismissBanner} />}
        {pageBanner && <ErrorBanner text={pageBanner} onDismiss={onDismissPageBanner} />}
        {oneSchool && (
          <p className="ev-filter-line st-school-line">
            {T.oneSchoolLine(schoolLabel)} ·{' '}
            <button type="button" className="link-button st-inline-link" onClick={() => onLocationChange('Both')}>
              {T.SHOW_BOTH_SCHOOLS}
            </button>
          </p>
        )}
        <div className={`stg-bar${isPhone ? ' stg-bar--phone' : ''}`}>
          {danSwitch}
          {printButton}
        </div>
        {body}
      </div>
      {choose && !screenLocked && (
        <MakeupChoiceDialog
          row={chooseRow}
          result={saves.resultFor(chooseRow)}
          letters={letters}
          isPhone={isPhone}
          onClose={closeChoose}
          onNoAccess={onNoAccess}
        />
      )}
    </>
  );
}
