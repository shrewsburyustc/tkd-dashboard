// FormApp.jsx — the whole Black Belt family registration page (/black-belt/<code>).
// Why it exists: families register a candidate for a Black Belt testing cycle from a link or
// QR code (rulebook v0.211–v0.218, v0.900, v0.905; contract 0016-B1 §4; mockups Form 1–9).
// The link's code sets the cycle AND the school (each school has its own link); ?dan=1…4 at
// the end of the link chooses the Dan in advance. This file decides which screen shows:
//   loading → can't-register message (Form 8) or step 1 (Form 1, 2, 4) → step 2 (Form 5, 6, 8)
//   → Registered (Form 7) → "Register another candidate" → step 1 again (email and plan kept).
// It holds the form's values and sends the registration; the screens draw them. The
// requirements panel and the waiver's Read all open over the form (Panel.jsx); while one is
// open the browser history has an extra entry, so the phone's back gesture closes it.
//
// What is sent (POST /api/black-belt/<code>, checked again by the Function and the database —
// exactly these keys, contract §4.4):
//   submission_id   a random id made by this page for this candidate; every retry of the same
//                   candidate (Try again, a double tap) reuses it, so the database never saves
//                   them twice — it answers with the first registration instead. Only
//                   "Register another candidate" makes a new one.
//   first_name, last_name, date_of_birth ('YYYY-MM-DD'), email (trimmed), dan (1–4),
//   cycle_plan_id, kukkiwon (true/false), acknowledged (true)
//   waiver_version  the version name of the waiver this page SHOWED ("2027-1"), never another
//   signer_name     who signs (a parent or guardian for a candidate under 18 on the first day)
//   signature       the drawn signature as a PNG data URL (≤ 70 000 characters)
//   website         the hidden "honeypot" field — always empty for people
//   started_at, sent_at   when this candidate's form was started and when Send was tapped (ms)
//   turnstile_token the one-time "are you human?" token ('' in preview mode)
//
// Privacy: nothing here logs anything; the date of birth, email, signer's name and signature
// live only in this page's memory and the one request (the "this visit" list keeps names,
// Dans, plans, totals and references only — visit.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import CycleBox from './CycleBox.jsx';
import { Header, PreviewStrip, StateMessage } from './parts.jsx';
import StepDetails, { DANS } from './StepDetails.jsx';
import StepCheck from './StepCheck.jsx';
import Registered from './Registered.jsx';
import RequirementsPanel from './RequirementsPanel.jsx';
import WaiverPanel from './WaiverPanel.jsx';
import { getCycle, sendRegistration } from './api.js';
import { getTurnstileToken, removeTurnstile } from './turnstile.js';
import { addToVisit, loadVisit } from './visit.js';
import { ageOn, emailIsValid, firstDayOf, longDay, scheduleFor } from './format.js';
import { nameProblem, normalizeName } from '../../lib/testing/names.js';
import { PREVIEW_TODAY_KEY, SIGNATURE_MAX_LENGTH, signatureIsValid, todayInSchoolTime } from '../../lib/testing/eventRules.js';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';
const DOB_MIN = '1900-01-01';
const PUBLIC_STATES = ['open', 'not_open', 'closed', 'finished'];

// The cycle code from the address: /black-belt/p4w9tdx2 → "p4w9tdx2" (null if there is none).
function codeFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('black-belt');
  const raw = at >= 0 ? parts[at + 1] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

// ?dan=1 … ?dan=4 chooses the Dan in advance; anything else is ignored.
function danFromAddress() {
  try {
    const value = new URLSearchParams(window.location.search).get('dan');
    return ['1', '2', '3', '4'].includes(value) ? Number(value) : null;
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

// A GET answer the form can use: a known state and the cycle's days, plans and the waiver.
function usable(answer) {
  const cycle = answer?.cycle;
  return (
    answer?.status === 'ok' &&
    PUBLIC_STATES.includes(answer.state) &&
    cycle &&
    typeof cycle.name === 'string' &&
    Array.isArray(cycle.days) &&
    Array.isArray(cycle.plans)
  );
}

// A fresh candidate form. Register another keeps the email and the plan (Form 7).
const emptyForm = ({ dan = null, email = '', planId = null } = {}) => ({
  first: '',
  last: '',
  dob: '',
  dan,
  kukkiwon: false, // starts on "No, thanks" (Form 1)
  planId,
  email,
});
const newSubmissionId = () => crypto.randomUUID();

// Words for a name problem (null = fine). The same name rules as the database (names.js).
function nameError(value, emptyText) {
  const problem = nameProblem(value);
  if (problem === 'empty') return emptyText;
  if (problem === 'tooLong') return T.ERR_NAME_TOO_LONG;
  if (problem === 'badCharacter') return T.ERR_NAME_BAD_CHARACTER;
  return null;
}

// What's wrong with step 1, as words (null = fine) — Form 4.
function detailsErrors(form, cycle, today) {
  const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(form.dob) && form.dob >= DOB_MIN && form.dob <= today;
  return {
    first: nameError(form.first, T.ERR_FIRST),
    last: nameError(form.last, T.ERR_LAST),
    dob: dobOk ? null : T.ERR_DOB,
    dan: DANS.includes(form.dan) ? null : T.ERR_DAN,
    plan: (cycle?.plans ?? []).some((p) => p.id === form.planId) ? null : T.ERR_PLAN,
    email: emailIsValid(form.email) ? null : T.ERR_EMAIL,
  };
}

// The order errors are focused in (top of the form first).
const FIELD_ORDER = ['first', 'last', 'dob', 'dan', 'plan', 'email'];
const NO_CHECK_ERRORS = { ack: null, signer: null, signature: null };

export default function FormApp() {
  const [code] = useState(codeFromAddress);
  const [loaded, setLoaded] = useState(null); // the GET answer
  const [loadTry, setLoadTry] = useState(0); // bump to load again ("Try again")
  const [screen, setScreen] = useState('loading'); // loading | message | details | check | done
  const [panel, setPanel] = useState(null); // null | 'requirements' | 'waiver'

  const [form, setForm] = useState(() => emptyForm({ dan: danFromAddress() }));
  const [showErrors, setShowErrors] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const startedAt = useRef(Date.now());
  const submissionId = useRef(newSubmissionId());

  const [ack, setAck] = useState(false);
  const [signer, setSigner] = useState('');
  const lastPrefill = useRef(''); // the signer name the page filled in last (adults)
  const [checkErrors, setCheckErrors] = useState(NO_CHECK_ERRORS);
  const [banner, setBanner] = useState(null);
  const [bannerShown, setBannerShown] = useState(0); // counts banners, so the same one twice refocuses
  const [sending, setSending] = useState(false);
  const sendingNow = useRef(false); // stops a second tap at once, before React redraws
  const [hasTried, setHasTried] = useState(false);

  const [result, setResult] = useState(null); // the ok answer
  const [visit, setVisit] = useState(() => (code ? loadVisit(code) : []));

  const headingRef = useRef(null);
  const detailRefs = { first: useRef(null), last: useRef(null), dob: useRef(null), dan: useRef(null), plan: useRef(null), email: useRef(null) };
  const checkRefs = { ack: useRef(null), signer: useRef(null), signature: useRef(null), turnstile: useRef(null), banner: useRef(null) };

  // ----- Loading the cycle -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = code ? await getCycle(code) : { status: 'not_found' };
      if (cancelled) return;
      const clean = answer?.status === 'ok' && !usable(answer) ? { status: 'unavailable' } : answer;
      setLoaded(clean);
      setScreen(clean.status === 'ok' && clean.state === 'open' && clean.waiver ? 'details' : 'message');
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loadTry]);

  // The tab's title names the cycle once it's known.
  useEffect(() => {
    document.title = T.tabTitle(loaded?.status === 'ok' ? loaded.cycle?.name : null);
  }, [loaded]);

  // When the screen changes: start at the top and move keyboard focus to its heading, so
  // screen readers announce the new step.
  useEffect(() => {
    if (screen === 'loading' || screen === 'message') return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [screen]);

  // A new banner on step 2: back to the top, and keyboard focus on the banner so screen
  // readers read it out. (An effect runs after React has drawn the banner, so it exists.)
  useEffect(() => {
    if (bannerShown === 0) return;
    window.scrollTo(0, 0);
    checkRefs.banner.current?.focus({ preventScroll: true });
    // (checkRefs holds the same ref objects on every draw, so only the counter matters here.)
  }, [bannerShown]);

  // Leaving step 2 removes the Turnstile widget.
  useEffect(() => {
    if (screen !== 'check') removeTurnstile();
  }, [screen]);

  // While a panel is open, the phone's back gesture (or the browser's Back) closes it.
  useEffect(() => {
    if (!panel) return undefined;
    const onPop = () => setPanel(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [panel]);

  const openPanel = (kind) => {
    try {
      window.history.pushState({ bbfPanel: kind }, '');
    } catch {
      // history blocked: the panel still opens; ✕ closes it
    }
    setPanel(kind);
  };
  const closePanel = () => {
    if (window.history.state?.bbfPanel) window.history.back(); // popstate then closes it
    else setPanel(null);
  };

  const cycle = loaded?.status === 'ok' ? loaded.cycle : null;
  const school = loaded?.status === 'ok' ? loaded.school : null;
  const today = schoolToday();
  const firstDay = firstDayOf(cycle?.days);
  const plan = (cycle?.plans ?? []).find((p) => p.id === form.planId) ?? null;
  const errors = detailsErrors(form, cycle, today);
  const age = form.dob && firstDay ? ageOn(form.dob, firstDay) : null;
  const isMinor = age !== null && age < 18;

  const update = useCallback((changes) => setForm((f) => ({ ...f, ...changes })), []);

  // ----- Step 1 -----
  const onContinue = () => {
    setShowErrors(true);
    const firstBad = FIELD_ORDER.find((field) => errors[field]);
    if (firstBad) {
      detailRefs[firstBad].current?.focus();
      return;
    }
    // The signer: an adult candidate signs for themself, so their name is filled in — but only
    // while the field still holds what the page filled in last (a name the family typed stays).
    const prefill = isMinor ? '' : normalizeName(`${form.first} ${form.last}`);
    if (normalizeName(signer) === normalizeName(lastPrefill.current)) setSigner(prefill);
    lastPrefill.current = prefill;
    setBanner(null);
    setHasTried(false);
    setCheckErrors(NO_CHECK_ERRORS);
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
  const onSignerChange = (value) => {
    setSigner(value);
    setCheckErrors((e) => ({ ...e, signer: null }));
  };

  const onBack = () => {
    setBanner(null);
    setHasTried(false);
    setScreen('details');
  };

  const showBanner = (kind) => {
    setBanner(kind);
    if (kind === 'failed' || kind === 'verify' || kind === 'rate') setHasTried(true);
    setBannerShown((n) => n + 1); // the effect below moves focus to it once it is drawn
  };

  const onSend = async () => {
    if (sendingNow.current) return; // a second tap while sending does nothing

    // 1. The tick, the signer's name and the signature (Form 6).
    const pad = checkRefs.signature.current;
    const empty = !pad || pad.isEmpty();
    let signature = null;
    let signatureError = empty ? T.ERR_SIGNATURE : null;
    if (!empty) {
      signature = pad.toDataUrl();
      // The database refuses pictures over 70 000 characters.
      if (signature.length > SIGNATURE_MAX_LENGTH || !signatureIsValid(signature)) signatureError = T.ERR_SIGNATURE_TOO_BIG;
    }
    const nextErrors = { ack: ack ? null : T.ERR_ACK, signer: nameError(signer, T.ERR_SIGNER), signature: signatureError };
    setCheckErrors(nextErrors);
    if (nextErrors.ack) {
      checkRefs.ack.current?.focus();
      return;
    }
    if (nextErrors.signer) {
      checkRefs.signer.current?.focus();
      return;
    }
    if (nextErrors.signature) return;

    sendingNow.current = true;
    setSending(true);
    try {
      // 2. The "are you human?" token, asked for now (it can be used once, for 5 minutes).
      let token = '';
      if (!isPreview) {
        try {
          if (!loaded.turnstile_site_key) throw new Error('turnstile');
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
        email: form.email.trim(),
        dan: form.dan,
        cycle_plan_id: form.planId,
        kukkiwon: form.kukkiwon === true,
        acknowledged: true,
        waiver_version: loaded.waiver.version_name,
        signer_name: normalizeName(signer),
        signature,
        website: honeypot,
        started_at: startedAt.current,
        sent_at: Date.now(),
        turnstile_token: token,
      };
      const answer = await sendRegistration(code, body);
      handleAnswer(answer);
    } finally {
      sendingNow.current = false;
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Send makes a new one
    }
  };

  const handleAnswer = (answer) => {
    switch (answer?.status) {
      case 'ok': {
        if (typeof answer.reference !== 'string' || !answer.reference) {
          showBanner('failed'); // an "ok" we can't read is never shown as registered
          return;
        }
        setVisit(
          addToVisit(code, {
            name: `${answer.first_name} ${answer.last_name}`,
            dan: answer.dan,
            kukkiwon: answer.kukkiwon === true,
            planName: answer.plan_name,
            totalCents: answer.total_cents,
            reference: answer.reference,
          }),
        );
        setResult(answer);
        setScreen('done');
        return;
      }
      case 'not_found':
        // The cycle was deleted while they were filling in: the "link isn't working" page.
        setLoaded({ status: 'not_found' });
        setScreen('message');
        return;
      case 'closed':
      case 'not_open':
      case 'finished':
        showBanner('closed');
        return;
      case 'waiver_changed':
        showBanner('waiver');
        return;
      case 'verify_failed':
        showBanner('verify');
        return;
      case 'rate_limited':
        showBanner('rate');
        return;
      default:
        // invalid, bad_request, unavailable, network — "wasn't sent … nothing is lost".
        showBanner('failed');
    }
  };

  // ----- Registered → another candidate -----
  const onAnother = () => {
    setForm(emptyForm({ email: form.email, planId: form.planId })); // Form 7: email and plan kept
    setShowErrors(false);
    setAck(false);
    setSigner('');
    lastPrefill.current = '';
    setCheckErrors(NO_CHECK_ERRORS);
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
    content = (
      <p className="bbf-loading" role="status">
        {T.LOADING}
      </p>
    );
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
      <StepDetails
        cycle={cycle}
        form={form}
        update={update}
        errors={errors}
        showErrors={showErrors}
        today={today}
        refs={detailRefs}
        headingRef={headingRef}
        honeypot={honeypot}
        setHoneypot={setHoneypot}
        onContinue={onContinue}
        onOpenRequirements={() => openPanel('requirements')}
      />
    );
  } else if (screen === 'check') {
    content = (
      <StepCheck
        cycle={cycle}
        school={school}
        waiver={loaded.waiver}
        form={form}
        schedule={scheduleFor({ plan, dan: form.dan, kukkiwon: form.kukkiwon, fees: cycle?.kukkiwon, today })}
        paymentsCount={plan?.payments?.length ?? 0}
        today={today}
        firstDay={firstDay}
        age={age}
        isMinor={isMinor}
        ack={ack}
        setAck={onAckChange}
        signer={signer}
        setSigner={onSignerChange}
        errors={checkErrors}
        banner={banner}
        sending={sending}
        hasTried={hasTried}
        onSignatureChange={onSignatureChange}
        onSend={onSend}
        onBack={onBack}
        onReadAll={() => openPanel('waiver')}
        onReload={() => window.location.reload()}
        refs={checkRefs}
        headingRef={headingRef}
      />
    );
  } else {
    content = (
      <Registered
        cycle={cycle}
        result={result}
        visit={visit}
        onAnother={onAnother}
        onOpenRequirements={() => openPanel('requirements')}
        headingRef={headingRef}
      />
    );
  }

  const panelDan = screen === 'done' ? result?.dan : form.dan;

  return (
    <>
      {isPreview ? <PreviewStrip /> : null}
      <Header schoolName={school?.name ?? null} />
      <main className="bbf-main">{content}</main>
      {panel === 'requirements' && cycle && panelDan ? <RequirementsPanel cycle={cycle} dan={panelDan} onClose={closePanel} /> : null}
      {panel === 'waiver' && loaded?.waiver ? <WaiverPanel waiver={loaded.waiver} onClose={closePanel} /> : null}
    </>
  );
}

// Form 8 and "didn't load". `answer` is the GET answer (or { status: 'not_found' }).
// The cycle box (without the Apply-by line) shows whenever the cycle is known.
function Message({ answer, onRetry }) {
  const ok = answer?.status === 'ok';
  const status = ok ? answer.state : answer?.status;
  const cycle = ok ? answer.cycle : null;
  const closedOn = ok ? answer.closed_on ?? null : null;

  let box;
  if (status === 'not_open') box = <StateMessage title={T.NOT_OPEN_TITLE} text={T.NOT_OPEN_TEXT} />;
  else if (status === 'closed') box = <StateMessage title={T.CLOSED_TITLE} text={closedOn ? T.closedOn(longDay(closedOn)) : T.CLOSED_TEXT} />;
  else if (status === 'finished') box = <StateMessage title={T.FINISHED_TITLE} text={T.FINISHED_TEXT} />;
  else if (status === 'not_found') box = <StateMessage title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  else
    box = (
      <StateMessage title={T.LOAD_FAILED_TITLE} text={T.LOAD_FAILED_TEXT}>
        <button type="button" className="bbf-btn bbf-btn--primary bbf-btn--main" onClick={onRetry}>
          {T.TRY_AGAIN}
        </button>
      </StateMessage>
    );
  return (
    <>
      <CycleBox cycle={status === 'not_found' ? null : cycle} showApplyBy={false} />
      {box}
    </>
  );
}
