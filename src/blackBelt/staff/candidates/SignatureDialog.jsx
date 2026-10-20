// SignatureDialog.jsx — "Signature" (admins only), from the waiver line in the candidate's detail.
// Why it exists: contract CONTRACT-0016-B2 §3.10, rulebook v0.213 (only admins open a signature).
// It asks the database for the picture (loadSignature) when it opens and shows it as an <img> on a
// white background with "Signed by Jordan Kim · Mar 10, 2027". A paper waiver has no picture
// ("Signed on paper. There is no signature picture."); after the keeping time the picture and the
// signer's name are gone ("… were deleted on [date] after the keeping time.").
// Privacy: the picture lives only in this dialog's state and is dropped when it closes; it is never
// stored, logged or put in an address. Opening it isn't logged (S20).
import Dialog from '../../../components/Dialog.jsx';
import ErrorBanner from '../../../components/ErrorBanner.jsx';
import * as T from '../text.js';

export default function SignatureDialog({ state, isPhone, onCancel }) {
  const r = state.result;
  let body;
  if (state.status === 'loading') {
    body = (
      <div className="tskeleton" aria-busy="true">
        <span className="visually-hidden">{T.LOADING_SIGNATURE}</span>
        <div className="tskeleton-row" aria-hidden="true">
          <span className="tskeleton-bar" />
        </div>
      </div>
    );
  } else if (state.status === 'not_allowed') {
    body = <p className="tdialog-sub">{T.NOT_ALLOWED}</p>;
  } else if (state.status !== 'ready' || !r) {
    body = <ErrorBanner text={T.LOAD_FAILED} />;
  } else if (r.removedAt) {
    body = <p className="tdialog-sub">{T.signatureDeleted(r.removedAt)}</p>;
  } else if (!r.signature) {
    body = <p className="tdialog-sub">{T.SIGNED_ON_PAPER_ONLY}</p>;
  } else {
    body = (
      <>
        <div className="bb-signature">
          <img src={r.signature} alt={T.signatureAlt(r.signerName ?? '')} />
        </div>
        <p className="tdialog-sub bb-signature-line">{T.signedByOn(r.signerName ?? '', r.signedAt)}</p>
      </>
    );
  }
  return (
    <Dialog title={T.SIGNATURE_TITLE} size="detail" fullScreen={isPhone} onRequestClose={onCancel}>
      {body}
      {!isPhone && (
        <div className="dialog-actions">
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            {T.CLOSE}
          </button>
        </div>
      )}
    </Dialog>
  );
}
