// mock-x7-refund.js — Camps "Record refund" (picture 22-record-refund: pass 1 step 3, R1-05), drawn ON TOP
// of the real preview page for a picture only. Nothing is saved; a reload removes it, and nothing in the
// app changes. It copies the real parts' markup and changes only the words (rulebook v1.039: "copy Star's
// words and box"):
//   - Star testing's real Record refund box (StarPaymentDialogs.jsx RefundDialog: Refunded by Cash | Check,
//     Amount with "Up to …", Date refunded, the gray note, Cancel / Save), captured from the preview's Fall
//     Star Testing (Chris Kim, $20 overpaid) into localStorage 'x7.star.pc' (PC / tablet) and
//     'x7.star.phone' (phones); its buttons stay exactly Star's: Cancel / ✓ Save (the shared Footer);
//   - Star's real "Record refund" ⋯ item with its ti-receipt-refund icon ('x7.star.refunditem');
//   - Camps' own date picker's calendar for April 2027 ('x7.camps.cal', from Edit payment's real one) with
//     Star's gray line under the days ("Not before … or after today.");
//   - the shared grayed item with its reason under it (.ev-menu-two / .ev-menu-reason: Camps' Fill in item,
//     Star's grayed Edit payment / Undo payment), the shared Notice (amber, triangle) and the shared toast
//     (Toast.jsx); on the real open boxes: Camps' Undo payment box (ConfirmBox) gets Undo refund's words,
//     Camps' receipt gets Star's minus line (candidatesReceipt.js: For "Refund", a minus amount).
// Usage: window.__x7 = { mode, ... } then run this file (through cdp.mjs's holder, so the size stays put).
//   mode 'hint'                             Camper detail: the overpaid hint's new words
//   mode 'menu', step 'record' | 'after'    the open camper ⋯: Record refund added / the menu after a refund
//   mode 'box', phone, amount, error, cal   the Record refund box over the camp page (error = too large;
//                                           cal = the date calendar open, with its gray line)
//   mode 'toast'                            "Refund recorded · Undo"
//   mode 'detail'                           Camper detail after the refund: the refund line, History
//   mode 'more', step 'record' | 'after'    Camper detail's More (touch screens): Record refund while
//                                           overpaid / the buttons after a refund
//   mode 'undo'                             the open Undo payment box with Undo refund's words
//   mode 'receipt'                          the open receipt with the refund's minus line, totals net
// The numbers are the preview's (April Vacation Camp, today = Wed, Apr 21, 2027 with campWeek()):
// Chloe Martin paid $315 by check on Mar 11; Friday was taken off (Edit details), total now $292,
// so $23 overpaid. window.__x7.data can change them.
(async () => {
  const s = window.__x7;
  if (!s) return 'set window.__x7';
  const D = {
    name: 'Chloe Martin', paidCents: 31500, overCents: 2300, signedUp: 'Mar 4', refundOn: 'Apr 21',
    dateText: 'Wed, Apr 21, 2027', school: 'Worcester', who: 'Jeffrey Berg', ...(s.data ?? {}),
  };
  // The dashboard's money words (lib/money.js formatMoney): "$315", "−$23" (a real minus sign).
  const money = (c) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US')}`;
  const W = {
    hint: 'An admin records money handed back with ⋯ → Record refund.',
    sub: `${D.name} · paid ${money(D.paidCents)} · ${money(D.overCents)} overpaid`,
    upTo: `Up to ${money(D.overCents)}, the amount overpaid.`,
    tooLarge: `Can’t be more than the ${money(D.overCents)} overpaid.`,
    dateHint: `Not before ${D.signedUp} (signed up) or after today.`,
    after: `The ${money(D.paidCents)} payment stays in the history. Afterwards the row reads “Paid”.`,
    recordItem: 'Record refund', // the ⋯ item / More button (the box's own button stays Star's "Save")
    toast: 'Refund recorded',
    undoFirst: 'Undo the refund first.',
    undoRefund: 'Undo refund',
    refundLine: `Refunded ${money(D.overCents)} cash · ${D.school} · ${D.refundOn} · ${D.who}`,
    hist: `Refund recorded: ${money(D.overCents)} cash, ${D.refundOn}`,
    histMeta: `${D.refundOn} · ${D.who}`,
    undoTitle: `Undo ${D.name}'s refund?`, // straight ' as Camps' Undo payment box (text.js undoPaymentTitle)
    undoBody: `The ${money(D.overCents)} cash refund recorded on ${D.refundOn} is reversed and the amount shows as overpaid again. Both stay in the history.`,
    keep: 'Keep refund',
    receiptFor: 'Refund',
  };
  // Boxes in screen pixels (the pictures are screen-sized shots, not whole pages).
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const SVG = (cls, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon ${cls}" aria-hidden="true">${paths}</svg>`;
  // Icons: taken from the page when it has them (the installed Tabler markup), else Tabler's own paths;
  // either way with only the classes given here (no page-specific ones).
  const fromPage = (cls, fallback, classes) => (document.querySelector(`svg.${cls}`)?.outerHTML ?? fallback).replace(/class="[^"]*"/, `class="${classes}"`);
  const ARROW_BACK = fromPage('tabler-icon-arrow-back-up', SVG('tabler-icon-arrow-back-up', '<path d="M9 14l-4 -4l4 -4"></path><path d="M5 10h11a4 4 0 1 1 0 8h-1"></path>'), 'tabler-icon tabler-icon-arrow-back-up');
  const ALERT = fromPage('tabler-icon-alert-triangle', SVG('tabler-icon-alert-triangle', '<path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path><path d="M12 16h.01"></path>'), 'tabler-icon tabler-icon-alert-triangle notice-icon');
  const CHEVRON_UP = SVG('tabler-icon-chevron-up', '<path d="M6 15l6 -6l6 6"></path>');
  // Replace a button's words, keeping its icon.
  const setWords = (el, words) => { [...el.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove()); el.append(words); };

  if (s.mode === 'hint') {
    const host = [...document.querySelectorAll('.dialog, .dialog-page')].pop();
    const p = host && [...host.querySelectorAll('p.field-hint')].find((e) => /^An admin can change the payment/.test(e.textContent));
    if (!p) return 'open Camper detail of an overpaid camper';
    p.textContent = W.hint;
    return { hint: box(p), amber: box(host.querySelector('.cp-amber-text')) };
  }

  if (s.mode === 'menu') {
    const menu = [...document.querySelectorAll('[role=menu]')].pop();
    if (!menu) return 'open the camper ⋯';
    menu.querySelectorAll('[data-mock=x7]').forEach((e) => e.remove());
    const wrapOf = (label) => [...menu.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === label)?.parentElement;
    const editPay = wrapOf('Edit payment');
    const undoPay = wrapOf('Undo payment');
    if (!undoPay) return 'no Undo payment item (admins only)';
    const out = {};
    if (s.step === 'record') {
      // Record refund: admins, only while overpaid, after Undo payment and before Print receipt
      // (Star's order, candidateMenu.js). Star's own item, its words unchanged.
      const holder = document.createElement('div');
      holder.innerHTML = localStorage.getItem('x7.star.refunditem');
      const item = holder.firstElementChild;
      item.dataset.mock = 'x7';
      undoPay.after(item);
      out.record = box(item.querySelector('[role=menuitem]'));
    } else {
      // After a refund: Undo refund (Undo payment's own ti-arrow-back-up) takes Record refund's place;
      // Edit payment and Undo payment stay in place, grayed, with "Undo the refund first." under them.
      const undoRef = undoPay.cloneNode(true);
      undoRef.dataset.mock = 'x7';
      undoRef.querySelector('[role=menuitem] > span').textContent = W.undoRefund;
      undoPay.after(undoRef);
      for (const wrap of [editPay, undoPay]) {
        const b = wrap.querySelector('[role=menuitem]');
        b.classList.add('is-disabled');
        b.setAttribute('aria-disabled', 'true');
        const label = b.querySelector(':scope > span');
        const text = label.textContent;
        label.innerHTML = '<span class="ev-menu-two"><span></span><span class="ev-menu-reason"></span></span>';
        label.querySelector('.ev-menu-two > span').textContent = text;
        label.querySelector('.ev-menu-reason').textContent = W.undoFirst;
      }
      out.edit = box(editPay.querySelector('[role=menuitem]'));
      out.undo = box(undoPay.querySelector('[role=menuitem]'));
      out.undoRefund = box(undoRef.querySelector('[role=menuitem]'));
    }
    out.menu = box(menu);
    return out;
  }

  if (s.mode === 'box') {
    document.querySelectorAll('[data-mock=x7box]').forEach((e) => e.remove());
    const html = localStorage.getItem(s.phone ? 'x7.star.phone' : 'x7.star.pc');
    if (!html) return 'capture Star’s box first';
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const root = holder.firstElementChild;
    root.dataset.mock = 'x7box';
    document.body.append(root);
    const dlg = root.querySelector('.dialog') || root;
    const out = {};
    dlg.querySelector('.tdialog-sub').textContent = W.sub;
    const amount = String(s.amount ?? D.overCents / 100);
    const input = dlg.querySelector('.money-input');
    input.setAttribute('value', amount);
    input.value = amount;
    const amountField = input.closest('.field');
    const upTo = amountField.querySelector('p.field-hint');
    // The buttons stay exactly Star's (Cancel / ✓ Save, the shared Footer).
    const save = dlg.querySelector('button[type=submit]');
    if (s.error) {
      // Too large: the shared amber Notice takes the hint's place, the blue button grays (Star's rule).
      input.setAttribute('aria-invalid', 'true');
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.setAttribute('role', 'alert');
      notice.innerHTML = `${ALERT}<span></span>`;
      notice.querySelector('span').textContent = W.tooLarge;
      upTo.replaceWith(notice);
      save.classList.add('is-unavailable');
      save.setAttribute('aria-disabled', 'true');
      out.notice = box(notice);
    } else {
      upTo.textContent = W.upTo;
      out.upTo = box(upTo);
    }
    const field = dlg.querySelector('.dp-field');
    field.querySelector('.dp-value').textContent = D.dateText;
    field.setAttribute('aria-label', `Date refunded, ${D.dateText}`);
    const note = [...dlg.querySelectorAll('p.field-hint')].find((p) => /^The \$/.test(p.textContent));
    note.textContent = W.after;
    if (s.cal) {
      // The date calendar open under the field (DatePicker's place on PC / tablet), Camps' real April
      // 2027 one, with Star's gray line under the days.
      field.classList.add('is-open');
      field.setAttribute('aria-expanded', 'true');
      field.querySelector('svg').outerHTML = CHEVRON_UP;
      const h2 = document.createElement('div');
      h2.innerHTML = localStorage.getItem('x7.camps.cal');
      const pop = h2.firstElementChild;
      pop.dataset.mock = 'x7box';
      let hint = pop.querySelector('.dp-hint');
      if (!hint) { hint = document.createElement('p'); hint.className = 'dp-hint'; pop.append(hint); }
      hint.textContent = W.dateHint;
      document.body.append(pop);
      const f = field.getBoundingClientRect();
      pop.style.top = `${f.bottom + 4}px`;
      pop.style.left = `${f.left}px`;
      pop.style.visibility = 'visible';
      out.cal = box(pop);
      out.dateHint = box(hint);
    }
    out.dialog = box(dlg);
    out.sub = box(dlg.querySelector('.tdialog-sub'));
    out.method = box(dlg.querySelector('.segmented'));
    out.amountField = box(amountField);
    out.date = box(field);
    out.note = box(note);
    out.actions = box(dlg.querySelector('.dialog-actions, .dialog-page-submit'));
    out.save = box(save);
    return out;
  }

  if (s.mode === 'toast') {
    const region = document.querySelector('.toast-region');
    if (!region) return 'no toast region';
    region.innerHTML = `<div class="toast toast--action" data-mock="x7"><span class="toast-text"></span><button type="button" class="toast-undo">${ARROW_BACK}Undo</button></div>`;
    region.querySelector('.toast-text').textContent = W.toast;
    return { toast: box(region.querySelector('.toast')) };
  }

  if (s.mode === 'detail') {
    const host = [...document.querySelectorAll('.dialog, .dialog-page')].pop();
    if (!host) return 'open Camper detail';
    const out = {};
    // Payments: the amber "Total now … Paid $23 more than the total" line goes (paid = total now);
    // the refund is its own line under the payment, in the payment lines' layout with Star's words.
    const payRow = [...host.querySelectorAll('.ev-sum-row')].find((r) => r.querySelector('dt')?.textContent.trim() === 'Payments');
    const dd = payRow.querySelector('dd');
    [...dd.querySelectorAll('.ev-sum-line')].forEach((l) => { if (/^Total now/.test(l.textContent)) l.remove(); });
    const line = document.createElement('span');
    line.className = 'ev-sum-line';
    line.dataset.mock = 'x7';
    line.textContent = W.refundLine;
    dd.append(line);
    out.refundLine = box(line);
    // The overpaid hint goes with the amber line.
    [...host.querySelectorAll('p.field-hint')].forEach((p) => { if (/^An admin/.test(p.textContent)) p.remove(); });
    // History: one more change, newest first (open the list before running this).
    const label = host.querySelector('.hist-btn .hist-label');
    if (label) {
      label.textContent = label.textContent.replace(/(\d+) changes?/, (m, n) => `${Number(n) + 1} changes`);
      out.histLabel = box(label);
    }
    const list = host.querySelector('.hist-list');
    if (list) {
      const li = document.createElement('li');
      li.className = 'hist-item';
      li.dataset.mock = 'x7';
      li.innerHTML = '<span class="hist-text"></span><span class="hist-meta"></span>';
      li.querySelector('.hist-text').textContent = W.hist;
      li.querySelector('.hist-meta').textContent = W.histMeta;
      list.prepend(li);
      out.histItem = box(li);
      out.histList = box(list);
    }
    out.payRow = box(payRow);
    out.payHead = box([...host.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Payments'));
    return out;
  }

  if (s.mode === 'more') {
    const wrap = document.querySelector('.cp-detail-actions');
    if (!wrap) return 'open Camper detail on a touch screen';
    const btn = (label) => [...wrap.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    const editPay = btn('Edit payment');
    const undoPay = btn('Undo payment');
    if (!undoPay) return 'no Undo payment button (admins only)';
    if (s.step === 'record') {
      // Overpaid: Record refund after Undo payment, before Print receipt (the ⋯ menu's place), with
      // Star's ti-receipt-refund icon.
      const rec = undoPay.cloneNode(true);
      rec.dataset.mock = 'x7';
      const holder = document.createElement('div');
      holder.innerHTML = localStorage.getItem('x7.star.refunditem');
      rec.querySelector('svg').outerHTML = holder.querySelector('svg').outerHTML;
      setWords(rec, W.recordItem);
      undoPay.after(rec);
      return { record: box(rec), wrap: box(wrap) };
    }
    // Undo refund after Undo payment (the same icon), as the ⋯ menu
    const undoRef = undoPay.cloneNode(true);
    undoRef.dataset.mock = 'x7';
    setWords(undoRef, W.undoRefund);
    undoPay.after(undoRef);
    // Edit payment and Undo payment gray (the plain button's approved gray, as Fill in's), with the
    // ⋯ menu's reason line under the words (rule 1.1: More mirrors the ⋯ list).
    for (const b of [editPay, undoPay]) {
      const text = b.textContent.trim();
      [...b.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove());
      const two = document.createElement('span');
      two.className = 'ev-menu-two';
      two.innerHTML = '<span></span><span class="ev-menu-reason"></span>';
      two.firstElementChild.textContent = text;
      two.lastElementChild.textContent = W.undoFirst;
      b.append(two);
      b.classList.add('is-unavailable');
      b.setAttribute('aria-disabled', 'true');
      b.style.cssText = 'height:auto;padding-top:6px;padding-bottom:6px;text-align:left;border-color:var(--color-border-strong);background:var(--color-surface);color:var(--color-disabled-text);cursor:not-allowed;';
    }
    return { edit: box(editPay), undo: box(undoPay), undoRefund: box(undoRef), wrap: box(wrap) };
  }

  if (s.mode === 'undo') {
    const dlg = [...document.querySelectorAll('.dialog, .dialog-page')].pop();
    const acts = dlg?.querySelector('.cfm-actions');
    if (!acts) return 'open Undo payment first';
    const title = dlg.querySelector('.dialog-title, .dialog-page-title');
    title.textContent = W.undoTitle;
    const body = dlg.querySelector('.tdialog-body');
    body.textContent = W.undoBody;
    const [keep, act] = acts.querySelectorAll(':scope > button');
    keep.textContent = W.keep;
    setWords(act, W.undoRefund);
    return { dialog: box(dlg), title: box(title), body: box(body), actions: box(acts) };
  }

  if (s.mode === 'receipt') {
    const sheet = document.querySelector('.rcpt-sheet--screen') || document.querySelector('.rcpt-sheet');
    if (!sheet) return 'open Print receipt first';
    const tbody = sheet.querySelector('.rcpt-table tbody');
    const tr = tbody.querySelector('tr').cloneNode(true);
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = D.refundOn;
    tds[1].textContent = W.receiptFor;
    tds[2].textContent = 'Cash';
    tds[3].textContent = money(-D.overCents);
    tbody.append(tr);
    // Paid to date is net of the refund; the balance is $0 · paid in full (the shared receipt's words).
    const totals = [...sheet.querySelectorAll('.rcpt-totals > div')];
    setWords(totals[1], money(D.paidCents - D.overCents));
    setWords(totals[2], `${money(0)} · paid in full`);
    return { row: box(tr), paid: box(totals[1]), balance: box(totals[2]), table: box(sheet.querySelector('.rcpt-table')), sheet: box(sheet) };
  }
  return 'unknown mode';
})()
