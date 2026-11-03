// mock-c01-edit-delete-hidden.js — Camps design review C1, drawn ON TOP of the real preview page for a picture only,
// while "Hide private details" is on (rule v1.000, as Color Belt's v0.412). Words: src/lib/privateDetails.js and
// Color Belt's hidden delete wording ("any recorded payment", screens/testing/text.js).
//   window.__c01e = 'edit'      Edit details (a camper): each extra's price and "Total now $X" read gray
//                               "Hidden on this tablet"; the extras' names, ticks and day chips stay, and so does
//                               the "Changing days … current prices" note (no amount in it).
//   window.__c01e = 'delete'    an open Delete camper / Delete camp box: the sentence loses its money part.
//   window.__c01e = 'toast'     the Mark paid toast without its amount ("Leo Kim marked paid").
// React's own parts are hidden, never removed; a reload removes everything.
// Run:   node shotx.mjs out.png --js "window.__c01e='edit'" --eval mock-c01-edit-delete-hidden.js
(() => {
  const mode = window.__c01e;
  const HIDDEN = 'Hidden on this tablet';
  const gray = (text) => { const s = document.createElement('span'); s.dataset.mock = 'c01e'; s.style.color = '#6B6B6B'; s.textContent = text; return s; };
  const hideChildren = (el) => [...el.childNodes].forEach((n) => {
    if (n.dataset?.mock) return;
    if (n.nodeType === 1) n.style.display = 'none';
    else { const s = document.createElement('span'); s.style.display = 'none'; n.replaceWith(s); s.append(n); }
  });
  const dialog = [...document.querySelectorAll('.dialog, [role=dialog]')].pop();
  if (mode === 'edit') {
    if (!dialog) return 'open Edit details first';
    let n = 0;
    for (const price of dialog.querySelectorAll('.cp-edit-extra .cbrow .cp-age-text')) {
      if (price.dataset.mockDone) continue;
      price.dataset.mockDone = '1';
      hideChildren(price);
      price.append(gray(`· ${HIDDEN}`));
      n++;
    }
    const total = dialog.querySelector('.cp-newtotal');
    if (total && !total.dataset.mockDone) {
      total.dataset.mockDone = '1';
      // "Total now $395" is one text node; keep any note span after it.
      const first = total.firstChild;
      if (first && first.nodeType === 3) {
        const s = document.createElement('span'); s.style.display = 'none'; first.replaceWith(s); s.append(first);
        const label = document.createElement('span'); label.dataset.mock = 'c01e'; label.textContent = 'Total now ';
        s.after(label, gray(HIDDEN));
      }
    }
    return `extras ${n}, total ${total ? 'hidden' : 'not found'}`;
  }
  if (mode === 'delete') {
    if (!dialog) return 'open the delete box first';
    const p = [...dialog.querySelectorAll('p')].find((el) => /can’t be undone|can't be undone/.test(el.textContent) && !el.dataset.mock);
    if (!p) return 'no sentence';
    const t = p.textContent;
    let next = t;
    // Delete camper: "The sign-up and the $335 card payment recorded on Mar 25 are deleted from X. …"
    next = next.replace(/the \$[\d,]+(\.\d\d)? \w+ payment recorded on [A-Z][a-z]{2} \d{1,2}/, 'any recorded payment');
    // Delete camp: "X and its 19 campers and 1 removed and $1,234 in payments are deleted. …"
    next = next.replace(/^(.*?) and its (.*?) and \$[\d,]+(\.\d\d)? in payments are deleted\./, '$1, its $2, and any recorded payment are deleted.');
    if (next === t) return `unchanged: ${t}`;
    p.style.display = 'none';
    const copy = p.cloneNode(false);
    copy.style.display = '';
    copy.dataset.mock = 'c01e';
    copy.textContent = next;
    p.after(copy);
    return next;
  }
  if (mode === 'toast') {
    const text = [...document.querySelectorAll('.toast-text')].pop();
    if (!text) return 'no toast';
    text.textContent = text.textContent.replace(/ · \$[\d,]+(\.\d\d)? \w+$/, '');
    return text.textContent;
  }
  return "set window.__c01e = 'edit' | 'delete' | 'toast'";
})()
