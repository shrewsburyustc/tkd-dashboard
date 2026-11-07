// inject-v638.js: draws rulebook v0.638's "after" (pass 2 L-08) ON TOP of the preview, for the mockup only:
//   window.__v638 = 'form'     Color Belt's family form, step 2: a "Date signed" box under the signature,
//                              in New students' look (label, a gray box that can't be changed, the hint
//                              "Filled in automatically with today's date."); the box's text is today
//   window.__v638 = 'summary'  the event roster's student summary: a "Date signed" row right under
//                              "Signed by" (as Prospects shows it), with the day the form was sent
//   window.__v638day           the summary's day ("Oct 29"); window.__regInputClass the family form's
//                              own text-box class (read on step 1 by the shoot script)
// A reload removes it.
(() => {
  const mode = window.__v638;
  if (mode === 'form') {
    const sign = document.querySelector('.reg-field--sign');
    if (!sign) return 'open step 2 of the family form first';
    const field = document.createElement('div');
    field.className = 'reg-field';
    field.style.marginTop = '12px';
    const label = document.createElement('label');
    label.className = 'reg-label';
    label.htmlFor = 'reg-signed';
    label.textContent = 'Date signed';
    const input = document.createElement('input');
    input.id = 'reg-signed';
    input.type = 'text';
    input.className = window.__regInputClass || '';
    input.readOnly = true;
    input.value = 'Fri, Nov 6, 2026';
    // New students' gray box (forms.css .fsigned-box): the surface color, a stronger border, no text cursor
    input.style.background = '#F7F7F5';
    input.style.borderColor = '#CFCFCA';
    input.style.cursor = 'default';
    input.style.display = 'block';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    const hint = document.createElement('div');
    hint.className = 'reg-hint';
    hint.textContent = `Filled in automatically with today's date.`;
    field.append(label, input, hint);
    sign.after(field);
    return 'form drawn';
  }
  if (mode === 'summary') {
    const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
    const row = dialog && [...dialog.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt')?.innerText.trim() === 'Signed by');
    if (!row) return 'open a student summary first';
    const copy = row.cloneNode(true);
    copy.querySelector('dt').textContent = 'Date signed';
    copy.querySelector('dd').textContent = window.__v638day || 'Oct 29';
    row.after(copy);
    return 'summary drawn';
  }
  return 'set window.__v638';
})();
