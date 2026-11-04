// mock-c03-receipt.js — Camps design review C3 (rule v1.002, v1.105, v1.112; Star's v0.518 as the model), drawn
// ON TOP of the real preview page for a picture only. Nothing is printed, pressed or saved.
// Parts (pick with window.__c03 before running; several can be combined):
//   { menu: 'admin' | 'staff' }  The camper ⋯ menu must be open. Adds "Print receipt" (ti-printer) LAST in the
//                                money group (v1.011 / v0.724): admins after Undo payment; staff get a money
//                                group holding only Print receipt (a line above it, as Star v0.518), before the
//                                line and Withdraw. The item is a copy of the menu's own item markup.
//   { detail: true }             PC: Camper detail open. Adds an outline small "Print receipt" button at the end
//                                of the Payments part (Star's place, v0.518: the summary's Payment part ends
//                                with it; Star's .st-print-receipt spacing).
//   { more: 'admin' | 'staff' }  Touch: Camper detail open. Adds Print receipt to "More" in the same place as the
//                                ⋯ menu (last in the money group), copied from the More list's own buttons.
//   { receipt: true, onTop: bool, hidden: bool }
//                                The REAL shared box (src/components/Receipt.jsx, ReceiptDialog), mounted with
//                                its own small React root (as mock-c11-link.js mounts RegistrationLinkBox),
//                                filled with a Camps receipt built below from the preview's own data:
//                                camp_camper_detail (loadCamperDetail), the camp (loadCamp), both schools
//                                (loadSchools) and the name get_my_profile returns ("Jeffrey Berg").
//                                onTop: opened from Camper detail (v1.100), which stays open underneath.
//                                hidden: Hide private details on → the box's own one gray line, no Print.
//   { print: true }              The REAL ReceiptPrint (the printed copy in <body>); shoot with shotx --print.
//   camper: 'Jack Rivera'        whose receipt (default Jack Rivera, on the open camp page)
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__c03={receipt:true,onTop:true}" --eval mock-c03-receipt.js
(async () => {
  const cfg = { camper: 'Jack Rivera', ...(window.__c03 || {}) };
  const out = [];
  const PRINTER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-printer menu-icon" aria-hidden="true"><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"></path><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4"></path><path d="M7 15a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2l0 -4"></path></svg>';
  const WORDS = 'Print receipt';

  // ----- the ⋯ menu -----
  if (cfg.menu) {
    const menu = document.querySelector('[role=menu]');
    if (!menu) return 'open the camper ⋯ menu first';
    menu.querySelectorAll('[data-mock=c03]').forEach((e) => e.remove());
    const groups = [...menu.children];
    const wrapOf = (label) => groups.find((g) => g.querySelector('.menu-item span')?.textContent === label);
    const model = groups[0]; // Edit details: an item with no line above it
    const item = model.cloneNode(true);
    item.dataset.mock = 'c03';
    const btn = item.querySelector('.menu-item');
    btn.querySelector('svg').outerHTML = PRINTER;
    btn.querySelector('span').textContent = WORDS;
    if (cfg.menu === 'admin') {
      const undo = wrapOf('Undo payment');
      if (!undo) return 'no Undo payment in this menu (not an admin, or nothing paid?)';
      undo.after(item);
    } else {
      // Staff: the money group starts with Print receipt (a line above it), before Withdraw's own line.
      const sep = menu.querySelector('.menu-separator').cloneNode(true);
      btn.before(sep);
      wrapOf('Withdraw').before(item);
    }
    out.push(`menu ${cfg.menu}`);
  }

  // ----- Camper detail, PC: end of the Payments part -----
  if (cfg.detail) {
    const dialog = [...document.querySelectorAll('[role=dialog]')].find((d) => d.querySelector('.cp-detail-head'));
    if (!dialog) return 'open Camper detail first';
    dialog.querySelectorAll('[data-mock=c03]').forEach((e) => e.remove());
    const head = [...dialog.querySelectorAll('.cp-detail-head')].find((h) => h.textContent === 'Payments');
    const payments = head.nextElementSibling; // the Payments <dl>
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm';
    b.dataset.mock = 'c03';
    b.style.marginTop = 'var(--space-8)';
    b.innerHTML = PRINTER + WORDS;
    let after = payments;
    if (after.nextElementSibling?.classList.contains('field-hint')) after = after.nextElementSibling;
    after.after(b);
    out.push('detail');
  }

  // ----- Camper detail, touch: "More" -----
  if (cfg.more) {
    const list = document.querySelector('.cp-detail-actions');
    if (!list) return 'open Camper detail on a touch size first';
    list.querySelectorAll('[data-mock=c03]').forEach((e) => e.remove());
    const buttons = [...list.querySelectorAll(':scope > button')];
    const byWords = (w) => buttons.find((x) => x.textContent.trim() === w);
    const b = byWords('Withdraw').cloneNode(true);
    b.dataset.mock = 'c03';
    b.querySelector('svg').outerHTML = PRINTER;
    b.lastChild.textContent = WORDS;
    if (cfg.more === 'admin') {
      byWords('Undo payment').after(b);
    } else {
      // Staff: Print receipt is the money group's only item; a line above it unless it is first in More.
      const withdrawBreak = byWords('Withdraw').previousElementSibling;
      const first = list.firstElementChild === withdrawBreak || list.firstElementChild === byWords('Withdraw');
      if (withdrawBreak?.classList.contains('cp-detail-break')) withdrawBreak.before(b);
      else byWords('Withdraw').before(b);
      if (!first) {
        const line = document.createElement('span');
        line.setAttribute('role', 'separator');
        line.className = 'cp-detail-break';
        line.dataset.mock = 'c03';
        b.before(line);
      }
    }
    out.push(`more ${cfg.more}`);
  }

  // ----- the receipt (the REAL shared part) -----
  if (cfg.receipt || cfg.print) {
    const api = await import('/src/lib/camps/campsApi.js');
    const T = await import('/src/screens/camps/text.js');
    const { loadSchools } = await import('/src/lib/settings/schoolsApi.js');
    const campId = location.hash.split('/').pop();
    const camp = await api.loadCamp(campId);
    const row = camp.roster.find((r) => `${r.firstName} ${r.lastName}` === cfg.camper && r.status === 'active');
    if (!row) return `no active ${cfg.camper} on this camp page`;
    const detail = await api.loadCamperDetail(row.id);
    const schools = await loadSchools();
    const campDays = camp.days.map((d) => d.day);
    const myDays = row.days.map((d) => d.day).sort();
    const b = detail.breakdown;
    const SAMPLE = {
      worcester: { street: '1141 Main St', phone: '(508) 767-1717' },
      shrewsbury: { street: '370 Boston Turnpike', phone: '(508) 792-5534' },
    };

    // The proposal for src/lib/camps/campReceipt.js (pure, like Star's candidatesReceipt.js):
    // payment lines = kind 'payment' that no reversal points at (Edit payment / Undo payment leave the old row
    // and its reversal out), oldest first by the day paid; every line "Camp fee" (a payment row doesn't say
    // which days or extras it paid for — Star's reason, v0.518). Camps has no refunds.
    const reversed = new Set(detail.payments.filter((p) => p.reversesPaymentId).map((p) => p.reversesPaymentId));
    const lines = detail.payments
      .filter((p) => p.kind === 'payment' && !reversed.has(p.id))
      .sort((x, y) => (x.paidOn === y.paidOn ? x.recordedAt.localeCompare(y.recordedAt) : x.paidOn.localeCompare(y.paidOn)))
      .map((p) => ({ date: p.paidOn, forText: 'Camp fee', how: p.method, amountCents: p.amountCents }));
    const facts = [
      ['Camper', `${row.firstName} ${row.lastName}`],
      ['Camp', `${camp.camp.name} · ${T.campDatesText(campDays)}`],
      ['School', T.campSchoolLine(camp.camp)],
      ['Days', T.detailDaysLine(myDays, myDays.length === campDays.length)],
    ];
    if ((b.extras ?? []).length > 0) facts.push(['Extras', b.extras.map((e) => T.detailExtraLine(e, campDays)).join('; ')]);
    facts.push(['Reference', row.reference]);
    const receipt = {
      kindLine: 'Camp · payment receipt',
      facts,
      lines,
      totalDueCents: row.totalCents,
      paidCents: row.paidCents,
      balanceNote: null,
      // The preview's schools have no street or phone saved (Settings → Schools is empty there), so the
      // parts page's sample lines (src/parts/M4.jsx) stand in; the real app reads them from loadSchools().
      schools: schools.status === 'ok'
        ? schools.schools.map((s) => ({ name: s.name, street: s.address?.street ?? SAMPLE[s.code]?.street ?? '', phone: s.phone ?? SAMPLE[s.code]?.phone ?? '' }))
        : [],
      printedOn: '2026-10-29',
      printedByName: 'Jeffrey Berg', // get_my_profile's full_name in the preview
    };

    // React from Vite's own copies (the same ones the app uses), as mock-c11-link.js does.
    const src = await (await fetch('/src/components/Receipt.jsx')).text();
    const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
    const React = (await import(reactUrl)).default;
    const mainSrc = await (await fetch('/src/main.jsx')).text();
    const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
    const clientMod = await import(clientUrl);
    const createRoot = clientMod.createRoot || clientMod.default.createRoot;
    const Receipt = await import('/src/components/Receipt.jsx');
    // A run before this one: unmount its root (the box and the printed copy are portals into <body>, so
    // removing the holder alone would leave them on the page).
    (window.__c03roots ?? []).forEach((r) => r.unmount());
    document.querySelectorAll('[data-mock=c03root]').forEach((e) => e.remove());
    const holder = document.createElement('div');
    holder.dataset.mock = 'c03root';
    document.body.append(holder);
    const root = createRoot(holder);
    window.__c03roots = [root];
    const isPhone = window.matchMedia('(max-width: 639.98px)').matches;
    if (cfg.print) {
      root.render(React.createElement(Receipt.ReceiptPrint, { receipt }));
      out.push('print');
    } else {
      if (!cfg.onTop) {
        // From the ⋯ menu: the receipt opens on its own (close the menu first)
        document.querySelector('[role=menu]')?.remove();
      }
      root.render(React.createElement(Receipt.default, {
        receipt,
        sub: `${row.firstName} ${row.lastName} · ${camp.camp.name}`,
        hidden: Boolean(cfg.hidden),
        onClose: () => {},
        isPhone,
        onTop: Boolean(cfg.onTop),
      }));
      out.push(`receipt (${isPhone ? 'phone' : 'dialog'}${cfg.onTop ? ', on top' : ''}${cfg.hidden ? ', hidden' : ''})`);
    }
    await new Promise((r) => setTimeout(r, 500));
    document.activeElement?.blur?.();
    out.push(`${lines.length} lines`);
  }
  return out.join(' + ');
})()
