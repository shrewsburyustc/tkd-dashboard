// StarLinksDialog.jsx — "Registration links": both schools' family links, side by side.
// Why it exists: Events mockup screen 11 as changed by v0.99 and approved with the Form mockups
// (v0.107). Every Star event has TWO links, one per school, and the link sets the candidate's
// school (v0.98). The event page's outline button "Registration link" (ti-qrcode) opens it.
// Since the design review's part 2 (S8, rulebook v0.518, v1.106, v1.111) the box itself is the
// shared one (src/components/RegistrationLinkBox.jsx); this file only hands it Star's parts:
//   - the event name, then Star's one gray line: can families register right now (v0.92 detail
//     15), "Each school has its own link; the link sets the candidate's school." and "Families
//     choose their Dan on the form."
//   - two cards, Worcester first (side by side on PC and tablet, stacked on phones), each with
//     "<School> school", its QR code, its link, "Copy <School> link" (toast "Link copied"),
//     "Download QR code" (a 1024-pixel PNG, "[event] - Worcester QR code.png") and
//     "Print <School> flyer" (Star's own flyer, StarFlyer.jsx)
//   - a failed copy or download shows its amber note inside the box (the shared box's words)
//   - Close (PC / tablet); phones get a full screen with a back arrow
// The links are made by src/lib/star/links.js and the QR pictures by the shared src/lib/qr.js,
// both in the browser (no network), always for the fixed production address.
// Staff see and copy the links like admins (v0.92 detail 16c). Nothing here saves anything.
import RegistrationLinkBox from '../../../../components/RegistrationLinkBox.jsx';
import { qrSvgDataUrl } from '../../../../lib/qr.js';
import { starSchoolLinks } from '../../../../lib/star/links.js';
import { addressLine } from '../../../settings/text.js';
import StarFlyer from './StarFlyer.jsx';
import * as T from '../events/text.js';

// schools: Settings → Schools as loaded (for the flyer's "Location:" address), or null while loading.
// onCopied: a copy worked (the page shows its "Link copied" toast).
export default function StarLinksDialog({ event, schools, isPhone, onCopied, onClose }) {
  // The flyer's "Location:" is the Where school (v0.107), with its street address once Settings
  // → Schools has one.
  const where = schools?.find((s) => s.code === event.whereCode) ?? null;
  const whereSchool = where?.name ?? (event.whereCode === 'worcester' ? 'Worcester' : 'Shrewsbury');
  const addressText = where?.address ? addressLine(where.address) : null;

  // One card per school with a usable link. (A damaged code gives no link: that school's card is
  // left out rather than offering an empty link to copy.)
  const links = starSchoolLinks(event)
    .filter((s) => s.link)
    .map((s) => ({
      url: s.link,
      school: s.school,
      flyer: () => <StarFlyer event={event} school={{ ...s, qr: qrSvgDataUrl(s.link) }} whereSchool={whereSchool} addressText={addressText} />,
    }));

  return (
    <RegistrationLinkBox
      title={T.LINKS_TITLE}
      eventName={event.name}
      intro={`${T.registrationStatusLine(event)} ${T.EACH_SCHOOL_LINK} ${T.DAN_ON_FORM}`}
      links={links}
      onCopied={onCopied}
      onClose={onClose}
      isPhone={isPhone}
    />
  );
}
