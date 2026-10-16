// Notice.jsx — the amber message box with a warning triangle.
// Why it exists: every error or "please do this" message uses the same look (guidelines 7):
// amber text on a pale amber background, always with the triangle icon AND words — never red,
// and never color alone.
//
// id (optional): lets a form field point at the message with aria-describedby, so a screen
// reader reads the error together with the field it belongs to.
import { IconAlertTriangle } from '@tabler/icons-react';

export default function Notice({ id, children }) {
  // role="alert" makes screen readers announce the message as soon as it appears.
  return (
    <div id={id} className="notice" role="alert">
      <IconAlertTriangle size={16} aria-hidden="true" className="notice-icon" />
      <span>{children}</span>
    </div>
  );
}
