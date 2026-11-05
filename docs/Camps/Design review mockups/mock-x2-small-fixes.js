// mock-x2-small-fixes.js — Camps pass 1, step 1 (picture 20), drawn ON TOP of the real preview page for a
// picture only. Nothing is saved; a reload removes it. It copies the shared parts' own markup and classes
// (ErrorBanner's errbar, Notice's notice, the menu's tmenu-item), so it looks exactly like the app.
//   window.__x2 = { mode, ... } then run this file (node cdp.mjs eval "$(cat …)")
//   mode 'moveEdit'          the open ⋯ menu: Edit camp moves to just after Close / Open sign-up (S-8)
//   mode 'banner', text, retry   the amber bar above the roster, with or without Retry (S-2)
//   mode 'dialogFail', text, retry, phone   the open Edit camp box shows its load failure (S-2)
//   mode 'weight', value     the family page's week titles at that weight (R4-06)
(() => {
  const s = window.__x2;
  if (!s) return 'set window.__x2';
  const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-alert-triangle CLS" aria-hidden="true"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"></path><path d="M12 16h.01"></path></svg>';
  const ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-refresh" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path></svg>';
  const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-x" aria-hidden="true"><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></svg>';
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };

  if (s.mode === 'moveEdit') {
    const menu = [...document.querySelectorAll('[role=menu]')].pop();
    if (!menu) return 'open a ⋯ menu';
    const wraps = [...menu.children];
    const edit = wraps.find((w) => /^Edit camp$/.test(w.textContent.trim()));
    const signups = wraps.filter((w) => /sign-up/i.test(w.textContent));
    if (!edit || signups.length === 0) return 'no Edit camp / sign-up line';
    const copy = edit.cloneNode(true);
    copy.dataset.mock = 'x2';
    edit.style.display = 'none';
    signups[signups.length - 1].after(copy);
    return box(copy);
  }

  if (s.mode === 'banner') {
    document.querySelectorAll('[data-mock=x2]').forEach((e) => e.remove());
    const at = document.querySelector('.cp-roster-area');
    if (!at) return 'open a camp';
    const bar = document.createElement('div');
    bar.dataset.mock = 'x2';
    bar.className = 'errbar';
    bar.innerHTML = `${ICON_ALERT.replace('CLS', 'errbar-icon')}<span class="errbar-text"></span><span class="errbar-actions">${s.retry ? `<button type="button" class="btn errbar-retry">${ICON_REFRESH}Retry</button>` : ''}<button type="button" class="tib errbar-dismiss" aria-label="Dismiss"><span class="tib-box">${ICON_X}</span></button></span>`;
    bar.querySelector('.errbar-text').textContent = s.text;
    at.before(bar);
    return box(bar);
  }

  if (s.mode === 'dialogFail') {
    // PC / tablet: a box (.dialog) whose title is .dialog-title; phone: a full page whose head stays
    // and whose body (.dialog-page-body) holds the form.
    const page = [...document.querySelectorAll('.dialog-page-body')].pop();
    const dlg = page || [...document.querySelectorAll('.dialog')].pop();
    if (!dlg) return 'open Edit camp';
    // The failed box keeps only its title (the form below it isn't drawn when the camp didn't load).
    const title = page ? null : dlg.querySelector('.dialog-title');
    [...dlg.children].forEach((c) => { if (!c.dataset.mock && c !== title) c.style.display = 'none'; });
    dlg.querySelectorAll('[data-mock=x2]').forEach((e) => e.remove());
    const part = document.createElement('div');
    part.dataset.mock = 'x2';
    const close = s.phone ? '' : '<button type="button" class="btn">Close</button>';
    const actions = s.retry || !s.phone ? `<div class="dialog-actions">${s.retry ? '<button type="button" class="btn">Retry</button>' : ''}${close}</div>` : '';
    part.innerHTML = `<div class="notice" role="alert">${ICON_ALERT.replace('CLS', 'notice-icon')}<span></span></div>${actions}`;
    part.querySelector('.notice span').textContent = s.text;
    if (title) title.after(part); else dlg.prepend(part);
    return box(part);
  }

  if (s.mode === 'weight') {
    const titles = [...document.querySelectorAll('.camp-week__title')];
    titles.forEach((t) => { t.style.fontWeight = String(s.value); });
    return titles.map(box);
  }
  return 'unknown mode';
})()
