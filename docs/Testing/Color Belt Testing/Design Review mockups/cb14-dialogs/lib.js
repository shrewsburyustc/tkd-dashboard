// lib.js — helpers for the CB14 dialog sheet (injected once per page with cdp.mjs eval; they stay until reload).
// The "after" dialogs are made from the REAL dialogs in the preview: fields are taken out, the title changes,
// and amber / green boxes mark what goes / what is new. Nothing here is part of the app.
// Works for the PC dialog (div.dialog, two columns) and the phone page (div.dialog-page, one column).
window.__m = {
  dlg: () => document.querySelector('[role=dialog]'),
  byText: (sel, text) => [...window.__m.dlg().querySelectorAll(sel)].find((e) => (e.innerText || '').trim() === text),
  fieldOf: (labelText) => { const l = window.__m.byText('label', labelText); return l ? l.closest('.field') : null; },
  roOf: (labelText) => { const l = window.__m.byText('p.ro-label', labelText); return l ? l.closest('.ro') : null; },
  // one box around the union of some elements (color: amber '#f59e0b' = goes away, green '#16a34a' = new)
  box: (els, color, pad) => {
    els = els.filter(Boolean);
    if (!els.length) return 'no elements';
    const p = pad === undefined ? 6 : pad;
    const r = els.map((e) => e.getBoundingClientRect());
    const l = Math.min(...r.map((x) => x.left)) - p;
    const t = Math.min(...r.map((x) => x.top)) - p;
    const rr = Math.max(...r.map((x) => x.right)) + p;
    const b = Math.max(...r.map((x) => x.bottom)) + p;
    const d = document.createElement('div');
    d.className = '__mbox';
    d.style.cssText = 'position:fixed;left:' + l + 'px;top:' + t + 'px;width:' + (rr - l) + 'px;height:' + (b - t) + 'px;border:3px solid ' + color + ';border-radius:8px;pointer-events:none;z-index:99999';
    document.body.appendChild(d);
    return 'boxed ' + els.length;
  },
  clearBoxes: () => document.querySelectorAll('.__mbox').forEach((e) => e.remove()),
  title: (text) => { const t = window.__m.dlg().querySelector('.dialog-title, .dialog-page-title'); if (t) t.textContent = text; },
  sub: (text) => { const s = window.__m.dlg().querySelector('.tdialog-sub'); if (s) s.textContent = text; },
  narrow: (px) => { const d = window.__m.dlg(); if (!d.classList.contains('dialog')) return; d.classList.remove('tdialog--wide'); d.style.width = px + 'px'; d.style.maxWidth = px + 'px'; },
  // the Prices part of Edit rank / Add rank: the divider before it, its label, hints, the fields, Sparring gear
  pricesParts: (forBox) => {
    const d = window.__m.dlg();
    const label = window.__m.byText('p.ro-label.tdialog-group', 'Prices');
    const prev = label && label.previousElementSibling;
    const divider = prev && prev.classList.contains('tdialog-divider') ? prev : null;
    return [forBox ? null : divider, label, d.querySelector('.tdialog-copied'), d.querySelector('.tprices'), d.querySelector('.tdialog-hint'), d.querySelector('label.cbrow')];
  },
};
'lib ready'
