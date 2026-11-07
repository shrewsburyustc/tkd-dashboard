// mock-dates.js — draws the "after" pictures for "Date signed" (rulebook v0.638) ON TOP of the real
// preview page, for review pictures only. Nothing in the app or its data changes; a reload removes it.
// Why: Jeffrey reviews real screenshots with the change drawn in, not a hand-made drawing.
// Modes (set window.__mockDates before running):
//   'form'    Star family form, Check step: under the signature (after its hint line) a "Date signed"
//             box like New students' (FormFields.jsx v0.635): label, a gray read-only box with today's
//             date in school time written like shortDate() ("Fri, Nov 6, 2026"), and the hint
//             "Filled in automatically with today's date." It uses the Star form's own classes
//             (reg-field, reg-label, reg-input, reg-hint) plus New students' gray box colors. Its label
//             is held at 12px at every size, like the Signature label above it (.reg-field--sign
//             .reg-label), so the two labels match on touch too.
//   'staffA'  Candidate detail, option (a): a new row "Date signed | <window.__mockSignedOn>" right under
//             the Acknowledgment row (copies Prospects' Date signed row). The Acknowledgment row is left
//             as it is ("Ticked and signed · View signature" / "… · signature removed …").
//   'staffB'  Candidate detail, option (b): one line, "Ticked and signed <date> · View signature" (or
//             "… · signature removed …"); "· View signature" is kept together so a wrap never leaves
//             the "·" alone at the end of a line.
//   window.__mockSignedOn: the date signed as the build would write it, e.g. "Sat, Oct 31, 2026".
// Run:   node cdp.mjs eval "$(cat mock-dates.js)"
(() => {
  const mode = window.__mockDates;
  if (mode === 'form') {
    document.querySelectorAll('[data-mock=dates]').forEach((e) => e.remove());
    const sign = document.querySelector('.reg-field--sign');
    if (!sign) return 'open the Check step first';
    // Today in Massachusetts time, written like calendarDates.js shortDate(): "Fri, Nov 6, 2026"
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')}`;
    const box = document.createElement('div');
    box.className = 'reg-field';
    box.dataset.mock = 'dates';
    box.style.margin = '12px 0 0'; // like .field.fsigned and .reg-field--sign
    box.innerHTML = `<label class="reg-label" for="mock-signed" style="font-size: var(--text-12)">Date signed</label>
      <input id="mock-signed" class="reg-input" type="text" readonly value="${day}" aria-describedby="mock-signed-hint"
        style="border-color: var(--color-border-strong); background: var(--color-surface); color: var(--color-text); cursor: default">
      <div class="reg-hint" id="mock-signed-hint">Filled in automatically with today's date.</div>`;
    sign.after(box);
    return `drawn ${day}`;
  }
  if (mode === 'staffA' || mode === 'staffB') {
    const on = window.__mockSignedOn;
    if (!on) return 'set window.__mockSignedOn';
    const dialog = [...document.querySelectorAll('[role=dialog]')].pop() || document;
    const ackRow = [...dialog.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt')?.textContent.trim() === 'Acknowledgment');
    if (!ackRow) return 'open a candidate detail first';
    const dd = ackRow.querySelector('dd');
    if (mode === 'staffA') {
      const row = ackRow.cloneNode(false);
      row.dataset.mock = 'dates';
      row.innerHTML = '<dt>Date signed</dt><dd></dd>';
      row.querySelector('dd').textContent = on;
      ackRow.after(row);
      return 'drawn A';
    }
    // Option (b): rebuild the line as "Ticked and signed <date> " + a no-wrap "· <rest>".
    const link = [...dd.querySelectorAll('button')].find((b) => b.innerText.trim() === 'View signature');
    const keep = document.createElement('span');
    keep.style.whiteSpace = 'nowrap';
    if (link) {
      keep.append('· ', link); // the real link, moved, so it keeps its look
    } else {
      // The removed state is one text: "Ticked and signed · signature removed Mar 2, 2027 (…)".
      // Only "· signature removed" is kept together; the long rest may wrap.
      const rest = dd.textContent.replace(/^Ticked and signed\s*·\s*/, '');
      const m = /^(signature removed)(.*)$/.exec(rest);
      keep.textContent = `· ${m ? m[1] : rest}`;
      dd.textContent = '';
      dd.dataset.mockRest = m ? m[2] : '';
    }
    [...dd.childNodes].forEach((n) => n.remove());
    const span = document.createElement('span');
    span.dataset.mock = 'dates';
    span.append(`Ticked and signed ${on} `, keep);
    if (dd.dataset.mockRest) span.append(dd.dataset.mockRest);
    dd.append(span);
    return 'drawn B';
  }
  return 'set window.__mockDates';
})()
