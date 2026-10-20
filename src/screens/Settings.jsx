// Settings.jsx — the Settings page (admins only; account menu → Admin → Settings, ti-settings).
// Why it exists: rulebook v0.135 — school street addresses are entered by admins in the
// dashboard. Phase 2 has one part, **Schools**: each school's street, city, state and ZIP (and,
// since migration 0019, an optional phone for the closed sign-up form — F3 difference 4),
// edited in a small dialog (SchoolDialog.jsx), logged by the database. Approved mockups:
// docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html (S1–S3). Later parts of Settings
// (e.g. keyboard shortcuts on/off) are separate decisions.
//
// What's on the page:
//   - title "Settings" + "Details for the whole school. Admins only."
//   - "Schools" with its gray line, then one row per school: name · address (or, with no address,
//     the amber line "No address yet…" with the warning triangle — contract 0005 §6) · Edit pencil.
//     Clicking the row or the pencil opens the dialog.
//   - loading: gray placeholder rows; couldn't load: amber banner + Retry (rules 3.4, 3.5);
//     not an admin: "Only admins can see Settings." (the database refuses the save anyway)
//   - the location switcher does NOT filter this page: both schools are always listed.
//
// Props (from App.jsx): profile, screenLocked, showToast, onModalOpenChange, onRefreshProfile,
// onNoAccess (the database refused data because this sign-in is locked: lock the screen).
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconEdit } from '@tabler/icons-react';
import ErrorBanner from '../components/ErrorBanner.jsx';
import IconButton from '../components/IconButton.jsx';
import { loadSchools, updateSchoolContact } from '../lib/settings/schoolsApi.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useRowArrowNav } from '../lib/useRowArrowNav.js';
import SchoolDialog, { checkSchoolForm, isSchoolFormDirty } from './settings/SchoolDialog.jsx';
import * as T from './settings/text.js';
import '../styles/settings.css';

const BLOCKING_NOTES = ['STALE', 'NOT_ALLOWED'];

export default function Settings({ profile, screenLocked, showToast, onModalOpenChange, onRefreshProfile, onNoAccess }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isAdmin = profile.role === 'admin';
  const [load, setLoad] = useState({ state: 'loading', schools: [] }); // loading | ok | error
  const [retrying, setRetrying] = useState(false);
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(dialog);
  useEffect(() => {
    dialogRef.current = dialog;
  });
  const focusAfterRef = useRef(null); // school code whose row gets focus after the dialog closes

  const fetchList = useCallback(async () => {
    const result = await loadSchools();
    if (result.status === 'ok') setLoad({ state: 'ok', schools: result.schools });
    else if (result.status === 'no_access') onNoAccess?.();
    else setLoad((current) => ({ state: current.schools.length > 0 ? 'ok' : 'error', schools: current.schools, failed: true }));
    return result.status;
  }, [onNoAccess]);

  // Load when the page opens and again after unlocking (nothing is requested while locked).
  useEffect(() => {
    if (!screenLocked && isAdmin) fetchList();
  }, [screenLocked, isAdmin, fetchList]);

  // The App makes the page behind inert while the dialog shows. While locked the dialog is only
  // hidden (it comes back with what was typed).
  const modalShown = dialog !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(modalShown);
  }, [modalShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // After the dialog closes: focus back on that school's row.
  useEffect(() => {
    if (dialog !== null || screenLocked || focusAfterRef.current === null) return;
    const code = focusAfterRef.current;
    focusAfterRef.current = null;
    window.requestAnimationFrame(() => document.querySelector(`[data-nav-row="${code}"]`)?.focus());
  }, [dialog, screenLocked]);

  async function retry() {
    setRetrying(true);
    await fetchList();
    setRetrying(false);
  }

  function openDialog(school) {
    const a = school.address;
    const values = { street: a?.street ?? '', city: a?.city ?? '', state: a?.state ?? '', zip: a?.zip ?? '', phone: school.phone ?? '' };
    setDialog({ key: Date.now(), code: school.code, school, values, initial: values, touched: {}, triedSave: false, note: null, blocked: false, saving: false });
  }
  function patchDialog(patch) {
    setDialog((current) => (current ? { ...current, ...patch } : current));
  }
  function closeDialog() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    focusAfterRef.current = d.code;
    onModalOpenChange(false); // same screen update, so the row can take focus
    setDialog(null);
  }
  function requestClose() {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    if (!isSchoolFormDirty(d)) closeDialog();
    else if (!BLOCKING_NOTES.includes(d.note)) patchDialog({ note: 'UNSAVED' });
  }

  async function save(canSave) {
    const d = dialogRef.current;
    if (!d || d.saving) return;
    const check = checkSchoolForm(d);
    if (!canSave || !check.canSave) {
      patchDialog({ triedSave: true });
      return;
    }
    if (check.sameAsSaved) {
      closeDialog();
      return;
    }
    patchDialog({ saving: true, note: null });
    const p = check.payload;
    const result = await updateSchoolContact({ code: d.code, expectedVersion: d.school.version, ...p });
    if (result.status === 'ok') {
      patchDialog({ saving: false });
      focusAfterRef.current = d.code;
      onModalOpenChange(false);
      setDialog(null);
      showToast(T.TOAST_SAVED, { icon: false });
      fetchList();
    } else if (result.status === 'no_access') {
      patchDialog({ saving: false });
      onNoAccess?.();
    } else if (result.status === 'not_allowed') {
      patchDialog({ saving: false, note: 'NOT_ALLOWED', blocked: true });
      onRefreshProfile?.();
    } else if (result.status === 'stale' || result.status === 'not_found') {
      patchDialog({ saving: false, note: 'STALE', blocked: true });
      fetchList();
    } else if (result.status === 'invalid') {
      patchDialog({ saving: false, note: 'INVALID' });
    } else {
      patchDialog({ saving: false, note: 'SAVE_FAILED' });
    }
  }

  const schools = load.schools;
  const nav = useRowArrowNav({
    rowKeys: schools.map((s) => s.code),
    onOpen: (code) => {
      const school = schools.find((s) => s.code === code);
      if (school) openDialog(school);
    },
  });

  let body;
  if (!isAdmin) {
    body = <p className="st-empty">{T.ONLY_ADMINS}</p>;
  } else if (load.state === 'loading') {
    body = (
      <div className="clist st-list tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING}</span>
        {[0, 1].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (load.state === 'error') {
    body = <ErrorBanner text={T.LOAD_FAILED} onRetry={retry} retrying={retrying} />;
  } else {
    body = (
      <>
        {load.failed && <ErrorBanner text={T.LOAD_FAILED} onRetry={retry} retrying={retrying} />}
        <div className="clist st-list" role="list" aria-label={T.SCHOOLS} {...nav.containerProps}>
          {schools.map((school) => {
            const name = T.schoolName(school.name);
            const address = school.address ? T.addressLine(school.address) : null;
            return (
              <div
                key={school.code}
                className={`st-row${dialog?.code === school.code && !screenLocked ? ' is-selected' : ''}`}
                role="listitem"
                aria-label={`${name}, ${address ?? T.NO_ADDRESS}, ${school.phone ? T.phoneLine(school.phone) : T.NO_PHONE}`}
                {...nav.rowProps(school.code)}
                onClick={() => openDialog(school)}
              >
                <span className="st-main">
                  <span className="st-name">{name}</span>
                  <span className="st-details">
                    {address ? (
                      <span className="st-address">{address}</span>
                    ) : (
                      <span className="st-address is-empty">
                        <IconAlertTriangle size={16} aria-hidden="true" />
                        {T.NO_ADDRESS}
                      </span>
                    )}
                    {/* the phone is optional: no warning when there is none */}
                    <span className="st-phone-line">{school.phone ? T.phoneLine(school.phone) : T.NO_PHONE}</span>
                  </span>
                </span>
                <IconButton
                  label={T.editSchoolLabel(school.name)}
                  Icon={IconEdit}
                  tabIndex={nav.itemTabIndex(school.code)}
                  onClick={(event) => {
                    event.stopPropagation();
                    openDialog(school);
                  }}
                />
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="settings">
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
        </div>
      </div>
      <p className="st-sub">{T.PAGE_SUB}</p>
      {isAdmin && (
        <>
          <h2 className="st-heading">{T.SCHOOLS}</h2>
          <p className="st-sub st-sub--section">{T.SCHOOLS_SUB}</p>
        </>
      )}
      {body}
      {dialog && !screenLocked && (
        <SchoolDialog
          key={dialog.key}
          state={dialog}
          school={dialog.school}
          isPhone={isPhone}
          onChange={(patch) =>
            setDialog((current) => {
              if (!current || current.saving) return current;
              const note = current.note && !BLOCKING_NOTES.includes(current.note) ? null : current.note;
              return { ...current, values: { ...current.values, ...patch }, note };
            })
          }
          onTouch={(field) =>
            setDialog((current) => (current && !current.touched[field] ? { ...current, touched: { ...current.touched, [field]: true } } : current))
          }
          onSave={save}
          onCancel={closeDialog}
          onRequestClose={requestClose}
        />
      )}
    </div>
  );
}
