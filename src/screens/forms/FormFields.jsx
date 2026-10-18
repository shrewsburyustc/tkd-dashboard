// FormFields.jsx — one step of a form as families see it (used by "Fill in" and Preview).
// Why it exists: staff "Fill in" shows the same steps as the public page (mockup screens 8, 10),
// and Preview shows the admin exactly that. Drawing the fields in one place keeps them alike.
// (The public page of step F3 will reuse the same field rules from lib/forms/fields.js.)
//
// Props:
//   fields      the fields of THIS step (already in order)
//   values      { answers, children: [{ first_name, age }], bookings: { childIndex: timeKey }, signature, agreed }
//   problems    { fieldId | 'children' | 'signature': code } — shown under the field
//   times       the open free-class times [{ classId, className, date, start, end, spotsLeft }] | null (loading) | 'error'
//   readOnly    true while sending
//   idBase      unique prefix for ids
//   onAnswer(fieldId, value)  onChildren(list)  onBooking(childIndex, timeKey | '')  onSignature(dataUrl | null)
import { IconPlus, IconTrash } from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import { isVisible, MAX_CHILDREN } from '../../lib/forms/fields.js';
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import { weekStart } from '../../lib/calendar/days.js';
import SignaturePad from './SignaturePad.jsx';
import * as T from './text.js';

export const timeKey = (t) => `${t.classId}|${t.date}|${t.start}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const nextWeek = (monday) => {
  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
};

function Problem({ id, code }) {
  if (!code) return null;
  return <Notice id={id}>{T.FIELD_PROBLEM[code] ?? T.FIELD_PROBLEM.required}</Notice>;
}

export default function FormFields({ fields, values, problems, times, readOnly, idBase, onAnswer, onChildren, onBooking, onSignature }) {
  const { answers, children } = values;

  function question(f) {
    const id = `${idBase}-${f.id}`;
    const errId = `${id}-error`;
    const code = problems[f.id];
    const v = answers[f.id];
    const aria = { 'aria-invalid': code ? true : undefined, 'aria-describedby': [code ? errId : null, f.help ? `${id}-help` : null].filter(Boolean).join(' ') || undefined };
    const required = f.required || ['parent_name', 'parent_phone', 'parent_email'].includes(f.type);
    const label = (
      <>
        {f.label}
        {!required && <span className="fopt"> (optional)</span>}
      </>
    );
    const help = f.help ? (
      <p id={`${id}-help`} className="field-hint">
        {f.help}
      </p>
    ) : null;

    if (['choice', 'checkboxes'].includes(f.type)) {
      const many = f.type === 'checkboxes';
      const list = many ? (Array.isArray(v) ? v : []) : v;
      return (
        <fieldset key={f.id} className="field cfieldset" aria-describedby={aria['aria-describedby']}>
          <legend className="field-label">{label}</legend>
          {help}
          <div className="fchoices">
            {f.options.map((o) => (
              <label key={o} className="cbox fchoice">
                <input
                  type={many ? 'checkbox' : 'radio'}
                  name={id}
                  checked={many ? list.includes(o) : list === o}
                  disabled={readOnly}
                  onChange={(e) => onAnswer(f.id, many ? (e.target.checked ? [...list, o] : list.filter((x) => x !== o)) : o)}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <Problem id={errId} code={code} />
        </fieldset>
      );
    }

    let control;
    const common = { id, className: 'input', readOnly, ...aria };
    switch (f.type) {
      case 'long_text':
        control = <textarea {...common} className="input ctextarea" rows={3} value={v ?? ''} onChange={(e) => onAnswer(f.id, e.target.value)} />;
        break;
      case 'dropdown':
        control = (
          <select {...common} className="input sdialog-select" disabled={readOnly} value={v ?? ''} onChange={(e) => onAnswer(f.id, e.target.value || undefined)}>
            <option value="">{T.PICK}</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
        break;
      case 'number':
        control = (
          <input
            {...common}
            type="number"
            inputMode="decimal"
            value={v ?? ''}
            onChange={(e) => onAnswer(f.id, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        );
        break;
      case 'date':
        control = <input {...common} type="date" value={v ?? ''} onChange={(e) => onAnswer(f.id, e.target.value || undefined)} />;
        break;
      default: {
        const type = ['phone', 'parent_phone'].includes(f.type) ? 'tel' : ['email', 'parent_email'].includes(f.type) ? 'email' : 'text';
        const auto = { parent_name: 'name', parent_phone: 'tel', parent_email: 'email' }[f.type];
        control = <input {...common} type={type} autoComplete={auto} maxLength={300} value={v ?? ''} onChange={(e) => onAnswer(f.id, e.target.value)} />;
      }
    }
    return (
      <div key={f.id} className="field">
        <label htmlFor={id}>{label}</label>
        {control}
        {help}
        <Problem id={errId} code={code} />
      </div>
    );
  }

  function childrenBlock(f) {
    const set = (i, patch) => onChildren(children.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    return (
      <div key={f.id} className="fchildren">
        <span className="field-label">{f.label}</span>
        {children.map((c, i) => (
          <div key={i} className="fchild">
            <div className="fchild-head">
              <span className="fchild-title">{T.CHILD(i + 1)}</span>
              {children.length > 1 && !readOnly && (
                <button type="button" className="icon-button" aria-label={T.removeChild(i + 1)} onClick={() => onChildren(children.filter((_, j) => j !== i))}>
                  <IconTrash size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="fchild-row">
              <div className="field">
                <label htmlFor={`${idBase}-child-${i}-name`}>{T.FIRST_NAME}</label>
                <input id={`${idBase}-child-${i}-name`} className="input" maxLength={60} readOnly={readOnly} value={c.first_name} onChange={(e) => set(i, { first_name: e.target.value })} />
              </div>
              <div className="field fchild-age">
                <label htmlFor={`${idBase}-child-${i}-age`}>{T.AGE}</label>
                <input
                  id={`${idBase}-child-${i}-age`}
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={99}
                  readOnly={readOnly}
                  value={c.age ?? ''}
                  onChange={(e) => set(i, { age: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        ))}
        {children.length < MAX_CHILDREN && !readOnly && (
          <button type="button" className="btn fchild-add" onClick={() => onChildren([...children, { first_name: '', age: null }])}>
            <IconPlus size={16} aria-hidden="true" />
            {T.ADD_CHILD}
          </button>
        )}
        <Problem code={problems.children} />
      </div>
    );
  }

  function bookingBlock(f) {
    if (times === null) return <p key={f.id} className="field-hint">{T.LOADING_TIMES}</p>;
    if (times === 'error') return <Notice key={f.id}>{T.TIMES_FAILED}</Notice>;
    return (
      <div key={f.id} className="fbooking">
        <span className="field-label">{f.label}</span>
        {f.help && <p className="field-hint">{f.help}</p>}
        {times.length === 0 ? (
          <p className="fnotimes">{T.NO_OPEN_TIMES}</p>
        ) : (
          children.map((c, i) => {
            // Grouped like the public page: This week, Next week, then by week (mockup screen 8).
            const groups = [];
            const thisWeek = weekStart(times[0].date <= today() ? times[0].date : today());
            for (const t of times) {
              const w = weekStart(t.date);
              const label = w === thisWeek ? T.THIS_WEEK : w === nextWeek(thisWeek) ? T.NEXT_WEEK : T.weekOf(formatDate(w, { weekday: false, year: false }));
              if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, times: [] });
              groups[groups.length - 1].times.push(t);
            }
            const chosen = values.bookings[i] ?? '';
            const name = `${idBase}-book-${i}`;
            // Every time shows its spots left (Jeffrey, F5 difference 9); the last spot is amber.
            const slot = (key, text, spots) => (
              <label key={key || 'none'} className={`ftslot${chosen === key ? ' is-on' : ''}`}>
                <input type="radio" name={name} value={key} checked={chosen === key} disabled={readOnly} onChange={() => onBooking(i, key)} />
                <span className="ftslot-text">{text}</span>
                {spots != null && <span className={`ftslot-right${spots === 1 ? ' is-last' : ''}`}>{T.spotsLeft(spots)}</span>}
              </label>
            );
            return (
              <fieldset key={i} className="field cfieldset">
                <legend className="field-label">{T.pickTimeFor(c.first_name.trim() || T.CHILD(i + 1))}</legend>
                {groups.map((g) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <p className="ftday">{g.label}</p>
                    {g.times.map((t) =>
                      slot(timeKey(t), `${formatDate(t.date, { year: false })} · ${formatTime(parseTime(t.start), true)} · ${t.className}`, t.spotsLeft),
                    )}
                  </div>
                ))}
                {slot('', T.NO_TIME, null)}
              </fieldset>
            );
          })
        )}
      </div>
    );
  }

  function waiverBlock(f) {
    const id = `${idBase}-${f.id}`;
    return (
      <div key={f.id} className="fwaiver">
        <span className="field-label">{f.label}</span>
        <div className="fwaiver-text" tabIndex={0}>
          {f.text}
        </div>
        <label className="cbox">
          <input type="checkbox" checked={answers[f.id] === true} disabled={readOnly} onChange={(e) => onAnswer(f.id, e.target.checked ? true : undefined)} />
          <span>{T.AGREE}</span>
        </label>
        <Problem code={problems[f.id]} />
        <span id={`${id}-sig-label`} className="field-label">
          {T.SIGN_HERE}
        </span>
        <p id={`${id}-sig-hint`} className="field-hint">
          {T.SIGN_HINT}
        </p>
        <SignaturePad value={values.signature} onChange={onSignature} disabled={readOnly} labelId={`${id}-sig-label`} hintId={`${id}-sig-hint`} />
        <Problem code={problems.signature} />
      </div>
    );
  }

  return (
    <div className="ffields">
      {fields.map((f) => {
        if (!isVisible(f, answers)) return null;
        if (f.type === 'heading') {
          return (
            <div key={f.id} className="fheading">
              <h3>{f.label}</h3>
              {f.help && <p>{f.help}</p>}
            </div>
          );
        }
        if (f.type === 'children') return childrenBlock(f);
        if (f.type === 'booking') return bookingBlock(f);
        if (f.type === 'waiver') return waiverBlock(f);
        return question(f);
      })}
    </div>
  );
}
