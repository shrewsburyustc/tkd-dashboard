// LinksDialog.jsx — "Registration links": one link and QR code per school for a cycle.
// Why it exists: approved mockup Cycles 7, with Jeffrey's change (status §3b): Download QR code
// is ALWAYS available — open, not open yet, closed or finished, for staff and admins. Since the
// design review's part 2 (BB10, rulebook v1.015 / v1.106 / v1.111) the box itself is the shared one
// (src/components/RegistrationLinkBox.jsx, like Star's StarLinksDialog); this file only hands it
// Black Belt's parts:
//   - "Spring 2027 Black Belt testing", then a line saying whether families can register now,
//     and "Each school has its own link; the link sets the candidate's school. …"
//   - two cards, Worcester first (side by side on PC and tablet, stacked on phones), each with
//     "<School> school", its QR code, its link, "Copy <School> link" (toast "Link copied") and
//     "Download QR code" (a 1024-pixel PNG, "[cycle] - Worcester QR code.png"; toast "QR code
//     downloaded", no Undo). No Print flyer for Black Belt.
//   - the ?dan=1 … ?dan=4 hint, as the box's own line under the cards (its `footnote`)
//   - a failed copy or download shows its amber note inside the box (the shared box's words)
//   - Close (PC / tablet); phones get a full screen with ←
// The links always use the production address (blackBeltLink, contract OP-2 / OP-20): preview can't
// open them; __tkdPreview.bbLinks() prints local ones instead. The QR picture is an <img> made in
// the browser (never inserted HTML); nothing is logged. Nothing here saves anything.
import RegistrationLinkBox from '../../../components/RegistrationLinkBox.jsx';
import { blackBeltLink } from '../../../lib/blackBelt/qr.js';
import { LOCATION_NAME } from '../../../lib/device.js';
import * as T from '../text.js';

export default function LinksDialog({ cycle, isPhone, showToast, onClose }) {
  const codes = cycle.codes ?? {};
  // One card per school with a usable link. (A damaged code gives no link: that school's card is
  // left out rather than offering an empty link to copy.)
  const links = ['worcester', 'shrewsbury']
    .map((code) => ({ url: blackBeltLink(codes[code]), school: LOCATION_NAME[code] }))
    .filter((link) => link.url);

  return (
    <RegistrationLinkBox
      title={T.REGISTRATION_LINKS}
      eventName={T.linksSub(cycle.name)}
      intro={`${T.linksStateLine(cycle.state, cycle)} ${T.LINKS_EXPLAIN}`}
      links={links}
      fileBase={cycle.name}
      footnote={
        <>
          {T.DAN_HINT_START}
          <code>?dan=1</code>, <code>?dan=2</code>, <code>?dan=3</code> or <code>?dan=4</code>
          {T.DAN_HINT_END}
        </>
      }
      onCopied={() => showToast(T.TOAST_LINK_COPIED, { icon: false })}
      onDownloaded={() => showToast(T.TOAST_QR_DOWNLOADED, { icon: false })}
      onClose={onClose}
      isPhone={isPhone}
    />
  );
}
