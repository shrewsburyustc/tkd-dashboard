// mock-x5-fill-in.js — Camps "Fill in" (picture 23), drawn ON TOP of the real preview page for a picture
// only. Nothing is saved; a reload removes it. It copies the real parts' markup and classes:
// the camp page header's buttons (btn, is-unavailable), the ⋯ sheet's items (cloned from the open menu),
// New students' Fill in dialog frame (the real Dialog's markup, captured from Forms → Fill in for a family
// into localStorage 'x5.shell.pc' / 'x5.shell.phone'), and the family page's own steps (the real
// /camp/<code> page in a frame inside the dialog, its header, camp card and own buttons hidden).
//   window.__x5 = { mode, ... } then run this file
//   mode 'button', gray, tip        "Fill in" before Registration link (gray + dark tip for staff)
//   mode 'sheet', gray, reason      "Fill in for a family" first in the open header ⋯ sheet
//   mode 'dialog', step, phone, code, tall   the Fill in dialog with the family form's step 1 or 2
//   mode 'sent', phone              the Sent screen
//   mode 'detail'                   Camper detail's sign-up line and History line, desk version
(async () => {
  const s = window.__x5;
  if (!s) return 'set window.__x5';
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SVG = (cls, paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon ${cls}" aria-hidden="true">${paths}</svg>`;
  const ARROW_R = SVG('tabler-icon-arrow-right', '<path d="M5 12l14 0"></path><path d="M13 18l6 -6"></path><path d="M13 6l6 6"></path>');
  const ARROW_L = SVG('tabler-icon-arrow-left', '<path d="M5 12l14 0"></path><path d="M5 12l6 6"></path><path d="M5 12l6 -6"></path>');
  const CHECK = SVG('tabler-icon-check', '<path d="M5 12l5 5l10 -10"></path>');
  const CHECK24 = CHECK.replace('width="16" height="16"', 'width="24" height="24"');

  if (s.mode === 'button') {
    document.querySelectorAll('[data-mock=x5]').forEach((e) => e.remove());
    const reg = [...document.querySelectorAll('main button')].find((b) => /Registration link/.test(b.textContent));
    if (!reg) return 'open a camp page';
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mock = 'x5';
    b.className = `btn${s.gray ? ' is-unavailable' : ''}`;
    if (s.gray) {
      b.setAttribute('aria-disabled', 'true');
      // the plain button's approved gray (shared.css .cfm-actions .btn.is-unavailable / Forms' .flist-acts rule)
      b.style.cssText = 'border-color:var(--color-border-strong);background:var(--color-surface);color:var(--color-disabled-text);cursor:not-allowed;';
    }
    b.textContent = 'Fill in';
    reg.before(b);
    const out = { button: box(b) };
    if (s.tip) {
      const r = b.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.dataset.mock = 'x5';
      tip.textContent = s.tip;
      tip.style.cssText = `position:fixed;z-index:50;top:${r.bottom + 8}px;right:${window.innerWidth - r.right - 8}px;max-width:250px;padding:4px 8px;border-radius:var(--radius-tag);background:var(--color-tooltip-bg);color:var(--color-on-blue);font-size:var(--text-13);line-height:1.5;`;
      const arrow = document.createElement('span');
      arrow.style.cssText = `position:absolute;bottom:100%;right:${r.width / 2 + 3}px;border:5px solid transparent;border-bottom-color:var(--color-tooltip-bg);`;
      tip.append(arrow);
      document.body.append(tip);
      out.tip = box(tip);
    }
    return out;
  }

  if (s.mode === 'sheet') {
    const menu = [...document.querySelectorAll('[role=menu]')].pop();
    if (!menu) return 'open the header ⋯';
    menu.querySelectorAll('[data-mock=x5]').forEach((e) => e.remove());
    // RowMenu's own item markup (RowMenu.jsx: menu-item tmenu-item, is-disabled + aria-disabled when gray;
    // CampRowMenu's ev-menu-two / ev-menu-reason for the reason line; ev-noicon = no icon, as Open sign-up)
    const copy = document.createElement('div');
    copy.dataset.mock = 'x5';
    const label = s.gray
      ? `<span class="ev-menu-two"><span>Fill in for a family</span><span class="ev-menu-reason"></span></span>`
      : '<span>Fill in for a family</span>';
    copy.innerHTML = `<button type="button" role="menuitem" tabindex="-1" class="menu-item tmenu-item${s.gray ? ' is-disabled' : ''}"${s.gray ? ' aria-disabled="true"' : ''}><span class="menu-icon ev-noicon" aria-hidden="true"></span>${label}</button>`;
    if (s.gray) copy.querySelector('.ev-menu-reason').textContent = s.reason;
    menu.prepend(copy);
    return box(copy);
  }

  if (s.mode === 'dialog' || s.mode === 'sent') {
    document.querySelectorAll('[data-mock=x5d]').forEach((e) => e.remove());
    const shellHtml = localStorage.getItem(s.phone ? 'x5.shell.phone' : 'x5.shell.pc');
    if (!shellHtml) return 'capture the shell first';
    const holder = document.createElement('div');
    holder.innerHTML = shellHtml;
    const shell = holder.firstElementChild;
    shell.dataset.mock = 'x5d';
    document.body.append(shell);
    const title = shell.querySelector('.dialog-title, .dialog-page-title, h2');
    const name = s.campName || 'Thanksgiving Camp';
    const form = shell.querySelector('form');
    const host = form.parentElement;

    if (s.mode === 'sent') {
      title.textContent = 'Sent';
      if (!s.phone) shell.querySelector('.dialog').className = 'dialog tdialog tdialog--detail';
      [...host.children].forEach((c) => { if (c !== title && !c.classList.contains('dialog-page-head') && !c.contains(title)) c.remove(); });
      const body = document.createElement('div');
      body.className = 'fsent';
      body.innerHTML = `<div class="fsent-icon" aria-hidden="true">${CHECK24}</div><p></p><ul class="fsent-list"></ul>`;
      body.querySelector('p').textContent = `${s.parent || 'Sarah Carter'}'s sign-up is saved.`;
      const list = body.querySelector('ul');
      (s.lines || []).forEach((l) => { const li = document.createElement('li'); li.textContent = l; list.append(li); });
      const acts = document.createElement('div');
      acts.className = s.phone ? 'dialog-page-submit' : 'dialog-actions';
      const blk = s.phone ? ' btn-block' : '';
      acts.innerHTML = `<button type="button" class="btn${blk}">Fill in another</button><button type="button" class="btn btn-primary${blk}">Close</button>`;
      host.append(body, acts);
      return { dialog: box(shell.querySelector('.dialog, .dialog-page') || shell), body: box(body), buttons: box(acts) };
    }

    title.textContent = `Fill in · ${name}`;
    const prog = shell.querySelector('.fprogress');
    prog.innerHTML = s.step === 2 ? '<i class="is-on"></i><i class="is-on"></i>' : '<i class="is-on"></i><i class=""></i>';
    shell.querySelector('.fstep-title').textContent = s.step === 2 ? 'Step 2 of 2 · Check and sign' : 'Step 1 of 2 · Details';
    const fields = form.querySelector('.ffields');
    const width = fields.getBoundingClientRect().width;
    const frame = document.createElement('iframe');
    frame.style.cssText = `display:block;width:${width}px;height:600px;border:0;`;
    frame.src = `/camp/${s.code || 'thx9kv3m'}`;
    fields.replaceWith(frame);
    // the buttons, as New students' Fill in (Cancel on PC / tablet; Back from step 2; Continue / Send)
    const actions = form.querySelector('.fstep-actions');
    const right = actions.querySelector('.sdialog-actions-right');
    right.innerHTML = `${s.step === 2 ? `<button type="button" class="btn">${ARROW_L}Back</button>` : ''}<button type="submit" class="btn btn-primary">${s.step === 2 ? CHECK : ARROW_R}${s.step === 2 ? 'Send' : 'Continue'}</button>`;
    form.onsubmit = (e) => e.preventDefault();
    await new Promise((r) => { frame.onload = r; });
    const w = frame.contentWindow; const d = frame.contentDocument;
    for (let i = 0; i < 40 && !d.querySelector('.reg-step'); i++) await sleep(100);
    const st = d.createElement('style');
    st.textContent = `.reg-preview,.reg-header,.reg-hero,.reg-stepline,.reg-hp,.reg-btn--main,.reg-privacy,.camp-privacy,.reg-back,.reg-step > .reg-center{display:none!important}
      html,body,#root{background:#fff!important;margin:0!important;padding:0!important;min-height:0!important}
      .reg-main{padding:0 0 4px!important;margin:0!important;max-width:none!important;width:auto!important}
      .reg-step{margin:0!important;padding:0!important}`;
    d.head.append(st);
    const setVal = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
    };
    const cardBy = (word) => [...d.querySelectorAll('.reg-card')].find((c) => c.querySelector('.reg-card__title')?.textContent.trim() === word);
    const fillPerson = (card, name, phone, rel) => {
      const ins = card.querySelectorAll('input');
      setVal(ins[0], name); setVal(ins[1], phone); setVal(ins[2], rel);
    };
    setVal(d.getElementById('camp-c0-first'), 'Liam');
    setVal(d.getElementById('camp-c0-last'), 'Carter');
    setVal(d.getElementById('camp-c0-age'), '8');
    await sleep(50);
    d.querySelectorAll('input[name="camp-c0-member-radio"]')[1].click();
    await sleep(50);
    [...d.querySelectorAll('.camp-child .reg-chips')][0].querySelectorAll('.reg-chip').forEach((c) => c.click());
    await sleep(80);
    // one extra: the first extra's first choice, if the camp has extras
    const extra = d.querySelector('.camp-child input[type=checkbox]');
    if (extra && !extra.checked) extra.click();
    await sleep(80);
    fillPerson(cardBy('Parent or guardian'), 'Sarah Carter', '508-555-0142', 'Mother');
    fillPerson(cardBy('Emergency contact'), 'Tom Carter', '508-555-0187', 'Uncle');
    const pay = cardBy('How you’ll pay at the school');
    pay?.querySelector('input[type=radio], button')?.click();
    await sleep(120);
    if (s.step === 2) {
      d.querySelector('.reg-btn--main').click();
      for (let i = 0; i < 30 && !/Check and sign/.test(d.querySelector('.reg-stepline')?.textContent || ''); i++) await sleep(100);
      await sleep(200);
      const ack = d.querySelector('input[type=checkbox]');
      if (ack && !ack.checked) ack.click();
      await sleep(80);
      const cv = d.querySelector('.reg-sigpad__canvas');
      if (cv) {
        const ctx = cv.getContext('2d');
        const k = cv.width / cv.getBoundingClientRect().width;
        ctx.save(); ctx.scale(k, k); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1F1F1F';
        ctx.beginPath();
        const pts = [[30, 70], [42, 40], [50, 78], [62, 42], [70, 74], [86, 56], [98, 66], [112, 50], [124, 70], [140, 46], [152, 64], [170, 58], [190, 62]];
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(200, 50); ctx.quadraticCurveTo(230, 30, 250, 66); ctx.stroke();
        ctx.restore();
      }
      // At the desk the hint uses New students' Fill in words (the family's "sign at the front desk" doesn't fit)
      if (s.deskHint) {
        const hint = [...d.querySelectorAll('.reg-hint')].find((h) => /front desk/.test(h.textContent));
        if (hint) { hint.textContent = s.deskHint; hint.dataset.mockHint = '1'; }
      }
    }
    if (s.extraCss) { const e = d.createElement('style'); e.textContent = s.extraCss; d.head.append(e); }
    await sleep(150);
    frame.style.height = `${Math.ceil(d.documentElement.scrollHeight)}px`;
    window.__x5frame = frame;
    if (s.tall) {
      // the whole step at once, for the picture: the box grows instead of scrolling
      const dlg = shell.querySelector('.dialog');
      if (dlg) { dlg.style.maxHeight = 'none'; dlg.style.overflow = 'visible'; }
      shell.style.position = 'absolute'; shell.style.height = 'auto'; shell.style.minHeight = '100%';
      shell.querySelectorAll('*').forEach((el) => { const cs = getComputedStyle(el); if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') { el.style.overflow = 'visible'; el.style.maxHeight = 'none'; } });
    }
    await sleep(100);
    const marks = {};
    const fr = frame.getBoundingClientRect();
    const inFrame = (el) => { const r = el.getBoundingClientRect(); return [Math.round(fr.x + r.x), Math.round(fr.y + r.y), Math.round(r.width), Math.round(r.height)]; };
    const hintEl = d.querySelector('[data-mock-hint]');
    if (hintEl) marks.hint = inFrame(hintEl);
    return { dialog: box(shell.querySelector('.dialog, .dialog-page') || shell), title: box(title), sub: box(shell.querySelector('.tdialog-sub')), frame: box(frame), actions: box(actions), ...marks, docH: document.documentElement.scrollHeight };
  }

  if (s.mode === 'detail') {
    const out = {};
    const leaves = () => [...document.querySelectorAll('.dialog *, .dialog-page *')].filter((e) => e.children.length === 0);
    const line = leaves().find((e) => /^Signed up on the family form,/.test(e.textContent));
    if (line) {
      line.textContent = `Signed up at the desk by Jeffrey Berg, ${s.date || 'Nov 5, 2026'} · waiver signed on the screen · reference ${s.ref || 'CP-4821'}`;
      out.line = box(line);
    }
    const hist = leaves().find((e) => /^Signed up on the family form ·/.test(e.textContent));
    if (hist) {
      hist.textContent = `Signed up (entered by Jeffrey Berg) · ${s.ref || 'CP-4821'}`;
      out.hist = box(hist);
    }
    const who = leaves().find((e) => / · Family form$/.test(e.textContent));
    if (who) {
      who.textContent = `${s.shortDate || 'Nov 5'} · Jeffrey Berg`;
      out.who = box(who);
    }
    return out;
  }
  return 'unknown mode';
})()
