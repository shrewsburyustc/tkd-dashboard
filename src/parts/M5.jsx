// M5.jsx — the parts page's samples of the shared Registration link box
// (components/RegistrationLinkBox.jsx; mockup M5, rulebook v1.106).
// Why it exists: the parts page (plan §4) shows every state with fake events (no database). The
// QR codes are real (src/lib/qr.js). "A failure" presses Download QR code with a sample picture
// maker that fails, so the box shows its own amber note; Copy link there fails too (a sample copy
// that fails), to check the other sentence by hand. In the other states Copy link really copies
// and Download QR code really saves the 1024-pixel PNG.
import { useState } from 'react';
import RegistrationLinkBox from '../components/RegistrationLinkBox.jsx';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { findByWords, pressLikeKeyboard, useLater } from './act.js';

const ORIGIN = 'https://tkd-dashboard.pages.dev';

// A stand-in flyer (each section prints its own; Color Belt's and Star's are letter pages). It is
// drawn into the page only while printing; the box prints it.
function SampleFlyer({ school }) {
  return <p className="parts-note">Sample flyer for {school} (each section prints its own).</p>;
}

const SAMPLES = {
  one: {
    title: 'Registration link',
    eventName: 'November Children Testing',
    intro: 'Registration is open until Fri, Nov 13. Families choose their class and belt on the form.',
    links: [{ url: `${ORIGIN}/register/p4w9tdkm`, school: 'Worcester', flyer: () => <SampleFlyer school="Worcester" /> }],
  },
  two: {
    title: 'Registration links',
    eventName: 'Fall Star Testing',
    intro: 'Registration is open until Tue, Nov 10. Each school has its own link; the link sets the candidate’s school. Families choose their Dan on the form.',
    links: [
      { url: `${ORIGIN}/star/fa2kxm7p`, school: 'Worcester', flyer: () => <SampleFlyer school="Worcester" /> },
      { url: `${ORIGIN}/star/r9ectw3h`, school: 'Shrewsbury', flyer: () => <SampleFlyer school="Shrewsbury" /> },
    ],
  },
  noflyer: {
    title: 'Registration link',
    eventName: 'April Vacation Camp',
    intro: 'Family sign-up opens on Mon, Mar 1. Families choose their child’s days and extras on the form.',
    links: [{ url: `${ORIGIN}/camp/k7m2qp4x`, school: null, heading: 'Both schools · held at Worcester' }],
  },
  bb: {
    title: 'Registration links',
    eventName: 'Spring 2027 Black Belt testing',
    intro: 'Registration is open until Sat, Mar 27. Each school has its own link; the link sets the candidate’s school. Families choose their Dan on the form.',
    links: [
      { url: `${ORIGIN}/black-belt/w6em58ap`, school: 'Worcester' },
      { url: `${ORIGIN}/black-belt/7mf5dau2`, school: 'Shrewsbury' },
    ],
    footnote: (
      <>
        To choose the Dan for a family, add <code>?dan=1</code>, <code>?dan=2</code>, <code>?dan=3</code> or <code>?dan=4</code> to the end of a link.
      </>
    ),
  },
};

// A sample section around the box: its "Link copied" toast is a line on the page.
function SampleLinks({ sample, failing = false }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const failingActions = failing
    ? { copy: () => Promise.reject(new Error('Sample: the copy fails')), makePng: () => Promise.resolve(null) }
    : {};
  return (
    <>
      <p className="parts-note">
        {!open && (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Open the box again
          </button>
        )}
        {toast && <span className="parts-toast">{toast}</span>}
      </p>
      {open && (
        <RegistrationLinkBox
          {...sample}
          onCopied={() => setToast('Sample toast: Link copied')}
          onDownloaded={() => setToast('Sample: the QR code PNG was saved')}
          onClose={() => setOpen(false)}
          isPhone={isPhone}
          {...failingActions}
        />
      )}
    </>
  );
}

// "A failure": Black Belt's two links (without its own line); Download QR code pressed with the
// keyboard, and the picture can't be made.
function FailedState() {
  useLater(() => pressLikeKeyboard(findByWords('[role=dialog] button', 'Download QR code, Worcester')), 300);
  return <SampleLinks sample={{ ...SAMPLES.bb, footnote: null }} failing />;
}

export const PART = {
  id: 'M5',
  title: 'The Registration link box',
  file: 'RegistrationLinkBox.jsx, src/lib/qr.js',
  states: [
    { id: 'one', title: 'One school link, with a flyer', dialog: true, render: () => <SampleLinks sample={SAMPLES.one} /> },
    { id: 'two', title: 'Two school links', dialog: true, render: () => <SampleLinks sample={SAMPLES.two} /> },
    { id: 'noflyer', title: 'No flyer', dialog: true, render: () => <SampleLinks sample={SAMPLES.noflyer} /> },
    { id: 'bb', title: 'Two links, no flyer, a section’s own line', dialog: true, render: () => <SampleLinks sample={SAMPLES.bb} /> },
    { id: 'failed', title: 'A copy or download that fails', dialog: true, render: () => <FailedState /> },
  ],
};
