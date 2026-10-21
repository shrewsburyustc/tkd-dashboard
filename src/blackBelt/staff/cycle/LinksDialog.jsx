// LinksDialog.jsx — "Registration links": one link and QR code per school for a cycle.
// Why it exists: approved mockup Cycles 7, with Jeffrey's change (status §3b): Download QR code
// is ALWAYS available — open, not open yet, closed or finished, for staff and admins. It shows:
//   - "Spring 2027 Black Belt testing", then a line saying whether families can register now,
//     and "Each school has its own link; the link sets the candidate's school. …"
//   - two blocks side by side (stacked on phones): the school, its QR picture, the link,
//     Copy [school] link (toast "Link copied") and Download QR code (a PNG; toast
//     "QR code downloaded", no Undo)
//   - the ?dan=1 … ?dan=4 hint; Close (PC / tablet) — phones get a full screen with ←
// The links always use the production address (qr.js, contract OP-2 / OP-20): preview can't open
// them; __tkdPreview.bbLinks() prints local ones instead. No Print flyer for Black Belt.
// The QR picture is an <img> made in the browser (never inserted HTML); nothing is logged.
import { useState } from 'react';
import { IconCopy, IconDownload } from '@tabler/icons-react';
import Dialog from '../../../components/Dialog.jsx';
import Notice from '../../../components/Notice.jsx';
import { blackBeltLink, qrFileName, qrPngBlob, qrSvgDataUrl } from '../../../lib/blackBelt/qr.js';
import { LOCATION_NAME } from '../../../lib/device.js';
import * as T from '../text.js';

// "https://tkd-dashboard.pages.dev/black-belt/abcd2345" → "tkd-dashboard.pages.dev/black-belt/abcd2345"
const shortLink = (link) => link.replace(/^https?:\/\//, '');

// Saves a Blob as a file: a temporary link to it is clicked, then thrown away.
function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SchoolBlock({ cycleName, schoolCode, code, onCopy, onDownloaded, onFailed, autoFocus }) {
  const school = LOCATION_NAME[schoolCode];
  const link = blackBeltLink(code);
  const qr = qrSvgDataUrl(code);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await qrPngBlob(code);
      if (!blob) throw new Error('No picture');
      saveBlob(blob, qrFileName(cycleName, school));
      onDownloaded();
    } catch {
      onFailed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ev-link-card bb-link-card">
      <p className="ev-link-school">{T.schoolTitle(school)}</p>
      {qr && <img className="ev-link-qr" src={qr} alt={T.qrAlt(shortLink(link))} width={128} height={128} />}
      <p className="ev-link-url">{shortLink(link)}</p>
      <div className="ev-link-buttons bb-link-buttons">
        <button type="button" className="btn btn-sm" data-autofocus={autoFocus ? true : undefined} onClick={() => onCopy(code)}>
          {/* ti-copy = copy to clipboard */}
          <IconCopy size={16} aria-hidden="true" />
          {T.copySchoolLink(school)}
        </button>
        <button type="button" className="btn btn-sm" aria-disabled={busy ? 'true' : undefined} onClick={download}>
          {/* ti-download = save a file */}
          <IconDownload size={16} aria-hidden="true" />
          {T.DOWNLOAD_QR}
        </button>
      </div>
    </div>
  );
}

export default function LinksDialog({ cycle, isPhone, onCopy, showToast, onClose }) {
  const [failed, setFailed] = useState(false);
  const codes = cycle.codes ?? {};
  const common = {
    cycleName: cycle.name,
    onCopy,
    onDownloaded: () => {
      setFailed(false);
      showToast(T.TOAST_QR_DOWNLOADED, { icon: false });
    },
    onFailed: () => setFailed(true),
  };
  return (
    <Dialog title={T.REGISTRATION_LINKS} size="wide" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub ev-link-event">{T.linksSub(cycle.name)}</p>
      <p className="ev-link-line bb-link-line">
        {T.linksStateLine(cycle.state, cycle)} {T.LINKS_EXPLAIN}
      </p>
      {failed && <Notice>{T.QR_FAILED}</Notice>}
      <div className="bb-link-cards">
        <SchoolBlock schoolCode="worcester" code={codes.worcester} autoFocus {...common} />
        <SchoolBlock schoolCode="shrewsbury" code={codes.shrewsbury} {...common} />
      </div>
      <p className="field-hint bb-dan-hint">
        {T.DAN_HINT_START}
        <code>?dan=1</code>, <code>?dan=2</code>, <code>?dan=3</code> or <code>?dan=4</code>
        {T.DAN_HINT_END}
      </p>
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
