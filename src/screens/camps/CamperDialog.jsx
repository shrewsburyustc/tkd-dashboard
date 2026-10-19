// CamperDialog.jsx — Camper detail (C6): one camper's read-only summary, and Edit details.
// Why it exists: the lists show as little as possible (privacy, rulebook §5: no phones or family
// details in lists). Everything else about a camper is here, one tap away from any name:
//   - age and membership, days, extras with their days, how the price was worked out, paying by
//   - Payments: the status tag, the payments list (date, amount, method, who recorded it); when
//     days or extras were taken off after paying: "Total now $315 · paid $390 · Paid $75 more than
//     the total" (amber part) and the admin line about Edit payment
//   - Check-in: the check-in time of each of the camper's days (v0.704)
//   - Family: parent or guardian and emergency contact WITH phone numbers (the only place in the
//     app that shows them — they come from camp_camper_detail, never from the lists)
//   - Sign-up: "Signed up on the family form, Mar 3, 2027 · waiver signed on the form · reference
//     CP-4821" ("signature deleted after 3 years" after the purge)
// Edit details turns the summary into fields (Star v0.112 / Color Belt): child (names, age 1–99,
// member), days, extras (per-day extras ask which days), parent and emergency contact. Changing
// days, member or extras prices the WHOLE camper again at the camp's current prices (v0.700,
// §1.13 re-price rule), and the new total shows while editing. When every camp day is ticked,
// "not charged to all-days campers" extras are taken off the form (with their price) before saving.
// A day the camper was already checked in on can't be taken off (Undo that check-in first).
// PC / tablet: a centered dialog; phones: full screen with a back arrow.
//
// Props: camperId, camperName (shown while loading), camp, days (Day[]), prices, extras (the camp's current ones), isPhone,
//        hidden, startInEdit, onClose(), onSaved(), onNoAccess, onRefreshProfile
import { useEffect, useId, useState } from 'react';
import { IconCheck, IconEdit } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import { loadCamperDetail, updateDetails } from '../../lib/camps/campsApi.js';
import { AGE_LIMITS, MAX_CAMPER_CENTS, RELATION_MAX, formatPhone, isAllDays, phoneDigits, priceChild } from '../../lib/camps/campRules.js';
import { nameProblem, normalizeName } from '../../lib/testing/names.js';
import ChoiceGroup from '../testing/events/ChoiceGroup.jsx';
import { CamperTag } from './CamperRows.jsx';
import * as T from './text.js';

const NOTES = {
  UNSAVED: T.UNSAVED,
  STALE_DIALOG: T.STALE_DIALOG,
  NOT_ALLOWED: T.ROSTER_NOT_ALLOWED,
  INVALID_DIALOG: T.INVALID_DIALOG,
  SAVE_FAILED: T.SAVE_FAILED,
};
const BLOCKING = ['STALE_DIALOG', 'NOT_ALLOWED'];
const PHONE_DISCARD = ['UNSAVED', 'STALE_DIALOG', 'NOT_ALLOWED'];

function Row({ label, children }) {
  return (
    <div className="ev-sum-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The form's values from the loaded detail.
function editValues(camper, family) {
  const picks = {};
  for (const e of camper.extras ?? []) {
    const pick = picks[e.extraId] ?? { on: true, dayIds: [] };
    if (e.dayId) pick.dayIds.push(e.dayId);
    picks[e.extraId] = pick;
  }
  return {
    firstName: camper.firstName,
    lastName: camper.lastName,
    age: String(camper.age),
    member: camper.member,
    dayIds: (camper.days ?? []).map((d) => d.dayId),
    picks,
    parentName: family.parentName ?? '',
    parentPhone: formatPhone(family.parentPhone ?? ''),
    parentRelation: family.parentRelation ?? '',
    emergencyName: family.emergencyName ?? '',
    emergencyPhone: formatPhone(family.emergencyPhone ?? ''),
    emergencyRelation: family.emergencyRelation ?? '',
  };
}

// The child as campRules.priceChild wants it ({ dayIds, member, extras:[{ extraId, dayIds }] }).
// Extras not allowed for an all-days child are left out (the screen removes them, §1.14).
function childOf(values, campExtras, campDays) {
  const all = isAllDays(values.dayIds, campDays);
  const extras = [];
  for (const extra of campExtras) {
    const pick = values.picks[extra.extraId];
    if (!pick?.on) continue;
    if (extra.notForAllDays && all) continue;
    extras.push({ extraId: extra.extraId, dayIds: extra.per === 'day' ? pick.dayIds.filter((id) => values.dayIds.includes(id)) : [] });
  }
  return { firstName: values.firstName, lastName: values.lastName, member: values.member, dayIds: values.dayIds, extras };
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export default function CamperDialog({ camperId, camperName, camp, days, prices, extras, isPhone, hidden, startInEdit, onClose, onSaved, onNoAccess, onRefreshProfile }) {
  const idBase = useId();
  const [load, setLoad] = useState({ status: 'loading', detail: null });
  const [mode, setMode] = useState(startInEdit ? 'edit' : 'view');
  const [values, setValues] = useState(null);
  const [initial, setInitial] = useState(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [checkedInError, setCheckedInError] = useState(null);

  async function fetchDetail() {
    setLoad((current) => ({ ...current, status: 'loading' }));
    const result = await loadCamperDetail(camperId);
    if (result.status === 'ok') {
      setLoad({ status: 'ready', detail: result });
      const start = editValues(result.camper, result.family ?? {});
      setValues(start);
      setInitial(JSON.stringify(start));
    } else {
      if (result.status === 'no_access') onNoAccess();
      setLoad({ status: result.status === 'not_found' ? 'gone' : 'error', detail: null });
    }
  }
  useEffect(() => {
    fetchDetail();
    // Once, when the dialog opens (it gets a new key each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  const detail = load.detail;
  const camper = detail?.camper ?? null;
  const name = camper ? T.camperLabel(camper) : (camperName ?? '');
  const campDayIsos = days.map((d) => d.day);

  // ----- Loading / failed -----
  if (load.status !== 'ready') {
    return (
      <Dialog title={name || T.EDIT_DETAILS_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
        {load.status === 'loading' ? (
          <p className="field-hint cp-loading">{T.LOADING_CAMPER}</p>
        ) : (
          <>
            <Notice>{load.status === 'gone' ? T.ROSTER_STALE : T.LOAD_CAMPER_FAILED}</Notice>
            <div className="dialog-actions">
              {load.status === 'error' && (
                <button type="button" className="btn" onClick={fetchDetail}>
                  {T.RETRY}
                </button>
              )}
              <button type="button" className="btn" data-autofocus onClick={onClose}>
                {T.CLOSE}
              </button>
            </div>
          </>
        )}
      </Dialog>
    );
  }

  // ----- View (C6) -----
  if (mode === 'view') {
    const b = detail.breakdown ?? {};
    const family = detail.family ?? {};
    const myDays = (camper.days ?? []).map((d) => d.day).sort();
    const allDays = myDays.length === campDayIsos.length && campDayIsos.length > 0;
    const owes = camper.owesCents ?? 0;
    const paid = camper.paidCents ?? 0;
    const checkins = detail.checkins ?? (camper.days ?? []).map((d) => ({ day: d.day, checkedInAt: d.checkedInAt, checkedInByName: d.checkedInByName }));
    const canEdit = camper.status === 'active';
    const editButton = canEdit ? (
      <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} onClick={() => setMode('edit')}>
        {/* ti-edit = edit */}
        <IconEdit size={16} aria-hidden="true" />
        {T.EDIT_DETAILS}
      </button>
    ) : null;
    return (
      <Dialog title={name} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
        <p className="tdialog-sub">{camp.name}</p>
        <p className="cp-detail-age">{T.ageLine(camper.age, camper.member)}</p>
        <dl className="ev-sum">
          <Row label={T.DETAIL_DAYS}>{T.detailDaysLine(myDays, allDays)}</Row>
          <Row label={T.DETAIL_EXTRAS}>
            {(b.extras ?? []).length === 0
              ? T.NO_EXTRAS_DETAIL
              : b.extras.map((e) => (
                  <span key={e.name} className="ev-sum-line">
                    {T.detailExtraLine(e, campDayIsos)}
                  </span>
                ))}
          </Row>
          {b.totalCents !== undefined && <Row label={T.DETAIL_PRICE}>{T.priceBreakdownLine(b, allDays)}</Row>}
          <Row label={T.DETAIL_PAYING_BY}>{T.payingByText(camper.payingBy)}</Row>
          {camper.status !== 'active' && <Row label={T.DETAIL_REMOVED}>{T.removedDetail(camper)}</Row>}
        </dl>

        <h3 className="cp-detail-head">{T.HEAD_PAYMENTS}</h3>
        <dl className="ev-sum">
          <Row label={T.DETAIL_STATUS}>
            <CamperTag row={camper} onReview={() => {}} />
          </Row>
          <Row label={T.DETAIL_PAYMENTS}>
            {(detail.payments ?? []).length === 0
              ? T.NONE_YET
              : detail.payments.map((p) => (
                  <span key={p.id} className="ev-sum-line">
                    {T.paymentLine(p)}
                  </span>
                ))}
            {owes < 0 && (
              <span className="ev-sum-line">
                {T.overpaidLine(camper.totalCents, paid)}
                <span className="cp-amber-text">{T.overpaidAmber(-owes)}</span>
              </span>
            )}
            {owes > 0 && paid > 0 && <span className="ev-sum-line">{T.owesLine(camper.totalCents, paid, owes)}</span>}
          </Row>
        </dl>
        {owes < 0 && <p className="field-hint">{T.OVERPAID_ADMIN}</p>}

        <h3 className="cp-detail-head">{T.DETAIL_CHECKINS}</h3>
        <dl className="ev-sum">
          {checkins.map((c) => (
            <Row key={c.day} label={T.dayLong(c.day)}>
              {c.checkedInAt ? `${T.clockTime(c.checkedInAt)}${c.checkedInByName ? ` · ${c.checkedInByName}` : ''}` : '—'}
            </Row>
          ))}
        </dl>

        <h3 className="cp-detail-head">{T.HEAD_FAMILY}</h3>
        <dl className="ev-sum">
          <Row label={T.DETAIL_PARENT}>{T.contactLine(family.parentName, family.parentRelation, formatPhone(family.parentPhone ?? ''))}</Row>
          <Row label={T.DETAIL_EMERGENCY}>{T.contactLine(family.emergencyName, family.emergencyRelation, formatPhone(family.emergencyPhone ?? ''))}</Row>
        </dl>

        <h3 className="cp-detail-head">{T.HEAD_SIGNUP}</h3>
        <p className="cp-signup-line">{T.signupLine(camper)}</p>

        {isPhone ? (
          editButton && <div className="dialog-page-submit">{editButton}</div>
        ) : (
          <div className="dialog-actions">
            {/* Focus starts on Close: nothing changes by accident at a shared desk (Star v0.112). */}
            <button type="button" className="btn" data-autofocus onClick={onClose}>
              {T.CLOSE}
            </button>
            {editButton}
          </div>
        )}
      </Dialog>
    );
  }

  // ----- Edit details -----
  const campExtras = [...extras].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const allDays = isAllDays(values.dayIds, days);
  const child = childOf(values, campExtras, days);
  // Re-price only when days, member or extras changed (v0.700); otherwise the saved total stays.
  const savedChild = childOf(JSON.parse(initial), campExtras, days);
  const repriced =
    !sameSet(child.dayIds, savedChild.dayIds) ||
    child.member !== savedChild.member ||
    JSON.stringify(child.extras.map((e) => [e.extraId, [...e.dayIds].sort()]).sort()) !==
      JSON.stringify(savedChild.extras.map((e) => [e.extraId, [...e.dayIds].sort()]).sort());
  const priced = priceChild(child, prices, campExtras, days, camper.priceKind);
  const total = repriced ? priced.totalCents : camper.totalCents;

  // ----- Checking the fields -----
  const errors = {};
  const nameText = (problem, which) => (problem === 'empty' ? (which === 'first' ? T.ENTER_FIRST : T.ENTER_LAST) : problem === 'tooLong' ? T.NAME_TOO_LONG : T.NAME_BAD_CHARACTER);
  const firstIssue = nameProblem(values.firstName);
  const lastIssue = nameProblem(values.lastName);
  if (firstIssue) errors.firstName = nameText(firstIssue, 'first');
  if (lastIssue) errors.lastName = nameText(lastIssue, 'last');
  const ageText = values.age.trim();
  const age = /^\d{1,2}$/.test(ageText) ? Number(ageText) : null;
  if (ageText === '') errors.age = T.ENTER_AGE;
  else if (age === null || age < AGE_LIMITS.min || age > AGE_LIMITS.max) errors.age = T.AGE_RANGE_STAFF;
  if (values.dayIds.length === 0) errors.days = T.CHOOSE_DAY;
  for (const extra of campExtras) {
    const pick = values.picks[extra.extraId];
    if (!pick?.on || extra.per !== 'day' || (extra.notForAllDays && allDays)) continue;
    if (pick.dayIds.filter((id) => values.dayIds.includes(id)).length === 0) errors[`extra-${extra.extraId}`] = T.CHOOSE_WHICH_DAYS;
  }
  for (const who of ['parent', 'emergency']) {
    if (nameProblem(values[`${who}Name`])) errors[`${who}Name`] = T.ENTER_NAME;
    if (!phoneDigits(values[`${who}Phone`])) errors[`${who}Phone`] = T.ENTER_PHONE;
    const relation = normalizeName(values[`${who}Relation`]);
    if (relation === '' || [...relation].length > RELATION_MAX) errors[`${who}Relation`] = T.ENTER_RELATION;
  }
  if (total > MAX_CAMPER_CENTS) errors.total = T.TOTAL_TOO_HIGH;
  const valid = Object.keys(errors).length === 0;
  const dirty = JSON.stringify(values) !== initial;
  const blocked = BLOCKING.includes(note);
  const canSave = valid && !saving && !blocked;
  const show = (key) => (tried ? errors[key] : null);

  function change(patch) {
    if (saving) return;
    setValues((current) => ({ ...current, ...patch }));
    setNote((current) => (current && !BLOCKING.includes(current) ? null : current));
  }
  function toggleDay(dayId) {
    const day = days.find((d) => d.dayId === dayId);
    const has = values.dayIds.includes(dayId);
    // A day the camper was checked in on can't be taken off (§1.14: checked_in).
    const mine = (camper.days ?? []).find((d) => d.dayId === dayId);
    if (has && mine?.checkedInAt) {
      setCheckedInError(T.checkedInCantRemove(day.day));
      return;
    }
    setCheckedInError(null);
    const dayIds = has ? values.dayIds.filter((id) => id !== dayId) : days.filter((d) => d.dayId === dayId || values.dayIds.includes(d.dayId)).map((d) => d.dayId);
    // A per-day extra follows the child's days: a removed day comes off it too.
    const picks = Object.fromEntries(Object.entries(values.picks).map(([id, pick]) => [id, { ...pick, dayIds: pick.dayIds.filter((d) => dayIds.includes(d)) }]));
    change({ dayIds, picks });
  }
  function toggleExtra(extra, on) {
    // A per-day extra starts with all of the child's days (C7: "starting with the child's days").
    const pick = { on, dayIds: on && extra.per === 'day' ? [...values.dayIds] : [] };
    change({ picks: { ...values.picks, [extra.extraId]: pick } });
  }
  function toggleExtraDay(extra, dayId) {
    const pick = values.picks[extra.extraId] ?? { on: true, dayIds: [] };
    const dayIds = pick.dayIds.includes(dayId) ? pick.dayIds.filter((d) => d !== dayId) : [...pick.dayIds, dayId];
    change({ picks: { ...values.picks, [extra.extraId]: { ...pick, dayIds } } });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTried(true);
    if (!canSave) return;
    if (!dirty) {
      if (startInEdit) onClose();
      else setMode('view');
      return;
    }
    setSaving(true);
    setNote(null);
    const input = {
      firstName: normalizeName(values.firstName),
      lastName: normalizeName(values.lastName),
      age,
      member: values.member,
      dayIds: child.dayIds,
      extras: child.extras,
      parentName: normalizeName(values.parentName),
      parentPhone: phoneDigits(values.parentPhone),
      parentRelation: normalizeName(values.parentRelation),
      emergencyName: normalizeName(values.emergencyName),
      emergencyPhone: phoneDigits(values.emergencyPhone),
      emergencyRelation: normalizeName(values.emergencyRelation),
    };
    const result = await updateDetails(camperId, camper.version, camper.signupVersion, input);
    setSaving(false);
    const st = result.status;
    if (st === 'ok') onSaved();
    else if (st === 'checked_in') {
      const day = days.find((d) => d.day === result.day || d.dayId === result.day);
      setCheckedInError(T.checkedInCantRemove(day?.day ?? result.day));
    } else if (st === 'no_access') onNoAccess();
    else if (st === 'not_allowed') {
      setNote('NOT_ALLOWED');
      onRefreshProfile();
    } else if (st === 'stale' || st === 'not_found' || st === 'withdrawn') setNote('STALE_DIALOG');
    else if (st === 'invalid') setNote('INVALID_DIALOG');
    else setNote('SAVE_FAILED');
  }
  function cancelEdit() {
    if (saving) return;
    if (startInEdit) onClose();
    else {
      setValues(JSON.parse(initial));
      setNote(null);
      setTried(false);
      setCheckedInError(null);
      setMode('view');
    }
  }
  function requestClose() {
    if (saving) return;
    if (!dirty || blocked) cancelEdit();
    else setNote('UNSAVED');
  }

  const textField = (field, label, { autoFocus = false, inputMode, autoComplete = 'off' } = {}) => (
    <div className="field">
      <label htmlFor={`${idBase}-${field}`}>{label}</label>
      <input
        id={`${idBase}-${field}`}
        className="input"
        type={field.endsWith('Phone') ? 'tel' : 'text'}
        inputMode={inputMode}
        autoComplete={autoComplete}
        data-autofocus={autoFocus ? true : undefined}
        readOnly={saving}
        value={values[field]}
        aria-invalid={show(field) ? true : undefined}
        aria-describedby={show(field) ? `${idBase}-${field}-error` : undefined}
        onChange={(event) => change({ [field]: event.target.value })}
      />
      {show(field) && <Notice id={`${idBase}-${field}-error`}>{show(field)}</Notice>}
    </div>
  );

  const saveButton = (
    <button type="submit" className={`btn btn-primary${isPhone ? ' btn-block' : ''}${canSave ? '' : ' is-unavailable'}`} aria-disabled={canSave ? undefined : 'true'}>
      <IconCheck size={16} aria-hidden="true" />
      {saving ? T.SAVING : T.SAVE}
    </button>
  );
  const noteBlock = note && (
    <div className="tdialog-note">
      <Notice>
        {isPhone && note === 'STALE_DIALOG' ? T.STALE_DIALOG_PHONE : NOTES[note]}
        {isPhone && PHONE_DISCARD.includes(note) && (
          <button type="button" className="note-action" onClick={cancelEdit}>
            {T.DISCARD_CHANGES}
          </button>
        )}
      </Notice>
    </div>
  );
  const shownExtras = campExtras.filter((e) => !(e.notForAllDays && allDays));

  return (
    <Dialog title={T.EDIT_DETAILS_TITLE} size="medium" fullScreen={isPhone} onRequestClose={requestClose}>
      <p className="tdialog-sub">{T.editDetailsSub(name, camp.name)}</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ev-two">
          {textField('firstName', T.FIRST_NAME, { autoFocus: true })}
          {textField('lastName', T.LAST_NAME)}
        </div>
        <div className="ev-two">
          {textField('age', T.AGE, { inputMode: 'numeric' })}
          <div className="field cp-neutral">
            <span id={`${idBase}-member`} className="field-label">
              {T.isMember(normalizeName(values.firstName))}
            </span>
            <div>
              <ChoiceGroup
                labelId={`${idBase}-member`}
                value={values.member ? 'yes' : 'no'}
                readOnly={saving}
                options={[
                  { key: 'yes', label: T.YES },
                  { key: 'no', label: T.NO },
                ]}
                onChange={(key) => change({ member: key === 'yes' })}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <span id={`${idBase}-days`} className="field-label">
            {T.WHICH_DAYS}
          </span>
          <div className="cp-chips" role="group" aria-labelledby={`${idBase}-days`}>
            {days.map((d) => {
              const on = values.dayIds.includes(d.dayId);
              return (
                <button key={d.dayId} type="button" className={`cp-daychip${on ? ' is-picked' : ''}`} aria-pressed={on ? 'true' : 'false'} onClick={() => !saving && toggleDay(d.dayId)}>
                  {T.dayLong(d.day)}
                </button>
              );
            })}
          </div>
          {show('days') && <Notice>{show('days')}</Notice>}
          {checkedInError && <Notice>{checkedInError}</Notice>}
        </div>

        {shownExtras.length > 0 && (
          <div className="field">
            <span className="field-label">{T.EXTRAS}</span>
            {shownExtras.map((extra) => {
              const pick = values.picks[extra.extraId];
              const on = Boolean(pick?.on);
              const tickId = `${idBase}-extra-${extra.extraId}`;
              return (
                <div key={extra.extraId} className="cp-edit-extra">
                  <label className="cbrow" htmlFor={tickId}>
                    <input id={tickId} type="checkbox" className="cb" checked={on} disabled={saving} onChange={(event) => toggleExtra(extra, event.target.checked)} />
                    <span>
                      {extra.name} <span className="cp-age-text">· {T.extraPriceText(extra.priceCents, extra.per)}</span>
                    </span>
                  </label>
                  {on && extra.per === 'day' && (
                    <div className="cp-chips cp-chips--small" role="group" aria-label={`${extra.name}: ${T.EXTRA_WHICH_DAYS}`}>
                      {days
                        .filter((d) => values.dayIds.includes(d.dayId))
                        .map((d) => {
                          const dayOn = pick.dayIds.includes(d.dayId);
                          return (
                            <button key={d.dayId} type="button" className={`cp-daychip${dayOn ? ' is-picked' : ''}`} aria-pressed={dayOn ? 'true' : 'false'} onClick={() => !saving && toggleExtraDay(extra, d.dayId)}>
                              {T.weekdayShort(d.day)}
                            </button>
                          );
                        })}
                    </div>
                  )}
                  {show(`extra-${extra.extraId}`) && <Notice>{show(`extra-${extra.extraId}`)}</Notice>}
                </div>
              );
            })}
          </div>
        )}

        <p className={`cp-newtotal${repriced ? ' is-changed' : ''}`} role="status">
          {T.newTotalLine(total)}
          {repriced && <span className="field-hint"> {T.REPRICE_NOTE}</span>}
        </p>
        {show('total') && <Notice>{show('total')}</Notice>}

        <h3 className="cp-detail-head">{T.PARENT}</h3>
        {textField('parentName', T.CONTACT_NAME)}
        <div className="ev-two">
          {textField('parentPhone', T.PHONE, { inputMode: 'tel' })}
          {textField('parentRelation', T.RELATIONSHIP)}
        </div>
        <h3 className="cp-detail-head">{T.EMERGENCY}</h3>
        {textField('emergencyName', T.CONTACT_NAME)}
        <div className="ev-two">
          {textField('emergencyPhone', T.PHONE, { inputMode: 'tel' })}
          {textField('emergencyRelation', T.RELATIONSHIP)}
        </div>
        <p className="field-hint">{T.PAYMENT_NOT_HERE}</p>

        {isPhone && noteBlock}
        {isPhone ? (
          <div className="dialog-page-submit">{saveButton}</div>
        ) : (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={cancelEdit}>
                {T.CANCEL}
              </button>
              {saveButton}
            </div>
            {noteBlock}
          </div>
        )}
      </form>
    </Dialog>
  );
}

