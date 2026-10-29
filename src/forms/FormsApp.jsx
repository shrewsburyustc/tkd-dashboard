// FormsApp.jsx — the whole public forms page (/f/<name>, approved mockup screen 8).
// Why it exists: families sign up from a link or QR code (e.g. a free class from Instagram).
// This file decides which screen shows:
//   loading → "can't sign up" message (not found / closed / paused / didn't load)
//           → the form, one step per screen (the steps come from the form's "step" dividers)
//           → the thank-you screen (the form's own message, the booked times, Add to calendar).
// It walks the steps exactly like the staff "Fill in" (src/screens/forms/useFillIn.js and
// FillInDialog.jsx): the same fields (FormFields.jsx), the same checks (lib/forms/fields.js),
// the same answers sent. The differences: errors show as the family types (after they leave a
// field they filled, or after Next), Turnstile runs on Submit, and the server is the public
// Function (publicApi.js) instead of the staff database call.
// Emails are OFF (rulebook v0.601): the thank-you screen tells the family to keep the time.
//
// The front-desk KIOSK (kiosk plan, docs/Prospects/TKD-Kiosk-Build-Plan.md) shows this same page
// inside the locked dashboard (src/screens/kiosk/KioskApp.jsx) with the prop `kiosk`:
//   { slug, token, paused, onDone(kioskEnded), onEnded() } — the form comes from `slug` (not the address), every Submit
//   carries the kiosk token, the browser's autofill is off, and the thank-you screen is the kiosk one
//   (30 seconds, "Take a photo", Done → onDone). The public page itself never passes it.
//
// What is sent (POST /api/forms/<name>, checked again by the Function and the database):
//   submission_key   made once per sign-up (crypto.randomUUID); a repeat Submit after a dropped
//                    connection reuses it, so the database saves the sign-up only once
//   published_version, answers (visible questions only), children [{ first_name, age }],
//   bookings [{ child, class_id, date, starts_at }], signature (PNG data URL or null),
//   website (the hidden "honeypot" — always empty for people), started_at / sent_at (ms),
//   turnstile_token (not in preview mode)
import { useEffect, useRef, useState } from 'react';
import FormFields from '../screens/forms/FormFields.jsx';
import Notice from '../components/Notice.jsx';
import { cleanAnswers, emptyFillValues, isTimeKey, NO_TIME_KEY, stepProblems, stepsOf } from '../lib/forms/fields.js';
import { cleanText } from '../lib/calendar/rules.js';
import { getForm, submitForm } from './publicApi.js';
import { getTurnstileToken, removeTurnstile } from './turnstile.js';
import ThankYou from './ThankYou.jsx';
import { Header, PreviewStrip, StateMessage } from './parts.jsx';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';
const ID_BASE = 'pf';
const newKey = () => crypto.randomUUID();
const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

// The form's name from the address: /f/free-class-instagram → "free-class-instagram".
function slugFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('f');
  const raw = at >= 0 ? parts[at + 1] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

// The steps that have something in them (a divider with nothing after it is skipped, as in Fill in).
const stepsFor = (fields) => stepsOf(fields).filter((s) => s.fields.length > 0);

export default function FormsApp({ kiosk = null }) {
  const [slug] = useState(() => kiosk?.slug ?? slugFromAddress());
  const [screen, setScreen] = useState('loading'); // loading | message | form | done
  const [message, setMessage] = useState(null); // { status, schoolPhone } for the message screen
  const [loadTry, setLoadTry] = useState(0);
  const [form, setForm] = useState(null); // the GET answer (readForm)
  const [times, setTimes] = useState([]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(emptyFillValues);
  const [touched, setTouched] = useState(() => new Set()); // fields the family filled and left
  const [tried, setTried] = useState(() => new Set()); // steps where Next / Submit was pressed
  const [note, setNote] = useState(null); // the message over the step after a refused Submit
  const [sending, setSending] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [sent, setSent] = useState(null); // { bookings, values } after an ok
  const submissionKey = useRef(newKey());
  const startedAt = useRef(Date.now());
  const headingRef = useRef(null);
  const formRef = useRef(null);
  const turnstileRef = useRef(null);
  const noteRef = useRef(null);

  // ----- Loading the form -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = slug ? await getForm(slug) : { status: 'not_found' };
      if (cancelled) return;
      if (answer.status === 'ok') {
        setForm(answer);
        setTimes(answer.times);
        setScreen('form');
      } else {
        setMessage(answer);
        setScreen('message');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, loadTry]);

  // The tab's title names the form once it's known.
  useEffect(() => {
    document.title = form?.formName ? `${form.formName} · ${T.SCHOOL}` : T.SCHOOL;
  }, [form]);

  // A new step (or the thank-you screen): start at the top, focus the heading so screen readers
  // announce it. (Not the first field: on a phone that would pop the keyboard up at once.)
  useEffect(() => {
    if (screen !== 'form' && screen !== 'done') return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [screen, step]);

  const steps = form ? stepsFor(form.fields) : [];
  const last = step === steps.length - 1;
  const current = steps[Math.min(step, steps.length - 1)];

  // Leaving the last step removes the Turnstile box.
  useEffect(() => {
    if (screen !== 'form' || !last) removeTurnstile();
  }, [screen, last]);

  // The problems on this step right now, and the ones to show: a field's problem shows once the
  // family has filled it and left it (so errors appear as they type), and every problem shows
  // after Next / Submit was pressed on this step.
  const problems = current ? stepProblems(current.fields, form.fields, values, times) : {};
  const shown = Object.fromEntries(Object.entries(problems).filter(([key]) => tried.has(step) || touched.has(key)));

  function onChange(patch) {
    if (sending) return;
    setValues((v) => ({ ...v, ...patch }));
    if (note === 'TIME_TAKEN' && patch.bookings) setNote(null);
  }

  // When the family leaves a field they filled in, its problems start to show.
  function onLeave(e) {
    const el = e.target;
    const raw = (el.id || el.name || '').startsWith(`${ID_BASE}-`) ? (el.id || el.name).slice(ID_BASE.length + 1) : null;
    if (!raw || raw.startsWith('book-')) return;
    let key = raw;
    if (raw.startsWith('child-')) {
      if (!raw.endsWith('-age') || el.value === '') return; // a child counts once its age is typed
      key = 'children';
    } else if (isEmpty(values.answers[raw])) return; // an empty field waits for Next
    if (!touched.has(key)) setTouched((t) => new Set(t).add(key));
  }

  // Puts keyboard focus on the first field with a problem (after a failed Next / Submit).
  function focusFirstProblem() {
    window.requestAnimationFrame(() => {
      const root = formRef.current;
      const target = root?.querySelector('[aria-invalid="true"], .notice')?.closest('.field, fieldset, .fchildren, .fwaiver')?.querySelector('input:not([disabled]), select, textarea, button.dp-field:not([aria-disabled="true"])');
      target?.focus();
      target?.scrollIntoView?.({ block: 'center' });
    });
  }

  function showNote(code) {
    setNote(code);
    window.requestAnimationFrame(() => noteRef.current?.focus());
  }

  function onNext(e) {
    e.preventDefault();
    if (sending) return;
    setTried((t) => new Set(t).add(step));
    if (Object.keys(problems).length > 0) {
      focusFirstProblem();
      return;
    }
    if (last) {
      submit();
      return;
    }
    setNote(null);
    setStep(step + 1);
  }

  function onBack() {
    if (sending) return;
    setNote(null);
    setStep(Math.max(0, step - 1));
  }

  async function submit() {
    setSending(true);
    setNote(null);
    try {
      // 1. The "are you human?" token, asked for now (it can be used once, for 5 minutes).
      let token = '';
      if (!isPreview) {
        try {
          token = await getTurnstileToken(form.turnstileSiteKey, turnstileRef.current);
        } catch {
          showNote('VERIFY_FAILED');
          return;
        }
      }
      // 2. The same payload as the staff Fill in (useFillIn.js).
      const v = values;
      const children = v.children.map((c) => ({ first_name: cleanText(c.first_name), age: c.age }));
      const bookings = Object.entries(v.bookings)
        .filter(([i, key]) => isTimeKey(key) && Number(i) < children.length)
        .map(([i, key]) => {
          const [classId, date, start] = key.split('|');
          return { child: Number(i), class_id: classId, date, starts_at: start };
        });
      const hasWaiver = form.fields.some((f) => f.type === 'waiver' && v.answers[f.id] === true);
      const answer = await submitForm(slug, {
        submission_key: submissionKey.current,
        published_version: form.publishedVersion,
        answers: cleanAnswers(form.fields, v.answers),
        children,
        bookings,
        signature: hasWaiver ? v.signature : null,
        website: honeypot,
        started_at: startedAt.current,
        sent_at: Date.now(),
        turnstile_token: token,
        ...(kiosk ? { kiosk_token: kiosk.token } : {}),
      });
      await handleAnswer(answer);
    } finally {
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Submit makes a new one
    }
  }

  async function handleAnswer(answer) {
    // The kiosk's kiosk mode had ended and the server's fall-back didn't save it either: the
    // tablet shows its ended screen from the next family on (security review M2).
    if (kiosk && answer.kioskEnded && answer.status !== 'ok') kiosk.onEnded?.();
    switch (answer.status) {
      case 'ok':
        setSent({ bookings: answer.bookings, values, kioskEnded: answer.kioskEnded === true });
        setScreen('done');
        return;
      case 'time_taken': {
        // Fresh times (from the answer, or loaded again); picks that are gone are cleared, and
        // the family goes back to the booking step. A new key: this attempt saved nothing.
        let fresh = answer.times;
        if (!fresh) {
          const again = await getForm(slug);
          fresh = again.status === 'ok' ? again.times : [];
        }
        const keys = new Set(fresh.map((t) => `${t.classId}|${t.date}|${t.start}`));
        setTimes(fresh);
        setValues((v) => ({ ...v, bookings: Object.fromEntries(Object.entries(v.bookings).filter(([, key]) => key === NO_TIME_KEY || keys.has(key))) }));
        submissionKey.current = newKey();
        const bookingStep = stepsFor(form.fields).findIndex((s) => s.fields.some((f) => f.type === 'booking'));
        if (bookingStep >= 0) setStep(bookingStep);
        showNote('TIME_TAKEN');
        return;
      }
      case 'form_changed': {
        // Staff published a new version meanwhile: load it, keep what was typed, start again
        // from step 1 so the family sees any new question.
        const again = await getForm(slug);
        if (again.status === 'ok') {
          setForm(again);
          setTimes(again.times);
          setTried(new Set());
          setStep(0);
          submissionKey.current = newKey();
          showNote('FORM_CHANGED');
        } else if (['closed', 'not_found', 'not_open'].includes(again.status)) {
          setMessage(again);
          setScreen('message');
        } else showNote('SEND_FAILED');
        return;
      }
      case 'closed':
      case 'not_found':
      case 'not_open':
        setMessage(answer.status === 'closed' ? { status: 'closed', schoolPhone: form.schoolPhone } : answer);
        setScreen('message');
        return;
      case 'rate_limited':
        showNote('RATE_LIMITED');
        return;
      case 'verify_failed':
        showNote('VERIFY_FAILED');
        return;
      case 'invalid':
        submissionKey.current = newKey();
        showNote('SEND_INVALID');
        return;
      default:
        // network, unavailable, bad_request: nothing was saved (or it was, and the SAME key
        // makes a repeat Submit answer "ok" without saving twice).
        showNote('SEND_FAILED');
    }
  }

  // ----- Drawing -----
  let content;
  if (screen === 'loading') {
    content = <p className="fp-loading" role="status">{T.LOADING}</p>;
  } else if (screen === 'message') {
    content = <Message answer={message} onRetry={() => { setScreen('loading'); setLoadTry((n) => n + 1); }} />;
  } else if (screen === 'done') {
    content = <ThankYou form={form} sent={sent} headingRef={headingRef} kiosk={kiosk} />;
  } else {
    const hasBooking = current.fields.some((f) => f.type === 'booking');
    content = (
      <section className="fp-card" aria-labelledby="fp-title">
        {steps.length > 1 && (
          <div className="fprogress fp-progress" role="img" aria-label={T.progressLabel(step + 1, steps.length)}>
            {steps.map((s, i) => (
              <i key={s.id} className={i <= step ? 'is-on' : ''} />
            ))}
          </div>
        )}
        {/* The heading is the step's name, "Step n of N" under it (Jeffrey, F3 difference 1).
            A one-step form has no step names, so it shows the form's name instead. */}
        <h1 id="fp-title" className="fp-title" ref={headingRef} tabIndex={-1} aria-describedby={steps.length > 1 ? 'fp-step' : undefined}>
          {steps.length > 1 ? current.label : form.formName}
        </h1>
        {steps.length > 1 && <p id="fp-step" className="fp-step">{T.stepOf(step + 1, steps.length)}</p>}
        {note && (
          <div className="fp-note" ref={noteRef} tabIndex={-1}>
            <Notice>{T[note]}</Notice>
          </div>
        )}
        <form ref={formRef} onSubmit={onNext} onBlur={onLeave} noValidate autoComplete={kiosk ? 'off' : undefined}>
          <FormFields
            inlineDates
            fields={current.fields}
            values={values}
            problems={shown}
            times={hasBooking ? times : null}
            readOnly={sending}
            idBase={ID_BASE}
            noTimesText={T.NO_OPEN_TIMES}
            noAutofill={Boolean(kiosk)}
            onAnswer={(id, value) => onChange({ answers: { ...values.answers, [id]: value } })}
            onChildren={(children) => onChange({ children })}
            onBooking={(i, key) => onChange({ bookings: { ...values.bookings, [i]: key || undefined } })}
            onSignature={(signature) => onChange({ signature })}
          />
          {/* The honeypot: hidden from people (and screen readers); bots fill it in. */}
          <div className="fp-hp" aria-hidden="true">
            <label htmlFor="pf-website">Website</label>
            <input id="pf-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          {tried.has(step) && Object.keys(problems).length > 0 && <p className="fp-fix" role="status">{T.FIX_ABOVE}</p>}
          {last && <div className="fp-turnstile" ref={turnstileRef} />}
          <div className={`fp-actions${step === 0 ? ' fp-actions--first' : ''}`}>
            {step > 0 && (
              <button type="button" className="btn fp-btn" disabled={sending} onClick={onBack}>
                {T.BACK}
              </button>
            )}
            <button type="submit" className="btn btn-primary fp-btn fp-btn--main" aria-disabled={sending ? 'true' : undefined}>
              {last ? (sending ? T.SENDING : T.SEND) : T.CONTINUE}
            </button>
          </div>
          {last && <p className="fp-privacy">{T.PRIVACY}</p>}
        </form>
      </section>
    );
  }

  return (
    <>
      {isPreview && !kiosk ? <PreviewStrip /> : null}
      <Header schoolName={form?.schoolName ?? message?.schoolName ?? null} />
      <main className="fp-main">{content}</main>
    </>
  );
}

// The "can't sign up" screens and "didn't load". `answer` is the GET (or POST) answer.
function Message({ answer, onRetry }) {
  const status = answer?.status;
  if (status === 'closed') {
    // The school phone from Settings → Schools is a tap-to-call link (F3 difference 4).
    const phone = answer.schoolPhone;
    const text = phone ? (
      <>
        {T.CALL_BEFORE}
        <a className="fp-tel" href={T.telHref(phone)}>
          {phone}
        </a>
        {T.CALL_AFTER}
      </>
    ) : (
      T.CLOSED_NO_PHONE
    );
    return <StateMessage title={T.CLOSED_TITLE} text={text} />;
  }
  if (status === 'not_found') return <StateMessage title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  if (status === 'not_open') return <StateMessage title={T.OFF_TITLE} text={T.OFF_TEXT} />;
  return (
    <StateMessage title={T.LOAD_FAILED_TITLE} text={status === 'rate_limited' ? T.RATE_LIMITED : T.LOAD_FAILED_TEXT}>
      <button type="button" className="btn btn-primary fp-btn fp-btn--main" onClick={onRetry}>
        {T.TRY_AGAIN}
      </button>
    </StateMessage>
  );
}
