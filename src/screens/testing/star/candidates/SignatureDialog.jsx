// SignatureDialog.jsx — "View signature" (gap mockup G5).
// Why it exists: a family-form registration is ticked and signed (v0.102). The drawing can be looked
// at from the detail view's Acknowledgment line: a small dialog over the detail (phone: full screen
// with the back arrow) with the drawing on white, "Signed Sat, Oct 17, 2026, 4:12 PM on the family
// form, after ticking the acknowledgment." and Close. The drawing comes from viewSignature (not
// logged) and is shown as an <img> — never as inserted HTML. It stays available while "Hide private
// details" is on (G6: a signature isn't one of the three hidden kinds, v0.249).
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import * as T from './text.js';

export default function SignatureDialog({ state, name, eventName, isPhone, onClose }) {
  const sig = state.signature; // { signature: data URL | null, signedAt, signatureDeletedAt } or null
  return (
    <Dialog title={T.SIGNATURE_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onClose}>
      <p className="tdialog-sub">{T.signatureSub(name, eventName)}</p>
      {state.failed && (
        <div className="tdialog-note">
          <Notice>{T.LOAD_DETAIL_FAILED}</Notice>
        </div>
      )}
      {!sig && !state.failed && (
        <div className="tskeleton" aria-busy="true">
          <div className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        </div>
      )}
      {sig &&
        (sig.signature ? (
          <>
            <div className="st-sig-box">
              {/* Only a PNG data URL is drawn (the data layer checks it); an <img>, never inserted HTML. */}
              <img className="st-sig-img" src={sig.signature.startsWith('data:image/png;base64,') ? sig.signature : ''} alt={T.signatureAlt(name)} />
            </div>
            <p className="field-hint">{T.signedLine(sig.signedAt)}</p>
          </>
        ) : (
          <p className="field-hint">{T.SIGNATURE_GONE}</p>
        ))}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
