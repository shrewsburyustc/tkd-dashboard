// mock-c11-link.js — Camps design review C11 (rule v1.015, v1.106, v1.111), drawn ON TOP of the real preview page
// for a picture only. Nothing is pressed for real, copied or saved.
// Three parts (pick with window.__c11 before running):
//   { head: true }   Phones: the camp page's icon-only blue square becomes the blue "Registration link" button
//                    with its words, on its own line under the title (as Color Belt's .ev-phead does on
//                    phones: the buttons' row under the name), ⋯ stays beside it. Done by re-arranging the
//                    real header (.cp-phone-head): the button keeps its own classes minus cp-link-icon.
//   { box: true }    The REAL shared box (src/components/RegistrationLinkBox.jsx), mounted with its own small
//                    React root (as mock-c14-timelist.js mounts TimeList) with Camps' parts: title
//                    "Registration link", the camp's name, Camps' line, ONE link with heading "Both schools ·
//                    held at Worcester" and school null. Today's box must be open first (the words are read
//                    from it); it is hidden, not closed.
//   { box: true, fail: 'copy' }      … and Copy link pressed with a copy that fails → the shared amber note
//                                    inside the box (the box's own `copy` prop, as the parts page does)
//   { box: true, fail: 'download' }  … the same for Download QR code (makePng answers null)
//   { names: true }  A small card listing the QR file names, worked out by the REAL helpers: Camps' today
//                    (src/lib/camps/qr.js qrFileName) and the shared one (src/lib/qr.js qrFileName) without
//                    and with the school. The card itself is drawn.
// Works in preview mode only (Vite serves the source files).
//   node shotx.mjs out.png --js "window.__c11={box:true,fail:'copy'}" --eval mock-c11-link.js
(async () => {
  const cfg = window.__c11 || {};
  const out = [];
  if (cfg.head) {
    const head = document.querySelector('.cp-phone-head');
    if (!head) return 'no phone header (not a phone size?)';
    if (!head.dataset.mockC11) {
      head.dataset.mockC11 = '1';
      head.style.flexDirection = 'column';
      head.style.alignItems = 'stretch';
      head.style.gap = 'var(--space-8)';
      const link = head.querySelector('[data-camp-link]');
      link.classList.remove('cp-link-icon');
      link.removeAttribute('aria-label');
      link.removeAttribute('title');
      link.append(document.createTextNode('Registration link'));
      link.style.height = 'var(--control-height-touch)';
    }
    out.push('head');
  }
  if (cfg.box) {
    const today = [...document.querySelectorAll('[role=dialog]')].find((d) => d.querySelector('.ev-link-card') && !d.closest('[data-mock=c11]'));
    if (!today) return 'open today’s Registration link box first';
    const words = {
      name: today.querySelector('.ev-link-event').textContent,
      line: today.querySelector('.ev-link-line').textContent,
      heading: today.querySelector('.ev-link-school').textContent,
      shown: today.querySelector('.ev-link-url').textContent,
    };
    // The full link exactly as Camps makes it today (campLink stays, the brief says): from the code at its end.
    const { campLink } = await import('/src/lib/camps/qr.js');
    words.url = campLink(words.shown.split('/').pop());
    // Hide today's box (its portal: the child of <body> that holds it).
    let top = today;
    while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
    top.style.display = 'none';
    document.querySelectorAll('[data-mock=c11]').forEach((e) => e.remove());
    const src = await (await fetch('/src/components/RegistrationLinkBox.jsx')).text();
    const reactUrl = src.match(/from "(\/node_modules\/\.vite\/deps\/react\.js\?v=[^"]+)"/)[1];
    const React = (await import(reactUrl)).default;
    const mainSrc = await (await fetch('/src/main.jsx')).text();
    const clientUrl = mainSrc.match(/from "(\/node_modules\/\.vite\/deps\/react-dom_client\.js\?v=[^"]+)"/)[1];
    const clientMod = await import(clientUrl);
    const createRoot = clientMod.createRoot || clientMod.default.createRoot;
    const RegistrationLinkBox = (await import('/src/components/RegistrationLinkBox.jsx')).default;
    const holder = document.createElement('div');
    holder.dataset.mock = 'c11';
    document.body.append(holder);
    const isPhone = window.matchMedia('(max-width: 639.98px)').matches;
    createRoot(holder).render(React.createElement(RegistrationLinkBox, {
      title: 'Registration link',
      eventName: words.name,
      intro: words.line,
      links: [{ url: words.url, school: null, heading: words.heading }],
      onCopied: () => {},
      onClose: () => {},
      isPhone,
      copy: cfg.fail === 'copy' ? () => Promise.reject(new Error('mock')) : () => Promise.resolve(),
      makePng: cfg.fail === 'download' ? () => Promise.resolve(null) : undefined,
    }));
    await new Promise((r) => setTimeout(r, 400));
    const box = [...document.querySelectorAll('[role=dialog]')].pop();
    if (cfg.fail) {
      const btn = [...box.querySelectorAll('.ev-link-buttons .btn')].find((b) => b.textContent.includes(cfg.fail === 'copy' ? 'Copy' : 'Download'));
      btn.click();
      await new Promise((r) => setTimeout(r, 300));
    }
    document.activeElement?.blur?.();
    out.push(`box (${isPhone ? 'phone' : 'dialog'})${cfg.fail ? `, ${cfg.fail} failed` : ''}`);
  }
  if (cfg.names) {
    const today = await import('/src/lib/camps/qr.js');
    const shared = await import('/src/lib/qr.js');
    document.querySelectorAll('[data-mock=c11names]').forEach((e) => e.remove());
    const card = document.createElement('div');
    card.dataset.mock = 'c11names';
    card.style.cssText = 'position:fixed;left:16px;top:16px;z-index:99999;background:var(--color-surface,#fff);border:1px solid var(--color-border,#ddd);border-radius:12px;padding:16px 20px;font:14px/1.6 var(--font-sans,system-ui);color:var(--color-text,#222);box-shadow:0 4px 16px rgba(0,0,0,.12);max-width:calc(100vw - 32px)';
    const row = (label, value) => `<div><span style="color:var(--color-text-secondary,#666)">${label}</span><br><code style="font-size:13px">${value}</code></div>`;
    card.innerHTML = [
      '<b>Download QR code saves …</b>',
      row('Today (any camp)', today.qrFileName('April Vacation Camp')),
      row('After, both-schools camp (A and B)', shared.qrFileName('April Vacation Camp', null)),
      row('After, one-school camp, option A (no school)', shared.qrFileName('Veterans Day Camp', null)),
      row('After, one-school camp, option B (with school)', shared.qrFileName('Veterans Day Camp', 'Worcester')),
    ].join('');
    document.body.append(card);
    out.push('names');
  }
  return out.join(' + ');
})()
