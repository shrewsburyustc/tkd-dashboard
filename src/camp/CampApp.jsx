// CampApp.jsx — the whole public camp sign-up page (/camp/<code>).
// Why it exists: families sign up 1–3 children for a camp from the camp's link or QR code
// (rulebook v0.232, contract 0013 §4.1). This file decides which screen shows:
//   loading → can't-sign-up message (C7d) or step 1 (C7a) → step 2 (C7b) → signed up (C7c).
// It holds the form's values and sends the sign-up; the screens only draw them.
//
// Every server answer is converted to camelCase FIRST (campRules.toCamel, the same mechanical
// rule as campsApi.js, §5.2), so campRules.js always gets the shapes of §5.1.
//
// What is sent (POST /api/camp/<code>, checked again by the Function and the database — form.js
// buildBody makes it):
//   submission_id   a random id made by this page for this sign-up; a repeat Sign up (e.g. after
//                   a dropped connection) reuses it, so the database never saves it twice
//   children        [{ first_name, last_name, age, member, day_ids, extras: [{extra_id, day_ids}] }]
//   parent, emergency   { name, phone (10 digits), relation }
//   paying_by       'cash' | 'check' | 'card'
//   acknowledged    true (the waiver tick)
//   signature       the drawn signature as a PNG data URL (≤ 70 000 characters)
//   ack_version     which tick wording was used (campRules.CAMP_ACK_VERSION)
//   waiver_version  the waiver the family read (from the GET answer) — if the camp's waiver
//                   changed meanwhile, the database answers camp_changed
//   expected_total_cents  the family total this page showed — if the price changed meanwhile,
//                   the database answers price_changed instead of charging a different amount
//   website         the hidden "honeypot" field — always empty for people
//   started_at, sent_at   when the form was opened and when Sign up was tapped (ms)
//   turnstile_token the one-time "are you human?" token (not used in preview mode)
import { useEffect, useRef, useState } from 'react';
import { CampCard, Header, PreviewStrip, StateMessage } from './parts.jsx';
import StepDetails from './StepDetails.jsx';
import StepCheck from './StepCheck.jsx';
import SignedUp from './SignedUp.jsx';
import { getCamp, sendSignup } from './api.js';
import { getTurnstileToken, removeTurnstile } from '../register/turnstile.js';
import { buildBody, detailsErrors, emptyChild, emptyPerson, familyTotalFor, fieldId, signatureIsValid, tidyChild } from './form.js';
import { longDate } from './format.js';
import { MAX_CHILDREN, toCamel } from '../lib/camps/campRules.js';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';
const TURNSTILE_ACTION = 'camp_signup'; // the server checks the token was made for this form (§4.4)

// The camp code from the address: /camp/k7m2qpxz → "k7m2qpxz" (null if there is none).
function codeFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('camp');
  const raw = at >= 0 ? parts[at + 1] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

const newSubmissionId = () => crypto.randomUUID();
const emptyForm = (camp) => ({ children: [emptyChild(camp)], parent: emptyPerson(), emergency: emptyPerson(), payingBy: null });

// The camelCase GET answer → the camp object the screens use: the answer's `camp` plus the
// waiver version that sits next to it (§5.1 "public answer … adds waiverVersion").
const campOf = (loaded) => (loaded?.camp ? { ...loaded.camp, waiverVersion: loaded.waiverVersion } : null);

// Which "can't sign up" message a GET answer means (null = the form can be shown).
//   kinds: not_open_yet (+ date) · not_open (switched off, no date) · closed (+ date or null) ·
//          finished · not_found · load_failed
function messageFor(answer) {
  if (answer?.status === 'ok') {
    if (answer.state === 'open') return null;
    if (answer.state === 'not_open_yet') return { kind: 'not_open_yet', date: answer.opensOn ?? null };
    if (answer.state === 'closed') return { kind: 'closed', date: answer.closedOn ?? null };
    if (answer.state === 'finished') return { kind: 'finished' };
    return { kind: 'load_failed' }; // a state we don't know: fail closed
  }
  if (answer?.status === 'not_open') return { kind: 'not_open' };
  if (answer?.status === 'not_found') return { kind: 'not_found' };
  return { kind: 'load_failed' }; // rate_limited, unavailable, network, anything else
}

export default function CampApp() {
  const [code] = useState(codeFromAddress);
  const [loaded, setLoaded] = useState(null); // the camelCase GET answer (or the newest camp)
  const [loadTry, setLoadTry] = useState(0); // bump to load again ("Try again")
  const [screen, setScreen] = useState('loading'); // loading | message | details | check | done
  const [message, setMessage] = useState(null); // see messageFor

  const [form, setForm] = useState(() => emptyForm(null));
  const [touched, setTouched] = useState({}); // fields whose error may show; { all: true } after Continue
  const [honeypot, setHoneypot] = useState('');
  const startedAt = useRef(Date.now());
  const submissionId = useRef(newSubmissionId());

  const [ack, setAck] = useState(false);
  const [checkErrors, setCheckErrors] = useState({ ack: null, signature: null });
  const [banner, setBanner] = useState(null); // step 2: { code, … } · step 1: 'camp_changed'
  const [sending, setSending] = useState(false);
  const [hasTried, setHasTried] = useState(false);
  const [result, setResult] = useState(null); // the camelCase ok answer

  const headingRef = useRef(null);
  const checkRefs = { ack: useRef(null), signature: useRef(null), turnstile: useRef(null), banner: useRef(null) };

  // ----- Loading the camp -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = code ? await getCamp(code) : { status: 'not_found' };
      if (cancelled) return;
      const answer = toCamel(raw);
      setLoaded(answer);
      const why = messageFor(answer);
      if (why) {
        setMessage(why);
        setScreen('message');
      } else {
        // A one-day camp starts with its day picked; the form is made once the camp is known.
        setForm((f) => (f.children.length === 1 && f.children[0].first === '' ? emptyForm(campOf(answer)) : f));
        setScreen('details');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loadTry]);

  const camp = campOf(loaded);
  const kind = loaded?.priceKindToday === 'regular' ? 'regular' : 'early';

  // The tab's title names the camp once it's known.
  useEffect(() => {
    document.title = camp?.name ? `${camp.name} · ${T.PAGE_KIND}` : T.PAGE_KIND;
  }, [camp?.name]);

  // When the screen changes: start at the top and move keyboard focus to its heading (or to the
  // banner, when there is one), so screen readers announce the new step.
  useEffect(() => {
    if (screen === 'loading' || screen === 'message') return;
    window.scrollTo(0, 0);
    if (screen === 'details' && banner === 'camp_changed') checkRefs.banner.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
    // Only when the screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Leaving step 2 removes the Turnstile widget.
  useEffect(() => {
    if (screen !== 'check') removeTurnstile();
  }, [screen]);

  const errors = camp ? detailsErrors(form, camp) : {};
  const show = (key) => (touched.all || touched[key] ? errors[key] ?? null : null);
  const onLeave = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  // ----- Step 1 -----
  // `change` is a function "current child → new child" (ChildCard), so quick taps never use an
  // old copy of the child.
  const setChild = (index, change) => setForm((f) => ({ ...f, children: f.children.map((c, i) => (i === index ? change(c) : c)) }));
  const addChild = () => setForm((f) => (f.children.length >= MAX_CHILDREN ? f : { ...f, children: [...f.children, emptyChild(camp)] }));
  const removeChild = (index) => {
    setForm((f) => ({ ...f, children: f.children.filter((_, i) => i !== index) }));
    // The error marks are per position ("c1.first"), so forget the ones of later children.
    setTouched((t) => (t.all ? t : Object.fromEntries(Object.entries(t).filter(([key]) => !/^c\d+\./.test(key) || Number(key.slice(1, key.indexOf('.'))) < index))));
  };
  const setPerson = (who, field, value) => setForm((f) => ({ ...f, [who]: { ...f[who], [field]: value } }));
  const setPayingBy = (payingBy) => setForm((f) => ({ ...f, payingBy }));

  const onContinue = () => {
    setTouched({ all: true });
    const firstBad = Object.keys(errors)[0]; // detailsErrors lists fields in screen order
    if (firstBad) {
      document.getElementById(fieldId(firstBad))?.focus();
      return;
    }
    setBanner(null);
    setHasTried(false);
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

  // `tried` = false keeps the button saying "Sign up" (used when the family must check and sign
  // again, e.g. price_changed); true makes it say "Try again" (the send itself failed).
  const showBanner = (next, tried = true) => {
    setBanner(next);
    setHasTried(tried);
    window.scrollTo(0, 0);
    // Let React draw the banner first, then move focus to it.
    setTimeout(() => checkRefs.banner.current?.focus({ preventScroll: true }), 0);
  };

  const onSend = async () => {
    if (sending) return;
    // 1. The tick and the signature.
    const pad = checkRefs.signature.current;
    const empty = !pad || pad.isEmpty();
    let signature = null;
    let signatureError = empty ? T.ERR_SIGNATURE : null;
    if (!empty) {
      signature = pad.toDataUrl();
      if (!signatureIsValid(signature)) signatureError = T.ERR_SIGNATURE_TOO_BIG;
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
          token = await getTurnstileToken(loaded.turnstileSiteKey, checkRefs.turnstile.current, TURNSTILE_ACTION);
        } catch {
          showBanner({ code: 'verify' });
          return;
        }
      }
      // 3. Send.
      const body = buildBody({
        form,
        camp,
        kind,
        waiverVersion: camp.waiverVersion,
        signature,
        submissionId: submissionId.current,
        honeypot,
        startedAt: startedAt.current,
        token,
      });
      const answer = toCamel(await sendSignup(code, body));
      handleAnswer(answer);
    } finally {
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Sign up makes a new one
    }
  };

  // The newest camp from a price_changed / camp_changed answer (a whole camp_public_camp answer,
  // already camelCase). The Turnstile site key isn't in it, so the one we have is kept.
  const takeFreshCamp = (fresh) => {
    const next = { ...fresh, turnstileSiteKey: loaded?.turnstileSiteKey };
    setLoaded(next);
    return next;
  };

  const handleAnswer = (answer) => {
    switch (answer.status) {
      case 'ok':
        setResult(answer);
        setScreen('done');
        return;
      case 'price_changed': {
        // Back to step 2 with the new prices and the approved message (v0.700 (10)).
        // They must check the new total and sign again: untick the waiver box, wipe the drawn
        // signature, and keep the button saying "Sign up".
        takeFreshCamp(answer.camp);
        setAck(false);
        checkRefs.signature.current?.clear();
        setCheckErrors({ ack: null, signature: null });
        showBanner({ code: 'price', newCents: answer.newTotalCents, oldCents: answer.oldTotalCents }, false);
        return;
      }
      case 'camp_changed': {
        // Take the fresh camp, drop choices that no longer exist, back to step 1 with the message.
        const fresh = takeFreshCamp(answer.camp);
        const why = messageFor(fresh);
        if (why) {
          setMessage(why);
          setScreen('message');
          return;
        }
        const freshCamp = campOf(fresh);
        setForm((f) => ({ ...f, children: f.children.map((c) => tidyChild(c, freshCamp)) }));
        setAck(false); // the waiver may be new: read and tick again (the signature pad is
        // emptied too: step 2 is drawn fresh when they come back to it)
        setCheckErrors({ ack: null, signature: null });
        setTouched({ all: true }); // show what needs fixing (e.g. an age now outside the range)
        setBanner('camp_changed');
        setHasTried(false);
        setScreen('details');
        return;
      }
      case 'not_open':
        setMessage(answer.opensOn ? { kind: 'not_open_yet', date: answer.opensOn } : { kind: 'not_open' });
        setScreen('message');
        return;
      case 'finished':
        setMessage({ kind: 'finished' });
        setScreen('message');
        return;
      case 'not_found':
        // The camp was deleted while they were filling in: the "link not working" page.
        setLoaded(null);
        setMessage({ kind: 'not_found' });
        setScreen('message');
        return;
      case 'closed':
        showBanner({ code: 'closed' });
        return;
      case 'verify_failed':
        showBanner({ code: 'verify' });
        return;
      case 'rate_limited':
        showBanner({ code: 'rate' });
        return;
      default:
        // invalid, bad_request, unavailable, network, anything else — "wasn't sent … nothing is lost".
        showBanner({ code: 'failed' });
    }
  };

  // ----- Drawing -----
  let content;
  if (screen === 'loading') {
    content = <p className="reg-loading" role="status">{T.LOADING}</p>;
  } else if (screen === 'message') {
    content = (
      <Message
        message={message}
        camp={message?.kind === 'not_found' || message?.kind === 'load_failed' ? null : camp}
        onRetry={() => {
          setScreen('loading');
          setLoadTry((n) => n + 1);
        }}
      />
    );
  } else if (screen === 'details') {
    content = (
      <StepDetails
        camp={camp}
        kind={kind}
        form={form}
        setChild={setChild}
        addChild={addChild}
        removeChild={removeChild}
        setPerson={setPerson}
        setPayingBy={setPayingBy}
        show={show}
        onLeave={onLeave}
        onContinue={onContinue}
        banner={banner === 'camp_changed' ? banner : null}
        bannerRef={checkRefs.banner}
        headingRef={headingRef}
        honeypot={honeypot}
        setHoneypot={setHoneypot}
      />
    );
  } else if (screen === 'check') {
    content = (
      <StepCheck
        camp={camp}
        kind={kind}
        form={form}
        familyTotalCents={familyTotalFor(form.children, camp, kind)}
        ack={ack}
        setAck={onAckChange}
        errors={checkErrors}
        banner={banner && banner !== 'camp_changed' ? banner : null}
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
    content = <SignedUp result={result} headingRef={headingRef} />;
  }

  return (
    <>
      {isPreview ? <PreviewStrip /> : null}
      <Header />
      <main className="reg-main">{content}</main>
    </>
  );
}

// C7d and the other "can't sign up" boxes. `camp` is shown above the box when we have it.
function Message({ message, camp, onRetry }) {
  const kind = message?.kind;
  let box;
  if (kind === 'not_open_yet') {
    box = <StateMessage title={T.NOT_OPEN_TITLE} text={message.date ? T.opensOn(longDate(message.date)) : T.NOT_OPEN_TEXT} />;
  } else if (kind === 'not_open') {
    box = <StateMessage title={T.NOT_OPEN_TITLE} text={T.NOT_OPEN_TEXT} />;
  } else if (kind === 'closed') {
    box = <StateMessage title={T.CLOSED_TITLE} text={message.date ? T.closedOn(longDate(message.date)) : T.CLOSED_TEXT} />;
  } else if (kind === 'finished') {
    box = <StateMessage title={T.FINISHED_TITLE} text={T.FINISHED_TEXT} />;
  } else if (kind === 'not_found') {
    box = <StateMessage title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  } else {
    box = (
      <StateMessage title={T.LOAD_FAILED_TITLE} text={T.LOAD_FAILED_TEXT}>
        <button type="button" className="reg-btn reg-btn--primary reg-btn--main" onClick={onRetry}>
          {T.TRY_AGAIN}
        </button>
      </StateMessage>
    );
  }
  return (
    <>
      <CampCard camp={camp} />
      {box}
    </>
  );
}
