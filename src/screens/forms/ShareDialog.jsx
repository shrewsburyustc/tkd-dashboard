// ShareDialog.jsx — Share: link, QR code, kiosk (mockup screen 7).
// Why it exists: three ways to get a form to families. In this step (F4) only the link works:
// the public page, its QR code and kiosk mode arrive together in step F3 (the QR library comes
// with the Color Belt merge). The dialog says so instead of showing buttons that do nothing.
// A Draft form can't be shared until it's published.
import { useState } from 'react';
import { IconCopy, IconDeviceTablet, IconQrcode } from '@tabler/icons-react';
import Dialog from '../../components/Dialog.jsx';
import Notice from '../../components/Notice.jsx';
import * as T from './text.js';

export default function ShareDialog({ form, isPhone, onClose }) {
  const [copied, setCopied] = useState(false);
  const link = `${T.PUBLIC_BASE}${form.slug}`;
  const draft = form.status === 'draft';

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog title={T.shareTitle(form.name)} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.STATUS[form.status]}</p>
      {draft ? (
        <Notice>{T.SHARE_DRAFT}</Notice>
      ) : (
        <>
          {form.status === 'closed' && <p className="field-hint">{T.SHARE_CLOSED}</p>}
          <div className="field">
            <label htmlFor="share-link">{T.LINK}</label>
            <div className="fcopyrow">
              <input id="share-link" className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" data-autofocus onClick={copy}>
                <IconCopy size={16} aria-hidden="true" />
                {copied ? T.COPIED : T.COPY}
              </button>
            </div>
            <p className="field-hint">{T.LINK_LATER}</p>
            <span className="visually-hidden" aria-live="polite">
              {copied ? T.COPIED : ''}
            </span>
          </div>
          <div className="field">
            <span className="field-label">{T.QR_CODE}</span>
            <p className="flater">
              <IconQrcode size={16} aria-hidden="true" />
              {T.QR_LATER}
            </p>
          </div>
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
  );
}
