// FormFields.jsx — one step of a form as families see it (used by "Fill in" and Preview).
// Why it exists: staff "Fill in" shows the same steps as the public page (mockup screens 8, 10),
// and Preview shows the admin exactly that. Drawing the fields in one place keeps them alike.
// The public page (src/forms/FormsApp.jsx, step F3) draws its steps with this same component.
//
// Props:
//   fields      the fields of THIS step (already in order)
//   values      { answers, children: [{ first_name, age }], bookings: { childIndex: timeKey }, signature, agreed }
//   problems    { fieldId | 'children' | 'signature': code } — shown under the field
//   times       the open free-class times [{ classId, className, date, start, end, spotsLeft }] | null (loading) | 'error'
//   readOnly    true while sending
//   idBase      unique prefix for ids
//   noTimesText optional: the words when no free-class time is open (the public page says it to
//               the family; staff see the staff wording by default)
//   onAnswer(fieldId, value)  onChildren(list)  onBooking(childIndex, timeKey | '')  onSignature(dataUrl | null)
import { IconPlus, IconTrash } from '@tabler/icons-react';
import Notice from '../../components/Notice.jsx';
import { isVisible, MAX_CHILDREN, NO_TIME_KEY } from '../../lib/forms/fields.js';
import { formatDate } from '../../lib/schedule/versions.js';
import { formatTime, parseTime } from '../../lib/schedule/time.js';
import { classWithAges } from '../../lib/schedule/ages.js';
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

// noAutofill (the front-desk kiosk): the browser must not offer the previous family's name, phone
// or email on a shared tablet (kiosk plan), so every box says autocomplete="off".
export default function FormFields({ fields, values, problems, times, readOnly, idBase, noTimesText, noAutofill = false, onAnswer, onChildren, onBooking, onSignature }) {
  const off = noAutofill ? 'off' : undefined;
  // (on the kiosk the keyboard's spell-check and word suggestions are off too: they would learn
  // and offer one family's names and emails to the next — security review L4)
  const noLearn = noAutofill ? { autoCorrect: 'off', spellCheck: false } : {};
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
    const common = { id, className: 'input', readOnly, autoComplete: off, ...noLearn, ...aria };
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
        const auto = off ?? { parent_name: 'name', parent_phone: 'tel', parent_email: 'email' }[f.type];
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
                <input id={`${idBase}-child-${i}-name`} className="input" maxLength={60} autoComplete={off} {...noLearn} readOnly={readOnly} aria-invalid={problems.children ? true : undefined} aria-describedby={problems.children ? `${idBase}-children-err` : undefined} value={c.first_name} onChange={(e) => set(i, { first_name: e.target.value })} />
              </div>
              <div className="field fchild-age">
                <label htmlFor={`${idBase}-child-${i}-age`}>{T.AGE}</label>
                <input
                  id={`${idBase}-child-${i}-age`}
                  className="input"
                  autoComplete={off}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={99}
                  readOnly={readOnly}
                  aria-invalid={problems.children ? true : undefined}
                  aria-describedby={problems.children ? `${idBase}-children-err` : undefined}
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
        <Problem id={`${idBase}-children-err`} code={problems.children} />
      </div>
    );
  }

  function bookingBlock(f) {
    if (times === null) return <p key={f.id} className="field-hint">{T.LOADING_TIMES}</p>;
    if (times === 'error') return <Notice key={f.id}>{T.TIMES_FAILED}</Notice>;
    return (
      <div key={f.id} className="fbooking">
        {/* With times showing, each child's own "Free class for …" is the label (F3 difference 2). */}
        {times.length === 0 && <span className="field-label">{f.label}</span>}
        {f.help && <p className="field-hint">{f.help}</p>}
        {times.length === 0 ? (
          <p className="fnotimes">{noTimesText ?? T.NO_OPEN_TIMES}</p>
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
            const chosen = values.bookings[i] ?? null; // nothing ticked until the parent picks
            const name = `${idBase}-book-${i}`;
            // a brother's or sister's pick takes one of the spots too (design review, F3)
            const takenBy = (key) => children.map((x, j) => (j !== i && values.bookings[j] === key ? x.first_name.trim() || T.CHILD(j + 1) : null)).filter(Boolean);
            // Every time shows its spots left (Jeffrey, F5 difference 9); the last spot is amber.
            const slot = (key, text, spotsLeft) => {
              const others = key !== NO_TIME_KEY ? takenBy(key) : [];
              const spots = spotsLeft == null ? null : spotsLeft - others.length;
              const full = spots != null && spots <= 0 && chosen !== key;
              return (
                <label key={key} className={`ftslot${chosen === key ? ' is-on' : ''}${full ? ' is-full' : ''}`}>
                  <input type="radio" name={name} value={key} checked={chosen === key} disabled={readOnly || full} onChange={() => onBooking(i, key)} />
                  <span className="ftslot-text">{text}</span>
                  {spots != null && (
                    <span className={`ftslot-right${spots === 1 ? ' is-last' : ''}`}>{full ? T.takenBy(others.join(', ')) : T.spotsLeft(Math.max(spots, 1))}</span>
                  )}
                </label>
              );
            };
            // this child has no answer yet after Next: marked, with its own message (design review F3)
            const unpicked = problems[f.id] === 'booking_pick' && !chosen;
            const errId = `${name}-err`;
            return (
              <fieldset
                key={i}
                className="field cfieldset"
                aria-invalid={unpicked ? true : undefined}
                aria-describedby={unpicked ? errId : undefined}
              >
                <legend className="field-label">{T.pickTimeFor(c.first_name.trim() || T.CHILD(i + 1))}</legend>
                {groups.map((g) => (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <p className="ftday">{g.label}</p>
                    {g.times.map((t) =>
                      // the class's ages are only shown, never used to hide a time (v0.619)
                      slot(timeKey(t), `${formatDate(t.date, { year: false })} · ${formatTime(parseTime(t.start), true)} · ${classWithAges(t)}`, t.spotsLeft),
                    )}
                  </div>
                ))}
                {slot(NO_TIME_KEY, T.NO_TIME, null)}
                {unpicked && <Notice id={errId}>{T.pickTimeProblem(c.first_name.trim() || T.CHILD(i + 1))}</Notice>}
              </fieldset>
            );
          })
        )}
        {/* "booking_pick" shows inside each unpicked child's list instead (above) */}
        <Problem id={`${idBase}-${f.id}-err`} code={problems[f.id] === 'booking_pick' ? null : problems[f.id]} />
      </div>
    );
  }

  function waiverBlock(f) {
    const id = `${idBase}-${f.id}`;
    return (
      <div key={f.id} className="fwaiver">
        <span className="field-label">{f.label}</span>
        <div className="fwaiver-text" tabIndex={0} role="region" aria-label={T.WAIVER_TEXT}>
          {f.text}
        </div>
        <label className="cbox">
          <input
            type="checkbox"
            checked={answers[f.id] === true}
            disabled={readOnly}
            aria-invalid={problems[f.id] ? true : undefined}
            aria-describedby={problems[f.id] ? `${id}-err` : undefined}
            onChange={(e) => onAnswer(f.id, e.target.checked ? true : undefined)}
          />
          <span>{T.AGREE}</span>
        </label>
        <Problem id={`${id}-err`} code={problems[f.id]} />
        <span id={`${id}-sig-label`} className="field-label">
          {T.SIGN_HERE}
        </span>
        <p id={`${id}-sig-hint`} className="field-hint">
          {T.SIGN_HINT}
        </p>
        <SignaturePad value={values.signature} onChange={onSignature} disabled={readOnly} labelId={`${id}-sig-label`} hintId={`${id}-sig-hint`} />
        <Problem id={`${id}-sig-err`} code={problems.signature} />
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
