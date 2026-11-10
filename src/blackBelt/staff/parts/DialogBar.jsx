// DialogBar.jsx — the amber "Couldn't save … Retry" bar INSIDE a Black Belt dialog or full-screen phone page,
// and it scrolls itself into view when it appears.
// Why it exists: such a bar sits at the TOP of the dialog's form, but the person pressed Save at the bottom.
// On a phone the dialog is a full-screen page whose own scroller was scrolled down, so the bar appeared above
// the visible area and it looked as if nothing had happened (design review D2). The shared Dialog scrolls a
// gray .notice into view but not an .errbar; Edit cycle's dialog already did it for its own bar
// (cycle/CycleDialog.jsx), and this is the same one-liner for the other dialogs.
// It is an ErrorBanner inside a wrapper that takes no space (display: contents), so the look is unchanged.
// It scrolls only the nearest scrollable box and never moves the keyboard focus (what the person is typing in
// stays where it is). It scrolls when the bar first appears and again when a Retry ends and the bar is
// still there (a Retry that failed again), with block: 'nearest' so a bar already in view does not move.
//
// Props: ErrorBanner's (text, onRetry, onDismiss, retrying, retryLabel).
import { useEffect, useRef } from 'react';
import ErrorBanner from '../../../components/ErrorBanner.jsx';

export default function DialogBar(props) {
  const boxRef = useRef(null);
  const { retrying, text } = props;
  useEffect(() => {
    boxRef.current?.querySelector('.errbar')?.scrollIntoView?.({ block: 'nearest' });
  }, [retrying, text]);
  return (
    <div ref={boxRef} style={{ display: 'contents' }}>
      <ErrorBanner {...props} />
    </div>
  );
}
