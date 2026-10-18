// RegisterApp.jsx — the whole family registration page (/register/<code>).
// Why it exists: families register a student for a color belt testing from a link or QR code
// (rulebook v0.131–v0.132, contract 0005 §4.1). This file decides which screen shows:
//   loading → can't-register message (F11–F15) or step 1 (F1–F3) → step 2 (F4–F6, F9, F10)
//   → registered (F7, F8) → "Register another student" → step 1 again (Paying by kept).
// It holds the form's values and sends the registration; the screens draw them.
//
// What is sent (POST /api/register/<code>, checked again by the Function and the database):
//   submission_id   a random id made by this page for this student; a repeat Send (e.g. after
//                   a dropped connection) reuses it, so the database never saves the student
//                   twice — it answers with the first registration instead
//   first_name, last_name, event_rank_id, paying_by ('cash' | 'check'), stripes (true)
//   signature       the drawn signature as a PNG data URL (≤ 70 000 characters)
//   ack_version     which confirmation wording was ticked (eventRules.ACK_VERSION)
//   website         the hidden "honeypot" field — always empty for people
//   started_at, sent_at   when this student's form was started and when Send was tapped (ms)
//   turnstile_token the one-time "are you human?" token (not used in preview mode)
import { useCallback, useEffect, useRef, useState } from 'react';
import { EventBox, Header, PreviewStrip, StateMessage } from './parts.jsx';
import StepDetails from './StepDetails.jsx';
import StepCheck from './StepCheck.jsx';
import Registered from './Registered.jsx';
import { getEvent, sendRegistration } from './api.js';
import { getTurnstileToken, removeTurnstile } from './turnstile.js';
import { addToVisit, loadVisit } from './visit.js';
import { longDate } from './format.js';
import { nameProblem, normalizeName } from '../lib/testing/names.js';
import {
  ACK_VERSION,
  PREVIEW_TODAY_KEY,
  publicStateFor,
  SIGNATURE_MAX_LENGTH,
  signatureIsValid,
  todayInSchoolTime,
} from '../lib/testing/eventRules.js';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';

// The event code from the address: /register/p4w9tdx2 → "p4w9tdx2" (null if there is none).
function codeFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('register');
  const raw = at >= 0 ? parts[at + 1] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

// Today at the school. In preview mode the staff preview can pretend it's another day
// (__tkdPreview.setToday), so the page follows the same pretend date.
function schoolToday() {
  if (isPreview) {
    try {
      const pretend = window.localStorage.getItem(PREVIEW_TODAY_KEY);
      if (pretend) return pretend;
    } catch {
      // storage blocked: use the real date
    }
  }
  return todayInSchoolTime();
}

// A fresh student form (Paying by can be carried over from the previous student, F8).
const emptyForm = (payingBy = null) => ({ first: '', last: '', classIndex: null, rankId: null, stripes: false, payingBy });
const newSubmissionId = () => crypto.randomUUID();

// What's wrong with step 1, as words (null = fine). The same name rules as the database.
function detailsErrors(form, classes) {
  const nameError = (value, emptyText) => {
    const problem = nameProblem(value);
    if (problem === 'empty') return emptyText;
    if (problem === 'tooLong') return T.ERR_NAME_TOO_LONG;
    if (problem === 'badCharacter') return T.ERR_NAME_BAD_CHARACTER;
    return null;
  };
  const cls = form.classIndex === null ? null : classes[form.classIndex];
  return {
    first: nameError(form.first, T.ERR_FIRST),
    last: nameError(form.last, T.ERR_LAST),
    class: cls ? null : T.ERR_CLASS,
    belt: cls && !cls.ranks.some((r) => r.event_rank_id === form.rankId) ? T.ERR_BELT : null,
    stripes: cls && !form.stripes ? T.ERR_STRIPES : null,
    paying: form.payingBy ? null : T.ERR_PAYING,
  };
}

// The order errors are focused in (top of the form first).
const FIELD_ORDER = ['first', 'last', 'class', 'belt', 'stripes', 'paying'];
const NO_ERRORS_SHOWN = { first: false, last: false, class: false, belt: false, stripes: false, paying: false };

export default function RegisterApp() {
  const [code] = useState(codeFromAddress);
  const [loaded, setLoaded] = useState(null); // the GET answer
  const [loadTry, setLoadTry] = useState(0); // bump to load again ("Try again")
  const [screen, setScreen] = useState('loading'); // loading | message | details | check | done

  const [form, setForm] = useState(() => emptyForm());
  const [visible, setVisible] = useState(NO_ERRORS_SHOWN);
  const [honeypot, setHoneypot] = useState('');
  const startedAt = useRef(Date.now());
  const submissionId = useRef(newSubmissionId());

  const [ack, setAck] = useState(false);
  const [checkErrors, setCheckErrors] = useState({ ack: null, signature: null });
  const [banner, setBanner] = useState(null);
  const [sending, setSending] = useState(false);
  const [hasTried, setHasTried] = useState(false);

  const [result, setResult] = useState(null); // the ok answer
  const [visit, setVisit] = useState(() => (code ? loadVisit(code) : []));

  const headingRef = useRef(null);
  const detailRefs = { first: useRef(null), last: useRef(null), class: useRef(null), belt: useRef(null), stripes: useRef(null), paying: useRef(null) };
  const checkRefs = { ack: useRef(null), signature: useRef(null), turnstile: useRef(null), banner: useRef(null) };

  // ----- Loading the event -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = code ? await getEvent(code) : { status: 'not_found' };
      if (cancelled) return;
      setLoaded(answer);
      setScreen(answer.status === 'ok' && publicState(answer) === 'open' ? 'details' : 'message');
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loadTry]);

  // The tab's title names the event once it's known.
  useEffect(() => {
    const name = loaded?.event?.name;
    document.title = name ? `${name} · ${T.PAGE_KIND}` : T.PAGE_KIND;
  }, [loaded]);

  // When the screen changes: start at the top and move keyboard focus to its heading, so
  // screen readers announce the new step.
  useEffect(() => {
    if (screen === 'loading' || screen === 'message') return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [screen]);

  // Leaving step 2 removes the Turnstile widget.
  useEffect(() => {
    if (screen !== 'check') removeTurnstile();
  }, [screen]);

  const event = loaded?.event ?? null;
  const classes = loaded?.classes ?? [];
  const today = schoolToday();
  const onTestingDay = event ? today >= event.testing_date : false;
  const cls = form.classIndex === null ? null : classes[form.classIndex];
  const rank = cls?.ranks.find((r) => r.event_rank_id === form.rankId) ?? null;
  const errors = detailsErrors(form, classes);

  const update = useCallback((changes) => setForm((f) => ({ ...f, ...changes })), []);

  // ----- Step 1 -----
  const onLeaveName = (field) => setVisible((v) => ({ ...v, [field]: true }));

  const onContinue = () => {
    const all = { first: true, last: true, class: true, belt: true, stripes: true, paying: true };
    setVisible(all);
    const firstBad = FIELD_ORDER.find((field) => errors[field]);
    if (firstBad) {
      detailRefs[firstBad].current?.focus();
      return;
    }
    setBanner(null);
    setCheckErrors({ ack: null, signature: null });
    setScreen('check');
  };

  // ----- Step 2 -----
  const onSignatureChange = (drawn) => {
    if (drawn) setCheckErrors((e) => ({ ...e, signature: null }));
  };

  const onAckChange = (value) => {
    setAck(value);
    if (value) setCheckErrors((e) => ({ ...e, ack: null }));
  };

  const onBack = () => {
    setBanner(null);
    setHasTried(false);
    setScreen('details');
  };

  const showBanner = (code) => {
    setBanner(code);
    setHasTried(true);
    window.scrollTo(0, 0);
    // Let React draw the banner first, then move focus to it.
    setTimeout(() => checkRefs.banner.current?.focus({ preventScroll: true }), 0);
  };

  const onSend = async () => {
    if (sending) return;
    // 1. The tick and the signature (F5).
    const pad = checkRefs.signature.current;
    const empty = !pad || pad.isEmpty();
    let signature = null;
    let signatureError = empty ? T.ERR_SIGNATURE : null;
    if (!empty) {
      signature = pad.toDataUrl();
      // The database refuses pictures over 70 000 characters (contract 0005 §4.1).
      if (signature.length > SIGNATURE_MAX_LENGTH || !signatureIsValid(signature)) signatureError = T.ERR_SIGNATURE_TOO_BIG;
    }
    const nextErrors = { ack: ack ? null : T.ERR_ACK, signature: signatureError };
    setCheckErrors(nextErrors);
    if (nextErrors.ack) {
      checkRefs.ack.current?.focus();
      return;
    }
    if (nextErrors.signature) return;

    setSending(true);
    try {
      // 2. The "are you human?" token, asked for now (it can be used once, for 5 minutes).
      let token = '';
      if (!isPreview) {
        try {
          token = await getTurnstileToken(loaded.turnstile_site_key, checkRefs.turnstile.current);
        } catch {
          showBanner('verify');
          return;
        }
      }

      // 3. Send.
      const body = {
        submission_id: submissionId.current,
        first_name: normalizeName(form.first),
        last_name: normalizeName(form.last),
        event_rank_id: form.rankId,
        paying_by: form.payingBy,
        stripes: form.stripes,
        signature,
        ack_version: ACK_VERSION,
        website: honeypot,
        started_at: startedAt.current,
        sent_at: Date.now(),
        turnstile_token: token,
      };
      const answer = await sendRegistration(code, body);
      handleAnswer(answer);
    } finally {
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Send makes a new one
    }
  };

  const handleAnswer = (answer) => {
    switch (answer.status) {
      case 'ok': {
        const entry = {
          name: `${answer.first_name} ${answer.last_name}`,
          from: rank.name,
          to: answer.testing_for?.name ?? null,
          earlyCents: answer.early_cents,
          dayCents: answer.day_cents,
          payingBy: answer.paying_by,
          reference: answer.reference,
        };
        setVisit(addToVisit(code, entry));
        setResult(answer);
        setScreen('done');
        return;
      }
      case 'not_found':
        // The event was deleted while they were filling in: the "link not working" page.
        setLoaded({ status: 'not_found' });
        setScreen('message');
        return;
      case 'closed':
      case 'not_open':
      case 'finished':
        showBanner('closed'); // F10
        return;
      case 'verify_failed':
        showBanner('verify');
        return;
      case 'rate_limited':
        showBanner('rate');
        return;
      default:
        // invalid, bad_request, unavailable, network — F9 "wasn't sent … nothing is lost".
        showBanner('failed');
    }
  };

  // ----- Registered → another student -----
  const onAnother = () => {
    setForm(emptyForm(form.payingBy)); // F8: Paying by is kept
    setVisible(NO_ERRORS_SHOWN);
    setAck(false);
    setCheckErrors({ ack: null, signature: null });
    setBanner(null);
    setHasTried(false);
    setResult(null);
    startedAt.current = Date.now();
    submissionId.current = newSubmissionId();
    setScreen('details');
  };

  // ----- Drawing -----
  let content;
  if (screen === 'loading') {
    content = <p className="reg-loading" role="status">{T.LOADING}</p>;
  } else if (screen === 'message') {
    content = <Message answer={loaded} onRetry={() => { setScreen('loading'); setLoadTry((n) => n + 1); }} />;
  } else if (screen === 'details') {
    content = (
      <>
        <EventBox event={event} showRegisterBy />
        <StepDetails
          event={event}
          classes={classes}
          form={form}
          update={update}
          errors={errors}
          visible={visible}
          onLeaveName={onLeaveName}
          onContinue={onContinue}
          onTestingDay={onTestingDay}
          refs={detailRefs}
          headingRef={headingRef}
          honeypot={honeypot}
          setHoneypot={setHoneypot}
        />
      </>
    );
  } else if (screen === 'check') {
    content = (
      <StepCheck
        event={event}
        cls={cls}
        rank={rank}
        form={form}
        onTestingDay={onTestingDay}
        ack={ack}
        setAck={onAckChange}
        errors={checkErrors}
        banner={banner}
        sending={sending}
        hasTried={hasTried}
        onSignatureChange={onSignatureChange}
        onSend={onSend}
        onBack={onBack}
        refs={checkRefs}
        headingRef={headingRef}
      />
    );
  } else {
    content = (
      <Registered
        eventName={event.name}
        result={result}
        fromRank={rank}
        visit={visit}
        onTestingDay={onTestingDay}
        onAnother={onAnother}
        headingRef={headingRef}
      />
    );
  }

  return (
    <>
      {isPreview ? <PreviewStrip /> : null}
      <Header />
      <main className="reg-main">{content}</main>
    </>
  );
}

// The server sends the PUBLIC state words already (contract 0005 §1.3): 'open' | 'not_open' |
// 'closed' (+ closed_on) | 'finished'. Just in case it ever sends one of the two internal-only
// words instead, those are translated with the shared rule.
const INTERNAL_ONLY = ['closed_by_date', 'not_open_yet'];
function publicView(answer) {
  const state = answer?.state;
  if (INTERNAL_ONLY.includes(state)) return publicStateFor(state, answer.event);
  return { state, closedOn: answer?.closed_on ?? null };
}
const publicState = (answer) => publicView(answer).state;

// F11–F15 and "didn't load". `answer` is the GET answer (or { status: 'not_found' }).
function Message({ answer, onRetry }) {
  const status = answer?.status === 'ok' ? publicState(answer) : answer?.status;
  const event = answer?.status === 'ok' ? answer.event : null; // no event box without event details
  const closedOn = answer?.status === 'ok' ? publicView(answer).closedOn : null;

  let box;
  if (status === 'not_open') box = <StateMessage title={T.NOT_OPEN_TITLE} text={T.NOT_OPEN_TEXT} />;
  else if (status === 'closed') box = <StateMessage title={T.CLOSED_TITLE} text={closedOn ? T.closedOn(longDate(closedOn)) : T.CLOSED_TEXT} />;
  else if (status === 'finished') box = <StateMessage title={T.FINISHED_TITLE} text={T.FINISHED_TEXT} />;
  else if (status === 'not_found') box = <StateMessage title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  else
    box = (
      <StateMessage title={T.LOAD_FAILED_TITLE} text={T.LOAD_FAILED_TEXT}>
        <button type="button" className="reg-btn reg-btn--primary reg-btn--main" onClick={onRetry}>
          {T.TRY_AGAIN}
        </button>
      </StateMessage>
    );
  return (
    <>
      <EventBox event={event} showRegisterBy={false} />
      {box}
    </>
  );
}
