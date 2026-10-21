// StarLinksDialog.jsx — "Registration links": both schools' family links, side by side.
// Why it exists: Events mockup screen 11 as changed by v0.99 and approved with the Form mockups
// (v0.107). Every Star event has TWO links, one per school, and the link sets the candidate's
// school (v0.98). The event page's outline button "Registration link" (ti-qrcode) opens it:
//   - the event name, then one gray line: can families register right now (v0.92 detail 15),
//     "Each school has its own link; the link sets the candidate's school." and "Families choose
//     their Dan on the form."
//   - two cards, Worcester first (side by side on PC and tablet, stacked on phones), each with
//     "<School> school", its QR code, its link (wraps instead of being cut off on narrow phones),
//     "Copy <School> link" (ti-copy, toast "Link copied") and "Print <School> flyer" (ti-printer)
//   - Close (PC / tablet); phones get a full screen with a back arrow (Dialog.jsx)
// The links and QR codes are made in the browser by src/lib/star/links.js (no network), always for
// the fixed production address, and drawn as <img> (never as inserted HTML).
// Staff see and copy the links like admins (v0.92 detail 16c). Nothing here saves anything.
import { useEffect, useState } from 'react';
import { IconCopy, IconPrinter } from '@tabler/icons-react';
import Dialog from '../../../../components/Dialog.jsx';
import Notice from '../../../../components/Notice.jsx';
import { starQrSvgDataUrl, starSchoolLinks } from '../../../../lib/star/links.js';
import { addressLine } from '../../../settings/text.js';
import StarFlyer, { shortLink } from './StarFlyer.jsx';
import * as T from '../events/text.js';

// "tkd-dashboard.pages.dev/star/fa2kxm7p" → ["tkd-dashboard.pages.dev/", "star/fa2kxm7p"]
const splitLink = (text) => {
  const cut = text.indexOf('/') + 1;
  return cut > 0 ? [text.slice(0, cut), text.slice(cut)] : [text];
};

// schools: Settings → Schools as loaded (for the flyer's "Location:" address), or null while loading.
export default function StarLinksDialog({ event, schools, isPhone, onCopy, copyFailed, onClose }) {
  const links = starSchoolLinks(event).map((s) => ({ ...s, qr: s.code ? starQrSvgDataUrl(s.code) : '' }));
  const [printing, setPrinting] = useState(null); // the school being printed, or null

  // Print flyer: draw that school's flyer, then open the browser's print window. 'afterprint'
  // fires when the window closes (printed or cancelled); then the flyer is removed again.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    // Wait one frame so the flyer (and its QR picture) is on the page before printing.
    const frame = window.requestAnimationFrame(() => window.print());
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  // The flyer's "Location:" is the Where school (v0.107), with its street address once Settings
  // → Schools has one.
  const where = schools?.find((s) => s.code === event.whereCode) ?? null;
  const whereSchool = where?.name ?? (event.whereCode === 'worcester' ? 'Worcester' : 'Shrewsbury');
  const addressText = where?.address ? addressLine(where.address) : null;
  const printed = printing ? links.find((s) => s.locationCode === printing) : null;

  return (
    <>
      <Dialog title={T.LINKS_TITLE} size="wide" fullScreen={isPhone} onRequestClose={onClose}>
        <div className="st-links">
          <p className="tdialog-sub">{event.name}</p>
          <p className="st-links-line">
            {T.registrationStatusLine(event)} {T.EACH_SCHOOL_LINK} {T.DAN_ON_FORM}
          </p>
          <div className="st-links-row">
            {links.map((s, index) => (
              <section key={s.locationCode} className="st-link-card" aria-label={T.schoolHeading(s.school)}>
                <h3 className="st-link-school">{T.schoolHeading(s.school)}</h3>
                {s.link ? (
                  <>
                    {s.qr && <img className="ev-link-qr" src={s.qr} alt={T.qrAlt(s.school, shortLink(s.link))} width={128} height={128} />}
                    {/* The link may wrap only after "pages.dev/", never in the middle of a word */}
                    <p className="ev-link-url st-link-url">
                      {splitLink(shortLink(s.link)).map((part, i) => (
                        <span key={part}>
                          {i > 0 && <wbr />}
                          <span className="st-nowrap">{part}</span>
                        </span>
                      ))}
                    </p>
                    <div className="ev-link-buttons">
                      <button type="button" className="btn btn-sm" data-autofocus={index === 0 ? true : undefined} onClick={() => onCopy(s.link)}>
                        {/* ti-copy = copy to clipboard */}
                        <IconCopy size={16} aria-hidden="true" />
                        {T.copySchoolLink(s.school)}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setPrinting(s.locationCode)}>
                        {/* ti-printer = print */}
                        <IconPrinter size={16} aria-hidden="true" />
                        {T.printSchoolFlyer(s.school)}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="field-hint">{T.NO_LINK}</p>
                )}
              </section>
            ))}
          </div>
          {copyFailed && (
            <div className="tdialog-note">
              <Notice>{T.COPY_FAILED_IN_DIALOG}</Notice>
            </div>
          )}
        </div>
        {!isPhone && (
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>
              {T.CLOSE}
            </button>
          </div>
        )}
      </Dialog>
      {printed && <StarFlyer event={event} school={printed} whereSchool={whereSchool} addressText={addressText} />}
    </>
  );
}
