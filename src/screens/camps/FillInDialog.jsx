// FillInDialog.jsx — Camps "Fill in": staff sign up a walk-in family at the desk (rulebook v0.740 /
// v0.741, approved picture docs/Camps/Design review mockups/23-fill-in.png).
// Why it exists: a family that walks in and can't fill in the camp's form on their own phone is
// signed up at the desk. The dialog is New students' Fill in frame (src/screens/forms/FillInDialog.jsx:
// the same title style "Fill in · <camp>", the same "Entered by" line, the two progress bars, Cancel /
// Back / Continue / Send, the Sent screen, the unsaved-changes guard of v0.627, full screen on phones),
// and INSIDE it is the camp's own family form — the family page's own step 1 and step 2
// (src/camp/StepDetails.jsx, StepCheck.jsx, drawn with inDialog: no camp card, no big buttons of
// their own), so the children, days, extras, running price, parent, emergency contact, Paying by,
// waiver and signature look and work exactly as on the family page. The parent signs on the screen.
//
// The sign-up goes to camp_staff_signup (migration 0043, docs/Camps/CONTRACT-0043.md), which runs
// the family form's own rules in the database (prices for today's date, ages, extras, duplicate
// check, up to 3 children) and marks it "Entered by" the staff member. When it works (v0.740 C):
// while family sign-up is open, staff and admins; while it isn't open, admins only; after the
// camp's last day nobody. The camp page grays the button first (CampPage.jsx); the database checks
// again, and its answer shows here as a note.
//
//   const fill = useCampFillIn({ campId, campName, isAdmin, isPhone, screenLocked, onNoAccess,
//                                onRefreshProfile, onSent });
//   fill.open(openerButton)   fill.isOpen   fill.element (the dialog, or null; hidden while locked)
//
// Each Send keeps one submission id (a random id): pressing Send again after a dropped connection
// sends the SAME id, so the database answers with the first save instead of saving twice. The id
// stays the same through every answer of this sign-up (as the family page, CampApp.jsx), "invalid"
// included: if a save went through while the connection dropped, a Send with a NEW id would save
// the family a second time, while the same id gets the first save back. Only Fill in another (a
// new sign-up) makes a new id.
// The typed answers live in the hook (CampPage stays mounted), so a screen lock loses nothing
// typed; a drawn signature is a picture on the screen only, so after a lock it is drawn again.
import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import StepDetails from '../../camp/StepDetails.jsx';
import StepCheck from '../../camp/StepCheck.jsx';
import { buildBody, detailsErrors, emptyChild, emptyPerson, familyTotalFor, fieldId, signatureIsValid, tidyChild } from '../../camp/form.js';
import { formatDollars, shortDate, sortedDates } from '../../camp/format.js';
import * as FT from '../../camp/text.js';
import { MAX_CHILDREN } from '../../lib/camps/campRules.js';
import { normalizeName } from '../../lib/testing/names.js';
import { loadStaffForm, staffSignup } from '../../lib/camps/campsApi.js';
// The family page's styles as text (Vite's "?inline": the file's CSS as a string, not added to the
// page by itself). familyFormCss.js keeps only register.css's "reg-" rules (see there).
import registerCssText from '../../styles/register.css?inline';
import campCssText from '../../styles/camp.css?inline';
import { scopedRegisterCss } from './familyFormCss.js';
import { focusSoon } from './focusSoon.js';
import * as T from './text.js';

const newSubmissionId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const usable = (el) => (el && el.isConnected && el.getClientRects().length > 0 ? el : null) ?? document.querySelector('[data-camp-fill-in]');
const FORM_ID = 'cfill-step1'; // step 1's <form>: the dialog's Continue button submits it

// The family form's styles, added to the page once, the first time Fill in opens.
let stylesAdded = false;
function addFamilyFormStyles() {
  if (stylesAdded || typeof document === 'undefined') return;
  stylesAdded = true;
  const style = document.createElement('style');
  style.setAttribute('data-camp-fill-in', '');
  style.textContent = `${scopedRegisterCss(registerCssText)}\n${campCssText}`;
  document.head.append(style);
}

// The camelCase camp_staff_form answer → the camp object the family page's steps use (as the
// family page's campOf: the answer's camp plus the waiver version next to it).
const campOf = (staff) => (staff?.camp ? { ...staff.camp, waiverVersion: staff.waiverVersion } : null);
const kindOf = (staff) => (staff?.priceKindToday === 'regular' ? 'regular' : 'early');
const emptyForm = (camp) => ({ children: [emptyChild(camp)], parent: emptyPerson(), emergency: emptyPerson(), payingBy: null });

// Has anything been typed or picked? (A one-day camp's own day, picked from the start, doesn't count.)
function isBlank(form, camp) {
  const fresh = emptyChild(camp);
  const c = form.children;
  const childBlank = c.length === 1 && c[0].first === '' && c[0].last === '' && c[0].age === '' && c[0].member === null
    && c[0].extras.length === 0 && JSON.stringify(c[0].dayIds) === JSON.stringify(fresh.dayIds);
  const personBlank = (p) => p.name === '' && p.phone === '' && p.relation === '';
  return childBlank && personBlank(form.parent) && personBlank(form.emergency) && form.payingBy === null;
}

// The staff tip's words for a camp that isn't open: past the closing date, or closed / not open yet.
export const closedWords = (signupState, closesOn, today) =>
  (signupState === 'closed' && closesOn && today > closesOn ? T.FILL_IN_PAST_CLOSING_STAFF : T.FILL_IN_CLOSED_STAFF);

export function useCampFillIn({ campId, campName, isAdmin, isPhone, screenLocked, today, onNoAccess, onRefreshProfile, onSent }) {
  const [state, setState] = useState(null);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  });
  const keyRef = useRef(null); // the open dialog's key, set at once (a read that ends after a close is ignored)
  const patch = (p) => setState((d) => (d ? { ...d, ...(typeof p === 'function' ? p(d) : p) } : d));

  async function fetchForm(key) {
    const res = await loadStaffForm(campId);
    if (keyRef.current !== key) return; // closed (or opened again) meanwhile
    if (res.status === 'ok') {
      const camp = campOf(res);
      patch({ load: 'ok', staff: res, form: emptyForm(camp) });
    } else if (res.status === 'no_access') {
      setState(null);
      onNoAccess();
    } else if (res.status === 'not_found') patch({ load: 'gone' });
    else patch({ load: 'error' });
  }

  function open(opener) {
    addFamilyFormStyles();
    const key = Date.now();
    keyRef.current = key;
    setState({
      key, opener, load: 'loading', staff: null, screen: 'details', form: emptyForm(null), touched: {}, ack: false,
      checkErrors: { ack: null, signature: null }, banner: null, note: null, saving: false, result: null, submissionId: newSubmissionId(),
    });
    fetchForm(key);
  }

  function close() {
    const d = ref.current;
    if (!d || d.saving) return;
    keyRef.current = null;
    setState(null);
    // Close shows the roster with the new camper(s) at once (v0.741).
    if (d.result) onSent?.();
    // Focus back to what opened it (the Fill in button, or the phone's ⋯), once the page behind is usable.
    focusSoon(() => usable(d.opener));
  }

  // Esc, a click outside, the phone's ← or the browser's Back: with something typed, the note shows
  // and the dialog stays open until Send or Cancel (v0.627) — an error note already showing stays.
  function requestClose() {
    const d = ref.current;
    if (!d || d.saving) return;
    const camp = campOf(d.staff);
    const started = d.load === 'ok' && !d.result && (d.screen === 'check' || !isBlank(d.form, camp));
    if (!started) close();
    else if (!d.note) patch({ note: { kind: 'leave' } });
  }

  // A change to step 1 (the family page's own setters, as CampApp.jsx): the unsaved note goes.
  const editForm = (change) => patch((d) => ({ form: change(d.form), note: d.note?.kind === 'leave' ? null : d.note }));
  const setChild = (index, change) => editForm((f) => ({ ...f, children: f.children.map((c, i) => (i === index ? change(c) : c)) }));
  const addChild = () => editForm((f) => (f.children.length >= MAX_CHILDREN ? f : { ...f, children: [...f.children, emptyChild(campOf(ref.current?.staff))] }));
  const removeChild = (index) => {
    editForm((f) => ({ ...f, children: f.children.filter((_, i) => i !== index) }));
    // The error marks are per position ("c1.first"), so forget the ones of later children.
    patch((d) => ({ touched: d.touched.all ? d.touched : Object.fromEntries(Object.entries(d.touched).filter(([key]) => !/^c\d+\./.test(key) || Number(key.slice(1, key.indexOf('.'))) < index)) }));
  };
  const setPerson = (who, field, value) => editForm((f) => ({ ...f, [who]: { ...f[who], [field]: value } }));
  const setPayingBy = (payingBy) => editForm((f) => ({ ...f, payingBy }));
  const onLeave = (key) => patch((d) => (d.touched[key] ? {} : { touched: { ...d.touched, [key]: true } }));

  // Send: the signature picture comes from the dialog (it owns the drawing). Returns the status, so
  // the dialog can wipe the drawing after price_changed (the family must check the new total and sign again).
  async function submit(signature) {
    const d = ref.current;
    if (!d || d.saving || d.load !== 'ok') return null;
    patch({ saving: true, note: null });
    const camp = campOf(d.staff);
    const kind = kindOf(d.staff);
    const body = buildBody({ form: d.form, camp, kind, waiverVersion: camp.waiverVersion, signature, submissionId: d.submissionId, honeypot: '', startedAt: 0, token: '' });
    const res = await staffSignup(campId, body);
    if (keyRef.current !== d.key) return null;
    const status = res.status;
    // The Sent screen's parent name must belong to the sign-up the answer is about. The answer
    // carries the reference, total and children but not the parent, so it is the parent of the Send
    // that saved: after a Send whose answer never came (no connection), that earlier Send may have
    // saved — the database then answers a later Send with the SAME id with that first save, so its
    // parent is kept (pendingParent) until an answer settles it. Any other answer means nothing was
    // saved yet, so the next Send's own parent counts.
    const sentParent = normalizeName(d.form.parent.name);
    if (status !== 'ok' && status !== 'error') patch({ pendingParent: null });
    if (status === 'ok') {
      patch({ saving: false, result: { ...res, parentName: d.pendingParent ?? sentParent }, pendingParent: null, screen: 'sent', banner: null });
      onSent?.(); // the roster shows the new camper(s) at once, behind the Sent screen
    } else if (status === 'price_changed') {
      // As the family page (v0.700 (10)): the new prices, back on step 2 with the message; the box
      // is unticked and the drawing wiped, so the family checks the new total and signs again.
      patch((cur) => ({
        saving: false, staff: { ...cur.staff, ...res.camp, status: 'ok' }, ack: false, checkErrors: { ack: null, signature: null },
        banner: { code: 'price', newCents: res.newTotalCents, oldCents: res.oldTotalCents, at: Date.now() },
      }));
    } else if (status === 'camp_changed') {
      // As the family page: the fresh camp, choices that no longer exist dropped, back to step 1
      // with the message and every problem marked.
      patch((cur) => {
        const staff = { ...cur.staff, ...res.camp, status: 'ok' };
        const fresh = campOf(staff);
        return {
          saving: false, staff, form: { ...cur.form, children: cur.form.children.map((c) => tidyChild(c, fresh)) }, ack: false,
          checkErrors: { ack: null, signature: null }, touched: { all: true }, banner: 'camp_changed', screen: 'details',
        };
      });
    } else if (status === 'admin_only') {
      patch({ saving: false, note: { kind: 'blocked', text: closedWords(res.signupState, res.closesOn, today) } });
      onRefreshProfile?.(); // maybe this person is no longer an admin
    } else if (status === 'finished') {
      patch({ saving: false, note: { kind: 'blocked', text: T.FILL_IN_FINISHED } });
    } else if (status === 'not_found') {
      patch({ saving: false, note: { kind: 'blocked', text: T.FILL_IN_CAMP_GONE } });
    } else if (status === 'no_access') {
      patch({ saving: false });
      onNoAccess();
    } else if (status === 'invalid') {
      patch({ saving: false, note: { kind: 'invalid' } }); // the SAME id (see the top of this file)
    } else {
      // No connection (or an answer we can't read): the SAME submission id stays, so Retry / Send
      // can never save it twice.
      patch((cur) => ({ saving: false, note: { kind: 'failed' }, pendingParent: cur.pendingParent ?? sentParent }));
    }
    return status;
  }

  // Fill in another: a new sign-up (a new submission id), and the camp read again first, so a camp
  // that closed (or changed) meanwhile shows that before anything is typed.
  function another() {
    const d = ref.current;
    if (!d || d.saving) return;
    patch({
      load: 'loading', screen: 'details', form: emptyForm(campOf(d.staff)), touched: {}, ack: false, checkErrors: { ack: null, signature: null },
      banner: null, note: null, result: null, pendingParent: null, submissionId: newSubmissionId(),
    });
    fetchForm(d.key);
  }

  const element = state && !screenLocked
    ? createElement(CampFillInDialog, {
      key: state.key,
      d: state,
      campName,
      isAdmin,
      isPhone,
      today,
      setters: { setChild, addChild, removeChild, setPerson, setPayingBy, onLeave },
      onPatch: patch,
      onSubmit: submit,
      onRetryLoad: () => {
        patch({ load: 'loading' });
        fetchForm(state.key);
      },
      onAnother: another,
      onCancel: close,
      onRequestClose: requestClose,
    })
    : null;

  return { open, close, isOpen: state !== null, element };
}

function CampFillInDialog({ d, campName, isAdmin, isPhone, today, setters, onPatch, onSubmit, onRetryLoad, onAnother, onCancel, onRequestClose }) {
  const camp = campOf(d.staff);
  const kind = kindOf(d.staff);
  const bodyRef = useRef(null);
  const checkRefs = { ack: useRef(null), signature: useRef(null), turnstile: useRef(null), banner: useRef(null) };
  const headingRef = useRef(null); // the family steps' heading isn't drawn here (the dialog has its own)
  const stepTitleRef = useRef(null); // the dialog's own "Step 2 of 2 · Check and sign" (focused on step 2)

  // Each step starts at its top, with focus on its banner (if there is one); else step 1 on its first
  // field (as New students) and step 2 on its heading — its first field, the waiver tick, is far
  // down, and focus there would scroll the dialog away from the summary to check first.
  const bannerKey = d.banner ? (d.banner === 'camp_changed' ? 'camp' : d.banner.at) : null;
  useEffect(() => {
    if (d.load !== 'ok' || d.screen === 'sent') return undefined;
    const id = window.requestAnimationFrame(() => {
      const root = bodyRef.current;
      if (!root) return;
      // A new step starts at its top (step 2's first field, the waiver tick, is far down).
      let box = root.parentElement;
      while (box && box !== document.body && !/(auto|scroll)/.test(window.getComputedStyle(box).overflowY)) box = box.parentElement;
      if (box && box !== document.body) box.scrollTop = 0;
      if (bannerKey && checkRefs.banner.current) {
        checkRefs.banner.current.focus({ preventScroll: true });
        return;
      }
      if (d.screen === 'check') {
        stepTitleRef.current?.focus({ preventScroll: true });
        return;
      }
      root.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
    // Only when the step, the load or the banner changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.screen, d.load, bannerKey]);

  // ----- Sent (New students' Sent: the tick, "<Parent>'s sign-up is saved.", the reference and the total) -----
  if (d.screen === 'sent' && d.result) {
    const r = d.result;
    const firstDay = sortedDates(r.camp?.days ?? [])[0];
    const way = FT.METHOD[r.payingBy] ?? '';
    return (
      // key: the Sent box is a dialog of its own (not the form's box changed), so it opens fresh and
      // puts focus on Close (data-autofocus) instead of losing it to the page.
      <Dialog key="sent" title={T.FILL_IN_SENT_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
        <div className="fsent">
          <div className="fsent-icon" aria-hidden="true">
            <IconCheck size={24} />
          </div>
          {/* The parent of the Send that saved (see submit), with the answer's own reference and total */}
          <p>{T.fillInSentText(r.parentName)}</p>
          <ul className="fsent-list">
            <li>{T.fillInReference(r.reference)}</li>
            <li>{T.fillInTotal(formatDollars(r.familyTotalCents), way, firstDay ? shortDate(firstDay) : '')}</li>
          </ul>
        </div>
        <div className={isPhone ? 'dialog-page-submit' : 'dialog-actions'}>
          <button type="button" className={`btn${isPhone ? ' btn-block' : ''}`} onClick={onAnother}>
            {T.FILL_IN_ANOTHER}
          </button>
          <button type="button" className={`btn btn-primary${isPhone ? ' btn-block' : ''}`} data-autofocus onClick={onCancel}>
            {T.FILL_IN_CLOSE}
          </button>
        </div>
      </Dialog>
    );
  }

  const title = T.fillInTitle(campName);

  // ----- Before the form can show: loading, couldn't load, the camp is gone, or not for this person -----
  const blockedAtLoad = d.load === 'ok' && d.staff
    && (d.staff.fillIn === 'finished' ? T.FILL_IN_FINISHED : d.staff.fillIn === 'admin_only' && !isAdmin ? closedWords(d.staff.signupState, d.staff.closesOn, today) : null);
  if (d.load !== 'ok' || blockedAtLoad) {
    let body;
    if (d.load === 'loading') body = <p className="cfill-loading" role="status">{T.FILL_IN_LOADING}</p>;
    else if (d.load === 'error') {
      body = (
        <div className="tdialog-note">
          <Notice>
            {T.FILL_IN_LOAD_FAILED}
            <button type="button" className="note-action" onClick={onRetryLoad}>
              {T.RETRY}
            </button>
          </Notice>
        </div>
      );
    } else body = <div className="tdialog-note"><Notice>{d.load === 'gone' ? T.CAMP_GONE : blockedAtLoad}</Notice></div>;
    return (
      <Dialog key="form" title={title} size="medium" fullScreen={isPhone} onRequestClose={onCancel}>
        <p className="tdialog-sub">{T.FILL_IN_ENTERED_BY}</p>
        {body}
        {!isPhone && (
          <div className="dialog-footer">
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onCancel}>
                {d.load === 'loading' ? T.FILL_IN_CANCEL : T.FILL_IN_CLOSE}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    );
  }

  // ----- The two steps -----
  const errors = detailsErrors(d.form, camp);
  const show = (key) => (d.touched.all || d.touched[key] ? errors[key] ?? null : null);
  const step = d.screen === 'check' ? 2 : 1;

  function onContinue() {
    onPatch({ touched: { all: true } });
    const firstBad = Object.keys(errors)[0]; // detailsErrors lists fields in screen order
    if (firstBad) {
      document.getElementById(fieldId(firstBad))?.focus();
      return;
    }
    onPatch({ screen: 'check', banner: null, checkErrors: { ack: null, signature: null }, note: null });
  }

  async function onSend() {
    if (d.saving) return;
    // The tick and the signature, as the family page checks them.
    const pad = checkRefs.signature.current;
    const empty = !pad || pad.isEmpty();
    let signature = null;
    let signatureError = empty ? FT.ERR_SIGNATURE : null;
    if (!empty) {
      signature = pad.toDataUrl();
      if (!signatureIsValid(signature)) signatureError = FT.ERR_SIGNATURE_TOO_BIG;
    }
    const checkErrors = { ack: d.ack ? null : FT.ERR_ACK, signature: signatureError };
    onPatch({ checkErrors });
    if (checkErrors.ack) {
      checkRefs.ack.current?.focus();
      return;
    }
    if (checkErrors.signature) return;
    const status = await onSubmit(signature);
    if (status === 'price_changed') checkRefs.signature.current?.clear();
  }

  // The note: under the buttons on PC / tablet, above them on phones, where every note also holds
  // "Discard changes" — phones have no Cancel (as New students, v0.56 / N15).
  const note = d.note;
  let noteText = null;
  if (note?.kind === 'leave') noteText = isPhone ? T.FILL_IN_LEAVE_PHONE : T.FILL_IN_LEAVE;
  else if (note?.kind === 'failed') noteText = T.FILL_IN_SEND_FAILED;
  else if (note?.kind === 'invalid') noteText = T.FILL_IN_SEND_INVALID;
  else if (note?.kind === 'blocked') noteText = note.text;
  const noteBlock = noteText && (
    <div className="tdialog-note">
      <Notice>
        {noteText}
        {note.kind === 'failed' && (
          <button type="button" className="note-action" onClick={onSend} aria-disabled={d.saving ? 'true' : undefined}>
            {T.RETRY}
          </button>
        )}
        {isPhone && (
          <button type="button" className="note-action" onClick={onCancel}>
            {T.FILL_IN_DISCARD}
          </button>
        )}
      </Notice>
    </div>
  );
  const actions = (
    <div className={`dialog-actions fstep-actions${isPhone ? ' fstep-actions--phone' : ''}`}>
      {!isPhone && (
        <button type="button" className="btn" onClick={onCancel} aria-disabled={d.saving ? 'true' : undefined}>
          {T.FILL_IN_CANCEL}
        </button>
      )}
      <span className="sdialog-actions-right">
        {step === 2 && (
          <button type="button" className="btn" disabled={d.saving} onClick={() => onPatch({ screen: 'details', banner: null, note: null })}>
            <IconArrowLeft size={16} aria-hidden="true" />
            {T.FILL_IN_BACK}
          </button>
        )}
        {step === 1 ? (
          <button type="submit" form={FORM_ID} className="btn btn-primary">
            <IconArrowRight size={16} aria-hidden="true" />
            {T.FILL_IN_CONTINUE}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" aria-disabled={d.saving ? 'true' : undefined} aria-busy={d.saving || undefined} onClick={onSend}>
            <IconCheck size={16} aria-hidden="true" />
            {d.saving ? T.FILL_IN_SENDING : T.FILL_IN_SEND}
          </button>
        )}
      </span>
    </div>
  );

  return (
    <Dialog key="form" title={title} size="medium" fullScreen={isPhone} onRequestClose={onRequestClose}>
      <p className="tdialog-sub">{T.FILL_IN_ENTERED_BY}</p>
      <div className="fprogress" aria-hidden="true">
        <i className="is-on" />
        <i className={step === 2 ? 'is-on' : ''} />
      </div>
      <h3 className="fstep-title" ref={stepTitleRef} tabIndex={-1}>{T.fillInStep(step, step === 1 ? T.FILL_IN_STEP_DETAILS : T.FILL_IN_STEP_CHECK)}</h3>
      {/* The camp's own family form (src/camp/), its look from register.css / camp.css (familyFormCss.js) */}
      <div className="cfill-form" ref={bodyRef}>
        {step === 1 ? (
          <StepDetails
            inDialog
            formId={FORM_ID}
            camp={camp}
            kind={kind}
            form={d.form}
            setChild={setters.setChild}
            addChild={setters.addChild}
            removeChild={setters.removeChild}
            setPerson={setters.setPerson}
            setPayingBy={setters.setPayingBy}
            show={show}
            onLeave={setters.onLeave}
            onContinue={onContinue}
            banner={d.banner === 'camp_changed' ? d.banner : null}
            bannerRef={checkRefs.banner}
            headingRef={headingRef}
            honeypot=""
            setHoneypot={() => {}}
          />
        ) : (
          <StepCheck
            inDialog
            signatureHint={T.FILL_IN_SIGNATURE_HINT}
            camp={camp}
            kind={kind}
            form={d.form}
            familyTotalCents={familyTotalFor(d.form.children, camp, kind)}
            ack={d.ack}
            setAck={(value) => onPatch((cur) => ({ ack: value, checkErrors: value ? { ...cur.checkErrors, ack: null } : cur.checkErrors }))}
            errors={d.checkErrors}
            banner={d.banner && d.banner !== 'camp_changed' ? d.banner : null}
            sending={d.saving}
            hasTried={false}
            onSignatureChange={(drawn) => drawn && onPatch((cur) => ({ checkErrors: { ...cur.checkErrors, signature: null } }))}
            onSend={onSend}
            onBack={() => onPatch({ screen: 'details', banner: null })}
            refs={checkRefs}
            headingRef={headingRef}
          />
        )}
      </div>
      {isPhone ? (
        <>
          {noteBlock}
          {actions}
        </>
      ) : (
        <div className="dialog-footer">
          {actions}
          {noteBlock}
        </div>
      )}
    </Dialog>
  );
}
