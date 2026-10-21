// FamilyFields.jsx — the "Parent or guardian" and "Emergency contact" cards on step 1 (C7a).
// Why it exists: one parent and one emergency contact per sign-up, each with name, phone and
// relationship to the child (rulebook v0.232). Phones are typed freely, e.g. "(508) 555-0142";
// the page sends just the 10 digits (contract 0013 §4.1). These phones are shown to staff only
// in Camper detail, never in lists (v0.700).
import { TextField } from './ChildCard.jsx';
import { fieldId } from './form.js';
import * as T from './text.js';

export default function FamilyFields({ form, setPerson, show, onLeave }) {
  return (
    <>
      <PersonCard who="parent" title={T.PARENT} person={form.parent} setPerson={setPerson} show={show} onLeave={onLeave} ownDetails />
      <PersonCard who="emergency" title={T.EMERGENCY} person={form.emergency} setPerson={setPerson} show={show} onLeave={onLeave} hint={T.EMERGENCY_HINT} />
    </>
  );
}

// One person's card. `ownDetails` = the parent's own name and phone, so the browser may offer
// to fill them in (autocomplete); the emergency contact's fields are left alone.
function PersonCard({ who, title, person, setPerson, show, onLeave, hint, ownDetails = false }) {
  const key = (field) => `${who}.${field}`;
  const set = (field) => (value) => setPerson(who, field, value);
  return (
    <section className="reg-card" aria-labelledby={`${fieldId(who)}-title`}>
      <h3 className="reg-card__title" id={`${fieldId(who)}-title`}>{title}</h3>
      <TextField id={fieldId(key('name'))} label={T.NAME} value={person.name} error={show(key('name'))} onChange={set('name')} onBlur={() => onLeave(key('name'))} autoComplete={ownDetails ? 'name' : 'off'} />
      <TextField
        id={fieldId(key('phone'))}
        label={T.PHONE}
        type="tel"
        inputMode="tel"
        value={person.phone}
        error={show(key('phone'))}
        onChange={set('phone')}
        onBlur={() => onLeave(key('phone'))}
        autoComplete={ownDetails ? 'tel' : 'off'}
        maxLength={20}
        autoCapitalize="off"
      />
      <TextField id={fieldId(key('relation'))} label={T.RELATION} value={person.relation} error={show(key('relation'))} onChange={set('relation')} onBlur={() => onLeave(key('relation'))} maxLength={60} autoCapitalize="sentences" />
      {hint ? <div className="reg-hint camp-person-hint">{hint}</div> : null}
    </section>
  );
}
