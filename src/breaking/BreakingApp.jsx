// BreakingApp.jsx — the whole public Board breaking sign-up page (/breaking/<code>).
// Why it exists: a parent scans the school's QR code or opens its link and registers one student for the
// month's Board breaking event (rulebook v1.300–v1.304, contract 0051 §5, docs/Board Breaking/FUNCTION-API.md).
// This file decides which screen shows:
//   loading → can't-register message (closed / not open / not found / didn't load) or the form
//   → done (cash or check, a Square link, or a failed link) → back from Square (?paid=1).
// It holds the form's values and talks to the Function; the screens only draw them.
//
// What is sent (POST /api/breaking/<code>, FUNCTION-API.md — form.js buildSignupBody makes it):
//   action 'signup', submission_id (a random id made when the form first opens; every retry reuses it,
//   so the database never saves the student twice), first_name, last_name, age, rank_name, class_id,
//   tech, adult, paying_by, expected_total_cents (what this page showed; the DATABASE works the real
//   amount out and answers price_changed if they differ), website (the hidden honeypot, always empty
//   for people), started_at / sent_at (ms), turnstile_token (not used in preview mode).
// Card: the Function asks Square for a payment link with the database's amount and answers
//   pay: { state: 'link', url } — the page then offers "Pay $X with Square", which opens that address in
//   the same tab. 'failed' means "you're registered, pay at the desk" with a Try again (action 'pay', which
//   sends submission_id AND the child's first name again, kept in memory only).
// The submission id is remembered in THIS browser only (memory.js), so the page can ask "has Square told
// you yet?" when the family returns; it is never put in an address, a log or an error message.
import { useEffect, useRef, useState } from 'react';
import { EventCard, Header, PreviewStrip, StateMessage } from './parts.jsx';
import BreakingForm from './BreakingForm.jsx';
import { DonePage, ReturnPage } from './DonePage.jsx';
import { getEvent, postAction } from './api.js';
import { applyChange, buildSignupBody, emptyForm, eventFromAnswer, fieldId, formErrors, priceView, safePayUrl, summaryOf } from './form.js';
import { forgetSubmission, recallSubmission, rememberSubmission } from './memory.js';
import { getTurnstileToken, removeTurnstile } from '../register/turnstile.js';
import { formatMoneyWithCents } from '../lib/money.js';
import { normalizeName } from '../lib/testing/names.js';
import * as T from './text.js';

const isPreview = import.meta.env.MODE === 'preview';
const TURNSTILE_SIGNUP = 'breaking_signup'; // the Function checks the token was made for this action
const TURNSTILE_PAY = 'breaking_pay';
const POLL_MS = 6000; // while Square hasn't told us yet, ask again this often (a few times)
const POLL_TIMES = 5;

// The event code from the address: /breaking/k7m2qpxz → "k7m2qpxz" (null if there is none).
function codeFromAddress() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('breaking');
  const raw = at >= 0 ? parts[at + 1] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

// Did the family come back from Square? (?paid=1, the address the Function gave Square.)
const cameBackFromSquare = () => new URLSearchParams(window.location.search).get('paid') === '1';

const newSubmissionId = () => crypto.randomUUID();

// Which "can't register" message a GET answer means (null = the form can be shown).
// kinds: closed · not_open · not_found · load_failed
function messageFor(answer) {
  if (answer?.status === 'ok') {
    const event = eventFromAnswer(answer);
    if (!event) return { kind: 'load_failed' }; // an answer we can't read: fail closed
    return event.open ? null : { kind: 'closed' };
  }
  if (answer?.status === 'not_open') return { kind: 'not_open' };
  if (answer?.status === 'not_found') return { kind: 'not_found' };
  return { kind: 'load_failed' }; // rate_limited, unavailable, network, anything else
}

export default function BreakingApp() {
  const [code] = useState(codeFromAddress);
  const [returned] = useState(cameBackFromSquare);
  const [event, setEvent] = useState(null); // the camelCase event (or null)
  const [loadTry, setLoadTry] = useState(0); // bump to load again (Retry)
  const [screen, setScreen] = useState('loading'); // loading | message | form | done | returned
  const [message, setMessage] = useState(null);
  const [siteKey, setSiteKey] = useState(null); // the Turnstile site key from the GET answer

  const [form, setForm] = useState(emptyForm);
  const [showAll, setShowAll] = useState(false); // after Register: every message shows
  const [honeypot, setHoneypot] = useState('');
  const startedAt = useRef(Date.now());
  const submissionId = useRef(newSubmissionId());
  const [banner, setBanner] = useState(null); // words at the top of the form
  const [sending, setSending] = useState(false);
  const [hasTried, setHasTried] = useState(false);

  const [result, setResult] = useState(null); // what the done page shows (amount from the answer)
  const [summary, setSummary] = useState(null);
  const [note, setNote] = useState(null); // the amber line on the done page (link failed)
  const [payBusy, setPayBusy] = useState(false);
  // The child's first name exactly as sent, kept in memory ONLY (never in storage): Square needs the same text every time or it
  // rejects a retry, so "Try again" sends it again (action pay). After a reload it is gone, and Try again is not offered.
  const [sentFirstName, setSentFirstName] = useState(null);
  const [paidStatus, setPaidStatus] = useState('checking'); // the ?paid=1 page: checking | paid | unpaid | unknown

  const [focusTick, setFocusTick] = useState(0); // bumped each time a message should take keyboard focus
  const headingRef = useRef(null);
  const bannerRef = useRef(null);
  const turnstileRef = useRef(null);

  // ----- Loading the event -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = code ? await getEvent(code) : { status: 'not_found' };
      if (cancelled) return;
      const found = answer?.status === 'ok' ? eventFromAnswer(answer) : null;
      setEvent(found);
      setSiteKey(typeof answer?.turnstile_site_key === 'string' ? answer.turnstile_site_key : null);
      if (returned && (found || answer?.status !== 'not_found')) {
        setScreen('returned'); // back from Square: the thank-you page, whatever the event says now
        return;
      }
      const why = messageFor(answer);
      if (why) {
        setMessage(why);
        setScreen('message');
      } else {
        setScreen('form');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loadTry, returned]);

  // The tab's title names the event once it's known.
  useEffect(() => {
    document.title = event?.name ? `${event.name} · ${T.PAGE_KIND}` : T.PAGE_KIND;
  }, [event?.name]);

  // When the screen changes: start at the top and move keyboard focus to its heading, so screen readers
  // announce the new screen.
  useEffect(() => {
    if (screen === 'loading' || screen === 'message') return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [screen]);

  // A new message at the top of the form or the done page (send failed, price changed, link failed …): move keyboard
  // focus to it once React has drawn it, so screen readers read it. (An effect, not a timer: it runs after the draw.)
  useEffect(() => {
    if (focusTick > 0) bannerRef.current?.focus({ preventScroll: true });
  }, [focusTick]);

  // Leaving the form removes the Turnstile widget.
  useEffect(() => {
    if (screen !== 'form' && screen !== 'done') removeTurnstile();
  }, [screen]);

  // ----- Back from Square: ask whether Square has told the school yet -----
  const checkPaid = async () => {
    const id = recallSubmission(code);
    if (!id) {
      setPaidStatus('unknown');
      return 'unknown';
    }
    setPaidStatus('checking');
    const answer = await postAction(code, { action: 'status', submission_id: id });
    if (answer?.status === 'ok' && answer.paid === true) {
      forgetSubmission(code);
      setPaidStatus('paid');
      return 'paid';
    }
    if (answer?.status === 'not_found') {
      setPaidStatus('unknown');
      return 'unknown';
    }
    setPaidStatus('unpaid'); // not yet (or the check itself failed: the button asks again)
    return 'unpaid';
  };
  useEffect(() => {
    if (screen !== 'returned') return undefined;
    let cancelled = false;
    let timer = null;
    let times = 0;
    const round = async () => {
      const state = await checkPaid();
      if (cancelled || state !== 'unpaid' || times >= POLL_TIMES) return;
      times += 1;
      timer = setTimeout(round, POLL_MS);
    };
    round();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only when this screen shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ----- The form -----
  const change = (patch) => setForm((f) => applyChange(f, patch, event));
  const errors = event ? formErrors(form, event) : {};

  const showBanner = (words, tried = true) => {
    setBanner(words);
    setHasTried(tried);
    window.scrollTo(0, 0);
    setFocusTick((n) => n + 1); // the effect below moves keyboard focus to the message once it is drawn
  };

  // The one-time "are you human?" token, asked for now (it can be used once, for 5 minutes).
  // → the token, '' in preview mode, or null when the check couldn't run.
  const humanToken = async (action) => {
    if (isPreview) return '';
    try {
      return await getTurnstileToken(siteKey, turnstileRef.current, action);
    } catch {
      return null;
    }
  };

  const onRegister = async () => {
    if (sending) return;
    setShowAll(true);
    const firstBad = Object.keys(errors)[0]; // formErrors lists fields in screen order
    if (firstBad) {
      document.getElementById(fieldId(firstBad))?.focus();
      return;
    }
    setSending(true);
    try {
      const token = await humanToken(TURNSTILE_SIGNUP);
      if (token === null) {
        showBanner(T.VERIFY_FAILED);
        return;
      }
      const body = buildSignupBody({
        form,
        submissionId: submissionId.current,
        startedAt: startedAt.current,
        sentAt: Date.now(),
        honeypot,
        token,
        expectedTotalCents: priceView(form, event).totalCents,
      });
      await handleSignup(await postAction(code, body));
    } finally {
      setSending(false);
      removeTurnstile(); // each token is single-use; the next Register makes a new one
    }
  };

  const handleSignup = async (answer) => {
    switch (answer.status) {
      case 'ok': {
        let pay = answer.pay && typeof answer.pay === 'object' ? answer.pay : { state: 'none' };
        if (pay.state === 'link' && !safePayUrl(pay.url)) pay = { state: 'failed' }; // never follow an address we don't trust
        setResult({ amountCents: answer.amount_cents, payingBy: answer.paying_by, sameDay: answer.same_day === true, pay });
        setSummary(summaryOf(form, event));
        setSentFirstName(normalizeName(form.first));
        setNote(pay.state === 'failed' || (answer.paying_by === 'card' && pay.state === 'none') ? T.LINK_FAILED : null);
        if (answer.paying_by === 'card') rememberSubmission(code, submissionId.current);
        setBanner(null);
        setScreen('done');
        return;
      }
      case 'price_changed': {
        // Take the newest prices so the amount shown matches, then ask them to check it and register again.
        const fresh = eventFromAnswer(await getEvent(code));
        if (fresh?.open) setEvent(fresh);
        showBanner(T.priceChanged(formatMoneyWithCents(answer.amount_cents)), false);
        return;
      }
      case 'closed':
      case 'full': // the event is full: worded like closed
        setMessage({ kind: 'closed' });
        setScreen('message');
        return;
      case 'not_open':
        setMessage({ kind: 'not_open' });
        setScreen('message');
        return;
      case 'not_found':
        setEvent(null);
        setMessage({ kind: 'not_found' });
        setScreen('message');
        return;
      case 'duplicate':
        showBanner(T.DUPLICATE, false);
        return;
      case 'invalid':
        showBanner(T.INVALID, false);
        return;
      case 'verify_failed':
        showBanner(T.VERIFY_FAILED);
        return;
      case 'rate_limited':
        showBanner(T.RATE_LIMITED);
        return;
      default:
        // bad_request, unavailable, network, anything else — "wasn't sent … nothing is lost".
        showBanner(T.SEND_FAILED);
    }
  };

  // ----- The done page -----
  // "Try again": ask the Function for a new Square link (action pay) with the balance.
  const onTryAgain = async () => {
    if (payBusy || !sentFirstName) return;
    setPayBusy(true);
    try {
      const token = await humanToken(TURNSTILE_PAY);
      if (token === null) {
        setNote(T.VERIFY_FAILED);
        setFocusTick((n) => n + 1);
        return;
      }
      const answer = await postAction(code, {
        action: 'pay',
        submission_id: submissionId.current,
        first_name: sentFirstName,
        website: '',
        started_at: startedAt.current,
        sent_at: Date.now(),
        turnstile_token: token,
      });
      if (answer.status === 'ok' && answer.pay?.state === 'link' && safePayUrl(answer.pay.url)) {
        setResult((r) => ({ ...r, amountCents: Number.isInteger(answer.amount_cents) ? answer.amount_cents : r.amountCents, pay: { state: 'link', url: answer.pay.url } }));
        setNote(null);
      } else if (answer.status === 'paid') {
        setResult((r) => ({ ...r, pay: { state: 'paid' } }));
        forgetSubmission(code);
      } else if (answer.status === 'rate_limited') {
        setNote(T.RATE_LIMITED);
      } else if (answer.status === 'verify_failed') {
        setNote(T.VERIFY_FAILED);
      } else {
        setNote(T.PAY_AGAIN_FAILED);
      }
      setFocusTick((n) => n + 1); // focus moves to the new message (the effect above)
    } finally {
      setPayBusy(false);
      removeTurnstile();
    }
  };

  // "Pay $X with Square": leave for Square's page in the same tab. In preview mode there is no Square, so
  // the fake one is told the payment happened (or "not yet") and the page comes back by itself.
  const onPay = async (url) => {
    const safe = safePayUrl(url);
    if (!safe) {
      setResult((r) => ({ ...r, pay: { state: 'failed' } }));
      setNote(T.PAY_AGAIN_FAILED);
      setFocusTick((n) => n + 1);
      return;
    }
    if (isPreview) {
      const preview = await import('../lib/breaking/publicApi.preview.js');
      preview.simulateSquareReturn(code, submissionId.current);
      window.location.assign(`/breaking/${encodeURIComponent(code)}?paid=1`);
      return;
    }
    window.location.assign(safe);
  };

  // "Register another student": a fresh form with a fresh submission id.
  const onAnother = () => {
    setForm(emptyForm());
    setShowAll(false);
    setBanner(null);
    setHasTried(false);
    setHoneypot('');
    setResult(null);
    setNote(null);
    startedAt.current = Date.now();
    submissionId.current = newSubmissionId();
    setScreen('form');
  };

  // ----- Drawing -----
  let content;
  if (screen === 'loading') {
    content = <p className="reg-loading" role="status">{T.LOADING}</p>;
  } else if (screen === 'message') {
    content = (
      <Message
        message={message}
        event={message?.kind === 'closed' ? event : null}
        onRetry={() => {
          setScreen('loading');
          setLoadTry((n) => n + 1);
        }}
      />
    );
  } else if (screen === 'form') {
    content = (
      <BreakingForm
        event={event}
        form={form}
        change={change}
        errors={errors}
        showAll={showAll}
        banner={banner}
        bannerRef={bannerRef}
        onRegister={onRegister}
        sending={sending}
        hasTried={hasTried}
        honeypot={honeypot}
        setHoneypot={setHoneypot}
        turnstileRef={turnstileRef}
        headingRef={headingRef}
      />
    );
  } else if (screen === 'done') {
    content = (
      <DonePage
        event={event}
        summary={summary}
        result={result}
        note={note}
        busy={payBusy}
        canRetry={Boolean(sentFirstName)}
        headingRef={headingRef}
        bannerRef={bannerRef}
        turnstileRef={turnstileRef}
        onPay={onPay}
        onTryAgain={onTryAgain}
        onAnother={onAnother}
      />
    );
  } else {
    content = <ReturnPage status={paidStatus} headingRef={headingRef} onCheck={checkPaid} />;
  }

  return (
    <>
      {isPreview ? <PreviewStrip /> : null}
      <Header />
      <main className="reg-main">{content}</main>
    </>
  );
}

// The "can't register" boxes. `event` is drawn above the box when we have it (closed).
function Message({ message, event, onRetry }) {
  const kind = message?.kind;
  // One h1 per page: the event card has it when it is shown, otherwise the message's title is the h1.
  const level = event ? 'h2' : 'h1';
  let box;
  if (kind === 'not_open') {
    box = <StateMessage level={level} title={T.NOT_OPEN_TITLE} text={T.NOT_OPEN_TEXT} />;
  } else if (kind === 'closed') {
    box = <StateMessage level={level} title={T.CLOSED_TITLE} text={T.CLOSED_TEXT} />;
  } else if (kind === 'not_found') {
    box = <StateMessage level={level} title={T.NOT_FOUND_TITLE} text={T.NOT_FOUND_TEXT} />;
  } else {
    box = (
      <StateMessage level={level} title={T.LOAD_FAILED_TITLE} text={T.LOAD_FAILED_TEXT}>
        <button type="button" className="reg-btn reg-btn--primary reg-btn--main" onClick={onRetry}>
          {T.RETRY}
        </button>
      </StateMessage>
    );
  }
  return (
    <>
      <EventCard event={event} />
      {box}
    </>
  );
}
