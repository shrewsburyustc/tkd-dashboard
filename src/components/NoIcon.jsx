// NoIcon.jsx — a blank 16px icon slot for a ⋯ menu item that has no icon.
// Why it exists: a few menu items are drawn without an icon (Close registration, Open registration,
// Close form, Today …), and the blank slot keeps their words lined up with the items that have one.
// It used to be copied into six files (design review pass 1, Smaller); typed once now (v1.141).
// The shared class .ev-noicon (shared.css) gives the slot its width.
export default function NoIcon() {
  return <span className="menu-icon ev-noicon" aria-hidden="true" />;
}
