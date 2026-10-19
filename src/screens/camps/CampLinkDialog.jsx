// CampLinkDialog.jsx — "Registration link": the camp's family sign-up link and QR code (C5).
// Why it exists: every camper comes in through the family form (there is no Add camper button).
// A parent at the desk scans the QR code off the screen, or staff open the link on the desk
// tablet and hand it over. Adapted from Color Belt's RegistrationLinkDialog (R2):
//   - the camp name, then "Family sign-up is open until Sun, Apr 18. Families choose their
//     child's days and extras on the form."
//   - a card: the school ("Both schools · held at Worcester" — one link for both schools), the QR
//     code (made in the browser by src/lib/camps/qr.js, no network, drawn as an <img>), the short
//     link, Copy link (ti-copy, toast "Link copied") and Download QR code (ti-download — an image
//     file the owner puts on his own flyer)
//   - no Print flyer: Camps deliberately doesn't have one (C5 note)
//   - Close on PC / tablet; full screen with a back arrow on phones
//
// Props: camp, state (signupState code), isPhone, onCopy(link), onDownloadFailed(), onClose
import { IconCopy, IconDownload } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import { campLink, campQrPngBlob, campQrSvgDataUrl, qrFileName } from '../../lib/camps/qr.js';
import * as T from './text.js';

// "https://tkd-dashboard.pages.dev/camp/k7m2qpxa" → "tkd-dashboard.pages.dev/camp/k7m2qpxa"
const shortLink = (link) => link.replace(/^https?:\/\//, '');

export default function CampLinkDialog({ camp, state, isPhone, onCopy, onDownloadFailed, onClose }) {
  const link = campLink(camp.publicCode);
  const qr = campQrSvgDataUrl(camp.publicCode);

  // Download QR code: draw the code as a PNG in the browser and save it with the camp's name
  // ("april-vacation-camp-qr.png"). A temporary link element with `download` makes the browser
  // save the file instead of opening it.
  async function download() {
    try {
      const blob = await campQrPngBlob(camp.publicCode);
      if (!blob) throw new Error('No image');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = qrFileName(camp.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      onDownloadFailed();
    }
  }

  return (
    <Dialog title={T.REGISTRATION_LINK} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub ev-link-event">{camp.name}</p>
      <p className="ev-link-line">{T.linkDialogLine(state, camp)}</p>
      <div className="ev-link-card">
        <p className="ev-link-school">{T.campSchoolLine(camp)}</p>
        {qr && <img className="ev-link-qr" src={qr} alt={T.qrAlt(shortLink(link))} width={128} height={128} />}
        <p className="ev-link-url">{shortLink(link)}</p>
        <div className="ev-link-buttons">
          <button type="button" className="btn btn-sm" data-autofocus onClick={() => onCopy(link)}>
            {/* ti-copy = copy to clipboard */}
            <IconCopy size={16} aria-hidden="true" />
            {T.COPY_LINK}
          </button>
          <button type="button" className="btn btn-sm" onClick={download}>
            {/* ti-download = export / download (rulebook 2.4) */}
            <IconDownload size={16} aria-hidden="true" />
            {T.DOWNLOAD_QR}
          </button>
        </div>
      </div>
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
