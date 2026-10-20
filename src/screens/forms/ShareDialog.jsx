// ShareDialog.jsx — Share: link, QR code, kiosk (mockup screen 7).
// Why it exists: three ways to get a form to families. Since step F3 the public page exists, so:
//   - Link: copy it for Instagram, Facebook, texts (Live and Closed forms — a Closed link tells
//     families the form is closed).
//   - QR code (Live forms): Download (a PNG file) or Print a sign (one letter-size page with the
//     logo, the form's name, a large QR code and the short link).
//   - Kiosk mode (Live forms; kiosk plan, docs/Prospects/TKD-Kiosk-Build-Plan.md): "Open kiosk mode
//     on this device" asks first (what happens, the 12 hours, the Guided Access tip, and an amber
//     warning when this is not the shared front-desk account — v0.241), then gets a kiosk token
//     (forms_kiosk_token), keeps it on this tablet (src/lib/kiosk.js) and locks the dashboard;
//     App.jsx then shows the kiosk. "End kiosk mode on all tablets" (forms_kiosk_revoke) is for a
//     lost or stolen tablet.
// A Draft form can't be shared until it's published.
// The QR code is made in the browser by src/lib/forms/share.js — no network — always for the fixed
// production address, and drawn as an <img> (never as inserted HTML). The printed sign reuses
// Color Belt's flyer print styles (testing-events.css, @media print: only .flyer-print is printed).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCopy, IconDeviceTablet, IconDownload, IconPrinter } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Logo from '../../components/Logo.jsx';
import Notice from '../../components/Notice.jsx';
import { formLink, qrPngBlob, qrSvgDataUrl, shortLink } from '../../lib/forms/share.js';
import { kioskRevoke, kioskToken } from '../../lib/forms/api.js';
import { saveKiosk } from '../../lib/kiosk.js';
import { setLockedFlag } from '../../lib/useIdleLock.js';
import * as T from './text.js';

// The printed sign: drawn into the page only while printing.
function Sign({ form, qr, link }) {
  return createPortal(
    <div className="flyer-print">
      <div className="flyer">
        <Logo size={120} alt="" />
        <p className="flyer-school">{T.signSchool(form.locationCode)}</p>
        <h1 className="flyer-title">{form.name}</h1>
        <img className="flyer-qr" src={qr} alt={T.qrAlt(shortLink(link))} />
        <p className="flyer-line">{T.signScan(shortLink(link))}</p>
      </div>
    </div>,
    document.body,
  );
}

export default function ShareDialog({ form, profile, isPhone, onClose, onNoAccess, showToast }) {
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState(null); // null | 'open' | 'end' — the kiosk question shown in the dialog
  const [busy, setBusy] = useState(false);
  const [kioskNote, setKioskNote] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const link = formLink(form.slug);
  const draft = form.status === 'draft';
  const live = form.status === 'live';
  const qr = live ? qrSvgDataUrl(form.slug) : '';

  // Print a sign: draw it, then open the browser's print window. 'afterprint' fires when that
  // window closes (printed or cancelled); then the sign is removed again.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // The kiosk question appears below the QR code: move focus to its main button (this also
  // scrolls it into view); back to the kiosk button when it closes.
  useEffect(() => {
    if (!ask) return;
    const box = document.querySelector('.fshare-ask');
    box?.querySelector('.btn-primary')?.focus({ preventScroll: true });
    box?.scrollIntoView?.({ block: 'end' });
  }, [ask]);

  // Open kiosk mode: a token for this form, kept on this tablet, then the dashboard locks and
  // App.jsx shows the kiosk instead of the lock screen.
  async function openKiosk() {
    if (busy) return;
    setBusy(true);
    setKioskNote(null);
    const result = await kioskToken(form.id);
    setBusy(false);
    if (result.status === 'ok') {
      saveKiosk({ staffId: profile.id, formId: form.id, slug: form.slug, formName: form.name, token: result.token, hours: result.hours });
      setLockedFlag(true); // = Lock now; the lock screen is replaced by the kiosk
      // Start again from an empty page (security review L1): nothing of the dashboard the staff
      // member had open stays in memory behind the kiosk. The reload opens locked, on the kiosk.
      window.location.reload();
    } else if (result.status === 'no_access') onNoAccess?.();
    else setKioskNote(result.status === 'not_found' ? T.KIOSK_NOT_LIVE : T.KIOSK_FAILED);
  }

  // End kiosk mode on every tablet of this form (a lost or stolen tablet).
  async function endKiosk() {
    if (busy) return;
    setBusy(true);
    setKioskNote(null);
    const result = await kioskRevoke(form.id);
    setBusy(false);
    if (result.status === 'ok') {
      setAsk(null);
      showToast?.(T.kioskEnded(result.revoked), { icon: false });
    } else if (result.status === 'no_access') onNoAccess?.();
    else setKioskNote(T.KIOSK_END_FAILED);
  }

  // Download: a PNG file named after the form, saved by the browser.
  async function download() {
    setDownloadFailed(false);
    const blob = await qrPngBlob(form.slug, 1024);
    if (!blob) {
      setDownloadFailed(true);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = T.qrFileName(form.slug);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <>
      <Dialog title={T.shareTitle(form.name)} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
        <p className="tdialog-sub">{T.STATUS[form.status]}</p>
        {draft ? (
          <Notice>{T.SHARE_DRAFT}</Notice>
        ) : (
          <>
            {form.status === 'closed' && <p className="field-hint">{T.SHARE_CLOSED}</p>}
            <div className="field">
              <span className="field-label" id="share-link-label">{T.LINK}</span>
              <div className="fcopyrow">
                {/* the whole address shows (it wraps), so staff can see which form they copy */}
                <output id="share-link" className="fshare-link" aria-labelledby="share-link-label">{shortLink(link)}</output>
                <button type="button" className="btn" data-autofocus onClick={copy}>
                  <IconCopy size={16} aria-hidden="true" />
                  {copied ? T.COPIED : T.COPY}
                </button>
              </div>
              <span className="visually-hidden" aria-live="polite">
                {copied ? T.COPIED : ''}
              </span>
            </div>
            {live && qr && (
              <div className="field">
                <span className="field-label">{T.QR_CODE}</span>
                <div className="fshare-qr">
                  <img className="fshare-qr-img" src={qr} alt={T.qrAlt(shortLink(link))} width={128} height={128} />
                  <div className="fshare-qr-buttons">
                    <button type="button" className="btn" onClick={download}>
                      <IconDownload size={16} aria-hidden="true" />
                      {T.DOWNLOAD}
                    </button>
                    <button type="button" className="btn" onClick={() => setPrinting(true)}>
                      <IconPrinter size={16} aria-hidden="true" />
                      {T.PRINT_SIGN}
                    </button>
                  </div>
                </div>
                {downloadFailed && <Notice>{T.DOWNLOAD_FAILED}</Notice>}
              </div>
            )}
            <div className="field">
              <span className="field-label">{T.FRONT_DESK}</span>
              {ask === null && (
                <>
                  <button
                    type="button"
                    className="btn fshare-kiosk"
                    aria-disabled={live ? undefined : 'true'}
                    aria-describedby="share-kiosk-hint"
                    onClick={() => live && setAsk('open')}
                  >
                    <IconDeviceTablet size={16} aria-hidden="true" />
                    {T.KIOSK}
                  </button>
                  <p id="share-kiosk-hint" className="field-hint">
                    {live ? T.KIOSK_HINT : T.KIOSK_ONLY_LIVE}
                  </p>
                  <button type="button" className="link-button fshare-kiosk-end" onClick={() => setAsk('end')}>
                    {T.KIOSK_END}
                  </button>
                  <p className="field-hint">{T.KIOSK_END_HINT}</p>
                </>
              )}
              {ask === 'open' && (
                <div className="fshare-ask" role="group" aria-labelledby="share-kiosk-ask">
                  <p id="share-kiosk-ask" className="fshare-ask__title">{T.KIOSK_CONFIRM_TITLE}</p>
                  <p>{T.kioskConfirmText(form.name)}</p>
                  <p>{T.KIOSK_HOURS}</p>
                  <p className="field-hint">{T.KIOSK_PIN_TIP}</p>
                  {!profile?.is_shared && <Notice>{T.KIOSK_NOT_SHARED}</Notice>}
                  {kioskNote && <Notice>{kioskNote}</Notice>}
                  <div className="fshare-ask__buttons">
                    <button type="button" className="btn" onClick={() => { setAsk(null); setKioskNote(null); }}>
                      {T.CANCEL}
                    </button>
                    <button type="button" className="btn btn-primary" data-autofocus aria-disabled={busy ? 'true' : undefined} onClick={openKiosk}>
                      <IconDeviceTablet size={16} aria-hidden="true" />
                      {busy ? T.KIOSK_OPENING : T.KIOSK_OPEN}
                    </button>
                  </div>
                </div>
              )}
              {ask === 'end' && (
                <div className="fshare-ask" role="group" aria-labelledby="share-kiosk-end">
                  <p id="share-kiosk-end" className="fshare-ask__title">{T.KIOSK_END_TITLE}</p>
                  <p>{T.KIOSK_END_TEXT}</p>
                  {kioskNote && <Notice>{kioskNote}</Notice>}
                  <div className="fshare-ask__buttons">
                    <button type="button" className="btn" onClick={() => { setAsk(null); setKioskNote(null); }}>
                      {T.CANCEL}
                    </button>
                    <button type="button" className="btn btn-primary" data-autofocus aria-disabled={busy ? 'true' : undefined} onClick={endKiosk}>
                      {T.KIOSK_END_CONFIRM}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {/* While the kiosk question is open its own buttons are the way out (the sticky footer would
            cover them — design review); Escape still closes the dialog. */}
        {!isPhone && ask === null && (
          <div className="dialog-actions">
            <button type="button" className="btn" data-autofocus={draft ? true : undefined} onClick={onClose}>
              {T.CLOSE}
            </button>
          </div>
        )}
      </Dialog>
      {printing && qr && <Sign form={form} qr={qr} link={link} />}
    </>
  );
}
