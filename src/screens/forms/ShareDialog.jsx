// ShareDialog.jsx — Share: link, QR code, kiosk (mockup screen 7).
// Why it exists: three ways to get a form to families. Since step F3 the public page exists, so:
//   - Link: copy it for Instagram, Facebook, texts (Live and Closed forms — a Closed link tells
//     families the form is closed).
//   - QR code (Live forms): Download (a PNG file) or Print a sign (one letter-size page with the
//     logo, the form's name, a large QR code and the short link).
//   - Kiosk mode: still a disabled button with a note — it is built in a later step.
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

export default function ShareDialog({ form, isPhone, onClose }) {
  const [copied, setCopied] = useState(false);
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
              <button type="button" className="btn fshare-kiosk" aria-disabled="true" aria-describedby="share-kiosk-later">
                <IconDeviceTablet size={16} aria-hidden="true" />
                {T.KIOSK}
              </button>
              <p id="share-kiosk-later" className="field-hint">
                {T.KIOSK_LATER}
              </p>
            </div>
          </>
        )}
        {!isPhone && (
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
