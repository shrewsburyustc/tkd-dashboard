// PreviewBanner.jsx — the thin amber strip at the very top in preview mode.
// Why it exists: so nobody mistakes the fake preview backend for the real database. It also
// reminds testers of the fake password and PIN (README.md lists the console test helpers).
export default function PreviewBanner() {
  return (
    <div className="preview-banner" role="status">
      Preview mode — not connected to the real database. Password: preview · PIN: 2580
    </div>
  );
}
