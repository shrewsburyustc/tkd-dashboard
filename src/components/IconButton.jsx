// IconButton.jsx — a small button that shows only an icon (Edit, ⋯, Dismiss, …).
// Why it exists: guidelines 2.1 / 2.5 / 1.4 / 4 — row actions are icon buttons drawn as a 28px
// square (44×44 tap area on touch screens), and EVERY icon-only button has:
//   - an aria-label (the name a screen reader reads), and
//   - on the PC, a dark tooltip bubble with exactly the same words, shown on mouse hover and on
//     keyboard focus (shared.css, ".tib-tip").
// Writing it once here means no icon button can forget either.
//
// The bubble normally sits ABOVE the button. If there's no room above (the row is at the top of
// the scrolling area), placeTip() flips it BELOW, so it's never cut off.
//
// Props:
//   label     the aria-label AND the tooltip text, e.g. "Edit Yellow"
//   Icon      a Tabler icon component
//   onClick
//   ...rest   anything else for the <button> (aria-haspopup, data-*, tabIndex, …)
// The nearest parent that scrolls or clips (e.g. the page's content area), or null.
function clippingParent(element) {
  let node = element.parentElement;
  while (node && node !== document.body) {
    if (/(auto|scroll|hidden)/.test(window.getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

// Called when the pointer enters or keyboard focus arrives: is there room for the bubble above?
// Marks the button data-tip="below" when there isn't (shared.css draws it underneath then).
export function placeTip(event) {
  const button = event.currentTarget;
  const tip = button.querySelector('.tib-tip, .grip-tip');
  if (!tip) return;
  const tipHeight = tip.offsetHeight || 30; // 0 while hidden; ~30px when shown
  const top = button.getBoundingClientRect().top;
  const parent = clippingParent(button);
  const limit = Math.max(0, parent ? parent.getBoundingClientRect().top : 0);
  if (top - tipHeight - 8 < limit) button.setAttribute('data-tip', 'below');
  else button.removeAttribute('data-tip');
}

export default function IconButton({ label, Icon, onClick, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`tib ${className}`.trim()}
      aria-label={label}
      onClick={onClick}
      onPointerEnter={placeTip}
      onFocus={placeTip}
      {...rest}
    >
      <span className="tib-box">
        <Icon size={16} aria-hidden="true" />
      </span>
      {/* aria-hidden: the aria-label above already says it */}
      <span className="tib-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}
