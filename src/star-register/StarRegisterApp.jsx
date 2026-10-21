// StarRegisterApp.jsx — the whole Star testing family registration page (/star/<code>).
// Why it exists: families register a candidate for a Star testing from their school's link or QR
// code (rulebook v0.93–v0.107, v0.510; contract 0006 §8). Each school has its own link and the link
// sets the candidate's school (v0.98). This file decides which screen shows:
//   loading (F5) → can't-register / too many tries / didn't load (screen 11, F2, F4) or step 1
//   (screens 1–5) → step 2 (screens 6–8, 12, 13, F1, F4) → registered (9) → "Register another
//   candidate" → step 1 again with the email and Paying by kept (screen 10, v0.93).
// It holds the form's values and sends the registration; the screens draw them.
//
// What is sent (POST /api/star/<code>, checked again by the Function and the database, §8.3):
//   submission_id   a random id made by this page for this candidate, kept ONLY in memory; a repeat
//                   Send (e.g. after a dropped connection) reuses it, so the database never saves the
//                   candidate twice — it answers with the first registration instead. A new one is
//                   made straight after an ok answer (and for Register another).
//   first_name, last_name, date_of_birth ('YYYY-MM-DD'), email, dan, stars_from,
//   paying_by ('cash' | 'check'), acknowledged (true)
//   signature       the drawn signature as a PNG data URL (≤ 70 000 characters)
//   ack_version     which acknowledgment wording was ticked (STAR_ACK_VERSION)
//   website         the hidden "honeypot" field — always empty for people
//   started_at, sent_at   when this candidate's form was started and when Send was tapped (ms)
//   turnstile_token the one-time "are you human?" token (action star_register; not in preview)
// Nothing typed here is stored in the browser: the "Registered on this visit" list (visit.js, this
// tab's sessionStorage only) keeps names, Dans, prices and references — never the date of birth,
// the email or the signature.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Header, PreviewStrip } from './Header.jsx';
import { EventBox, Loading, Message } from './parts.jsx';
import StepDetails from './StepDetails.jsx';
import StepCheck from './StepCheck.jsx';
import Registered from './Registered.jsx';
import { getEvent, sendRegistration } from './api.js';
import { getTurnstileToken, removeTurnstile } from './turnstile.js';
import { addToVisit, loadVisit } from '../register/visit.js';
import { nameProblem, normalizeName } from '../lib/testing/names.js';
import { PREVIEW_TODAY_KEY, SIGNATURE_MAX_LENGTH, signatureIsValid, todayInSchoolTime, isIsoDate } from '../lib/testing/eventRules.js';
import { STAR_ACK_VERSION } from '../lib/star/starEventRules.js';
import { starEmailIsValid, trimEmail } from '../lib/star/emailRule.js';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';

// The event code from the address: /star/fa2kxm7p → "fa2kxm7p" (null if there is none).
function codeFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('star');
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
      if (isIsoDate(pretend)) return pretend;
    } catch {
      // storage blocked: use the real date
    }
  }
  return todayInSchoolTime();
}

// A fresh candidate form (the email and Paying by are carried over by Register another, v0.93).
const emptyForm = (email = '', payingBy = null) => ({ first: '', last: '', dob: '', dan: null, stars: null, email, payingBy });
const newSubmissionId = () => crypto.randomUUID();
// The visit list is kept per link, apart from Color Belt's (visit.js adds its own prefix).
const visitKey = (code) => `star.${code}`;

// What's wrong with step 1, as words (null = fine). The same rules as the database (§8.3 step 5–6).
function detailsErrors(form, dans, today) {
  const nameError = (value, emptyText) => {
    const problem = nameProblem(value);
    if (problem === 'empty') return emptyText;
    if (problem === 'tooLong') return T.ERR_NAME_TOO_LONG;
    if (problem === 'badCharacter') return T.ERR_NAME_BAD_CHARACTER;
    return null;
  };
  const dan = dans.find((d) => d.dan === form.dan) ?? null;
  const email = trimEmail(form.email);
  return {
    first: nameError(form.first, T.ERR_FIRST),
    last: nameError(form.last, T.ERR_LAST),
    dob: isIsoDate(form.dob) && form.dob <= today ? null : T.ERR_DOB,
    dan: dan ? null : T.ERR_DAN,
    stars: dan && !(Number.isInteger(form.stars) && form.stars >= 0 && form.stars < dan.star_limit) ? T.ERR_STARS : null,
    email: email === '' ? T.ERR_EMAIL_EMPTY : starEmailIsValid(email) ? null : T.ERR_EMAIL,
    paying: form.payingBy ? null : T.ERR_PAYING,
  };
}

// The order errors are focused in (top of the form first).
const FIELD_ORDER = ['first', 'last', 'dob', 'dan', 'stars', 'email', 'paying'];
const NO_ERRORS_SHOWN = Object.fromEntries(FIELD_ORDER.map((f) => [f, false]));
const ALL_ERRORS_SHOWN = Object.fromEntries(FIELD_ORDER.map((f) => [f, true]));

export default function StarRegisterApp() {
  const [code] = useState(codeFromAddress);
  const [loaded, setLoaded] = useState(null); // the GET answer
  const [loadTry, setLoadTry] = useState(0); // bump to load again ("Try again")
  const [screen, setScreen] = useState('loading'); // loading | message | details | check | done

  const [form, setForm] = useState(() => emptyForm());
  const [visible, setVisible] = useState(NO_ERRORS_SHOWN);
  const [honeypot, setHoneypot] = useState('');
  const startedAt = useRef(Date.now());
  const submissionId = useRef(newSubmissionId()); // memory only (never stored in the browser)

  const [ack, setAck] = useState(false);
  const [checkErrors, setCheckErrors] = useState({ ack: null, signature: null });
  const [banner, setBanner] = useState(null);
  const [sending, setSending] = useState(false);
  const [hasTried, setHasTried] = useState(false);

  const [result, setResult] = useState(null); // the ok answer
  const [sentEmail, setSentEmail] = useState(''); // the email the Results line shows
  const [another, setAnother] = useState(false); // the form after Register another (screen 10)
  const [visit, setVisit] = useState(() => (code ? loadVisit(visitKey(code)) : []));

  const headingRef = useRef(null);
  const detailRefs = {
    first: useRef(null), last: useRef(null), dob: useRef(null), dan: useRef(null), stars: useRef(null), email: useRef(null), paying: useRef(null),
  };
  const checkRefs = { ack: useRef(null), signature: useRef(null), turnstile: useRef(null), banner: useRef(null) };

  // ----- Loading the event -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = code ? await getEvent(code) : { status: 'not_found' };
      if (cancelled) return;
      setLoaded(answer);
      setScreen(answer.status === 'ok' && answer.state === 'open' ? 'details' : 'message');
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

  // When the screen changes: start at the top and move keyboard focus to its heading, so screen
  // readers announce the new step.
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
  const school = loaded?.school ?? null;
  const dans = loaded?.dans ?? [];
  const today = schoolToday();
  const onTestingDay = event ? today >= event.testing_date : false;
  const dan = dans.find((d) => d.dan === form.dan) ?? null;
  const errors = detailsErrors(form, dans, today);

  const update = useCallback((changes) => setForm((f) => ({ ...f, ...changes })), []);

  // ----- Step 1 -----
  const onLeave = (field) => setVisible((v) => ({ ...v, [field]: true }));

  const onContinue = () => {
    setVisible(ALL_ERRORS_SHOWN);
    const firstBad = FIELD_ORDER.find((field) => errors[field]);
    if (firstBad) {
      // The date of birth is a button inside its field box; everything else has its own ref.
      const target = firstBad === 'dob' ? document.getElementById('sreg-dob') : detailRefs[firstBad].current;
      target?.focus();
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

  const showBanner = (kind) => {
    setBanner(kind);
    setHasTried(true);
    if (kind !== 'verify') window.scrollTo(0, 0); // the verify box sits just above Send
    // Let React draw the message first, then move focus to it.
    setTimeout(() => checkRefs.banner.current?.focus({ preventScroll: kind !== 'verify' }), 0);
  };

  const onSend = async () => {
    if (sending) return;
    // 1. The tick and the signature (screen 7).
    const pad = checkRefs.signature.current;
    const empty = !pad || pad.isEmpty();
    let signature = null;
    let signatureError = empty ? T.ERR_SIGNATURE : null;
    if (!empty) {
      signature = pad.toDataUrl();
      // The database refuses pictures over 70 000 characters (contract 0006 §1.2).
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
        date_of_birth: form.dob,
        email: trimEmail(form.email),
        dan: form.dan,
        stars_from: form.stars,
        paying_by: form.payingBy,
        acknowledged: true,
        signature,
        ack_version: STAR_ACK_VERSION,
        website: honeypot,
        started_at: startedAt.current,
        sent_at: Date.now(),
        turnstile_token: token,
      };
      const answer = await sendRegistration(code, body);
      handleAnswer(answer, body.email);
    } finally {
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Send makes a new one
    }
  };

  const handleAnswer = (answer, email) => {
    switch (answer.status) {
      case 'ok': {
        submissionId.current = newSubmissionId(); // this one is used up (security review)
        const entry = {
          name: `${answer.first_name} ${answer.last_name}`,
          danLabel: answer.dan_label,
          earlyCents: answer.standard_cents,
          dayCents: answer.same_day_cents,
          payingBy: answer.paying_by,
          reference: answer.reference,
        };
        setVisit(addToVisit(visitKey(code), entry));
        setResult(answer);
        setSentEmail(email);
        setBanner(null);
        setScreen('done');
        return;
      }
      case 'not_found':
        // The event was deleted while they were filling in: the "link isn't working" page.
        setLoaded({ status: 'not_found' });
        setScreen('message');
        return;
      case 'closed':
      case 'not_open':
      case 'finished':
        showBanner('closed'); // screen 13
        return;
      case 'verify_failed':
        showBanner('verify'); // screen 8
        return;
      case 'rate_limited':
        showBanner('rate'); // F4
        return;
      default:
        // invalid, bad_request, unavailable, network — screen 12 "wasn't sent … nothing is lost".
        showBanner('failed');
    }
  };

  // ----- Registered → another candidate -----
  const onAnother = () => {
    setForm(emptyForm(form.email, form.payingBy)); // screen 10: email and Paying by are kept
    setAnother(true);
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
    content = <Loading />;
  } else if (screen === 'message') {
    content = (
      <Message
        answer={loaded}
        onRetry={() => {
          setScreen('loading');
          setLoadTry((n) => n + 1);
        }}
      />
    );
  } else if (screen === 'details') {
    content = (
      <>
        <EventBox event={event} showRegisterBy />
        <StepDetails
          dans={dans}
          form={form}
          update={update}
          errors={errors}
          visible={visible}
          onLeave={onLeave}
          onContinue={onContinue}
          onTestingDay={onTestingDay}
          today={today}
          refs={detailRefs}
          headingRef={headingRef}
          honeypot={honeypot}
          setHoneypot={setHoneypot}
          another={another}
        />
      </>
    );
  } else if (screen === 'check') {
    content = (
      <StepCheck
        event={event}
        school={school}
        dan={dan}
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
        result={result}
        email={sentEmail}
        visit={visit}
        onTestingDay={onTestingDay}
        onAnother={onAnother}
        headingRef={headingRef}
      />
    );
  }

  return (
    <div className="sreg">
      {isPreview ? <PreviewStrip /> : null}
      <Header />
      <main className="reg-main">{content}</main>
    </div>
  );
}
