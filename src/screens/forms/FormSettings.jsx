// FormSettings.jsx — the form's own settings (right panel when no field is chosen; mockup screen 6).
// Why it exists: the thank-you message ({parent} and {class time} fill in automatically), the
// two email switches, the school alert address, the web address (…/f/<slug>) and "Accepting
// sign-ups". The emails don't go out yet: the school's sending address is still open
// (rulebook v0.146), and the switches say so. "Accepting sign-ups" switches between Live and
// Closed right away (a Draft must be published first).
import Notice from '../../components/Notice.jsx';
import { emailOk, longTextProblem, slugOk } from '../../lib/forms/fields.js';
import * as T from './text.js';

export default function FormSettings({ form, name, slug, settings, readOnly, statusBusy, idBase, onName, onSlug, onSettings, onAccepting, nameError }) {
  const thankBad = settings.thank_you !== '' && longTextProblem(settings.thank_you, 500);
  const alert = settings.alert_email ?? '';
  return (
    <div className="fset">
      <h2 className="fset-title">{T.FORM_SETTINGS}</h2>
      <div className="field">
        <label htmlFor={`${idBase}-name`}>{T.FORM_NAME}</label>
        <input id={`${idBase}-name`} className="input" value={name} maxLength={200} readOnly={readOnly} onChange={(e) => onName(e.target.value)} />
        {nameError && <Notice>{nameError}</Notice>}
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-thanks`}>{T.THANK_YOU}</label>
        <textarea
          id={`${idBase}-thanks`}
          className="input ctextarea"
          rows={3}
          maxLength={600}
          readOnly={readOnly}
          value={settings.thank_you}
          aria-describedby={`${idBase}-thanks-hint`}
          onChange={(e) => onSettings({ thank_you: e.target.value })}
        />
        <p id={`${idBase}-thanks-hint`} className="field-hint">
          {T.THANK_YOU_HINT}
        </p>
        {thankBad && <Notice>{T.THANK_YOU_BAD}</Notice>}
      </div>
      <label className="ftoggle">
        <span>{T.CONFIRM_EMAIL}</span>
        <input type="checkbox" role="switch" checked={settings.confirm_email} disabled={readOnly} aria-describedby={`${idBase}-email-later`} onChange={(e) => onSettings({ confirm_email: e.target.checked })} />
      </label>
      <label className="ftoggle">
        <span>{T.ADD_TO_CALENDAR}</span>
        <input type="checkbox" role="switch" checked={settings.add_to_calendar} disabled={readOnly} onChange={(e) => onSettings({ add_to_calendar: e.target.checked })} />
      </label>
      <div className="field">
        <label htmlFor={`${idBase}-alert`}>{T.ALERT_EMAIL}</label>
        <input
          id={`${idBase}-alert`}
          className="input"
          type="email"
          maxLength={254}
          readOnly={readOnly}
          value={alert}
          placeholder={T.ALERT_EMAIL_HINT}
          onChange={(e) => onSettings({ alert_email: e.target.value.trim() === '' ? null : e.target.value.trim() })}
        />
        {alert && !emailOk(alert) && <Notice>{T.EMAIL_BAD}</Notice>}
      </div>
      <p id={`${idBase}-email-later`} className="flater">
        {T.EMAIL_NOT_READY}
      </p>
      <div className="field">
        <label htmlFor={`${idBase}-slug`}>{T.WEB_ADDRESS}</label>
        <span className="fslug">
          <span className="fslug-pre">…/f/</span>
          <input id={`${idBase}-slug`} className="input" value={slug} maxLength={40} readOnly={readOnly} aria-describedby={`${idBase}-slug-hint`} onChange={(e) => onSlug(e.target.value.toLowerCase())} />
        </span>
        <p id={`${idBase}-slug-hint`} className="field-hint">
          {T.SLUG_HINT}
        </p>
        {!slugOk(slug) && <Notice>{T.SLUG_BAD}</Notice>}
      </div>
      <label className="ftoggle">
        <span>{T.ACCEPTING}</span>
        <input
          type="checkbox"
          role="switch"
          checked={form.status === 'live'}
          disabled={readOnly || form.status === 'draft' || statusBusy}
          onChange={(e) => onAccepting(e.target.checked)}
        />
      </label>
      {form.status === 'draft' && <p className="field-hint">{T.ACCEPTING_DRAFT}</p>}
    </div>
  );
}
