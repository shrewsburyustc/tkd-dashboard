// RegistrationLinkBox.jsx — the shared "Registration link" box (design review M5, rulebook v1.015 /
// v1.106).
// Why it exists: Color Belt, Star, Camps and Black Belt each had their own box (four copies). The
// page header's "Registration link" button opens this one box everywhere:
//   - the event's name, the section's line (can families register now …), then one card per school
//     link — side by side for two, one under the other on phones — each with the QR code, the link,
//     **Copy link** (the first focus; the section's "Link copied" toast), **Download QR code** and,
//     where the section has one, **Print flyer**. With two schools the buttons name the school
//     ("Copy Worcester link"; Download says it to screen readers after its own words,
//     "Download QR code, Worcester" — v1.111);
//   - a section may add one line of its own under the cards (Black Belt's ?dan= hint);
//   - (a) a failed copy or download shows its amber note INSIDE the box, under the cards, until the
//     box closes or that action works (v1.004) — shared words;
//   - (b) Download QR code saves a 1024-pixel PNG named "[event] - [school] QR code.png"
//     (src/lib/qr.js, which also makes the QR picture, as today: no network);
//   - Close on PC and tablet; a full-screen page with the back arrow on phones.
// Print flyer: the section's own flyer (each prints its own today) is drawn into the page, the
// browser's print window opens, and the flyer is removed again afterwards (the flyer pattern).
// Forms keeps its own Share box (it also holds kiosk mode, v1.015). Nothing switches to it in
// Dashboard core step 1; each section does, in its own prompt.
//
// Props:
//   title       "Registration link" / "Registration links" (the section's words)
//   eventName   the event, camp or cycle ("November Children Testing")
//   intro       the section's line under it ("Registration is open until Fri, Nov 13. …")
//   links       one or two: [{ url, school?, heading?, shortUrl?, flyer? }]
//                 url       the full link (copied, and in the QR code)
//                 school    the school's name ("Worcester"), or null when one link serves both
//                 heading   the card's heading; default "<school> school" ("Both schools · held at
//                           Worcester" for Camps)
//                 shortUrl  the link as shown; default the url without "https://"
//                 flyer     optional () => the section's printed flyer (a portal into <body>, as today)
//   fileBase    the event's name for the PNG's file name (default eventName)
//   footnote    optional: the section's own line under the cards (may hold <code>)
//   onCopied    () => void — a copy worked (the section shows its "Link copied" toast)
//   onDownloaded optional () => void — a download worked (Black Belt's "QR code downloaded" toast)
//   onClose, isPhone
//   copy        optional (url) => Promise — how the link is copied; default the browser's clipboard
//   makePng     optional (url) => Promise<Blob | null> — how the picture is made; default qrPngBlob
//               (the parts page passes failing ones, to show the failure note)
import { useEffect, useState } from 'react';
import { IconCopy, IconDownload, IconPrinter } from '@tabler/icons-react';
import Dialog from './Dialog.jsx';
import Notice from './Notice.jsx';
import { qrFileName, qrPngBlob, qrSvgDataUrl, saveFile } from '../lib/qr.js';
import {
  CLOSE,
  COPY_FAILED,
  COPY_LINK,
  DOWNLOAD_QR,
  PRINT_FLYER,
  QR_FAILED,
  copySchoolLink,
  downloadSchoolQr,
  printSchoolFlyer,
  qrAlt,
  qrAltSchool,
  schoolHeading,
} from './text.js';

// "https://tkd-dashboard.pages.dev/register/p4w9tdkm" → "tkd-dashboard.pages.dev/register/p4w9tdkm"
const withoutScheme = (url) => String(url ?? '').replace(/^https?:\/\//, '');

// The link as shown, allowed to break onto a second line right after the first "/" (<wbr> = "a
// line may break here"), so a narrow card never cuts a word in half.
function LinkText({ text }) {
  const cut = text.indexOf('/') + 1;
  if (cut <= 0) return text;
  return (
    <>
      {text.slice(0, cut)}
      <wbr />
      {text.slice(cut)}
    </>
  );
}

// The browser's clipboard. (Some browsers refuse it, e.g. on a page that isn't https: then the
// promise fails and the box says so.)
function copyToClipboard(url) {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('No clipboard'));
  return navigator.clipboard.writeText(url);
}

export default function RegistrationLinkBox({
  title,
  eventName,
  intro,
  links,
  fileBase,
  footnote = null,
  onCopied,
  onDownloaded,
  onClose,
  isPhone = false,
  copy = copyToClipboard,
  makePng = qrPngBlob,
}) {
  const two = links.length > 1;
  // The amber note: { kind: 'copy' | 'download', text } — until the box closes or that action works.
  // Clearing it when the same action later works follows the "until fixed" rule (v1.004, §8 Toasts
  // and errors: a problem stays until fixed or dismissed).
  const [failure, setFailure] = useState(null);
  const [making, setMaking] = useState(false); // a PNG is being made (a second press waits)
  const [printing, setPrinting] = useState(null); // the link whose flyer is being printed

  // Print flyer: draw the section's flyer, open the print window, remove the flyer afterwards.
  useEffect(() => {
    if (printing === null) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const frame = window.requestAnimationFrame(() => window.print()); // one frame, so the flyer is there
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  async function copyLink(link) {
    try {
      await copy(link.url);
      setFailure((now) => (now?.kind === 'copy' ? null : now));
      onCopied?.();
    } catch {
      setFailure({ kind: 'copy', text: COPY_FAILED });
    }
  }

  async function download(link) {
    if (making) return;
    setMaking(true);
    try {
      const blob = await makePng(link.url);
      if (!blob) throw new Error('No picture');
      saveFile(blob, qrFileName(fileBase ?? eventName, link.school ?? null));
      setFailure((now) => (now?.kind === 'download' ? null : now));
      onDownloaded?.();
    } catch {
      setFailure({ kind: 'download', text: QR_FAILED });
    } finally {
      setMaking(false);
    }
  }

  const card = (link, index) => {
    const shown = link.shortUrl ?? withoutScheme(link.url);
    const qr = qrSvgDataUrl(link.url);
    const school = link.school ?? null;
    const named = two && school; // with two schools the buttons name the school
    return (
      <div key={link.url ?? index} className="ev-link-card">
        <p className="ev-link-school">{link.heading ?? (school ? schoolHeading(school) : '')}</p>
        {qr && <img className="ev-link-qr" src={qr} alt={named ? qrAltSchool(school, shown) : qrAlt(shown)} width={128} height={128} />}
        <p className="ev-link-url">
          <LinkText text={shown} />
        </p>
        <div className="ev-link-buttons">
          <button type="button" className="btn btn-sm" data-autofocus={index === 0 ? true : undefined} onClick={() => copyLink(link)}>
            {/* ti-copy = copy to clipboard */}
            <IconCopy size={16} aria-hidden="true" />
            {named ? copySchoolLink(school) : COPY_LINK}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-label={named ? downloadSchoolQr(school) : undefined}
            aria-disabled={making ? 'true' : undefined}
            onClick={() => download(link)}
          >
            {/* ti-download = save a file (rulebook 2.4) */}
            <IconDownload size={16} aria-hidden="true" />
            {DOWNLOAD_QR}
          </button>
          {link.flyer && (
            <button type="button" className="btn btn-sm" onClick={() => setPrinting(index)}>
              {/* ti-printer = print */}
              <IconPrinter size={16} aria-hidden="true" />
              {named ? printSchoolFlyer(school) : PRINT_FLYER}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog title={title} size={two ? 'wide' : 'detail'} className={two ? 'lnk-two' : ''} fullScreen={isPhone} onRequestClose={onClose}>
        <p className="tdialog-sub ev-link-event">{eventName}</p>
        {intro && <p className="ev-link-line">{intro}</p>}
        {two ? <div className="lnk-row">{links.map(card)}</div> : links.map(card)}
        {footnote && <p className="field-hint lnk-hint">{footnote}</p>}
        {failure && (
          <div className="tdialog-note">
            <Notice>{failure.text}</Notice>
          </div>
        )}
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              {CLOSE}
            </button>
          </div>
        )}
      </Dialog>
      {printing !== null && links[printing]?.flyer?.()}
    </>
  );
}
