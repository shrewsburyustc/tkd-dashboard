// mock-item12-reglink.js — draws Design Review item 12a's "after" pictures ON TOP of the real preview pages,
// for pictures only: one Registration link button and dialog everywhere.
//   window.__mock12 = 'grab-download'  with Camps' (or Black Belt's) Registration link dialog open: keeps its
//                                      "Download QR code" button
//   window.__mock12 = 'grab-button'    on a Star or Color Belt page: keeps the header "Registration link" button
//   window.__mock12 = 'add-download'   with a dialog that has Print flyer buttons open: adds "Download QR code"
//                                      between "Copy … link" and "Print … flyer" in every school card
//   window.__mock12 = 'bb-header'      on a Black Belt cycle page: puts the header "Registration link" button
//                                      next to "Add candidate" (instead of the ⋯ item)
//   window.__mock12 = 'camps-words'    on a Camps camp page (phone): the icon-only button shows its words,
//                                      on its own line under the title like Color Belt's
// Nothing in the app changes; closing the dialog or a reload removes it.
// Run:   node cdp.mjs eval "$(cat mock-item12-reglink.js)"
(() => {
  const mode = window.__mock12;
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  if (mode === 'grab-download') {
    const b = dialog && [...dialog.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Download QR code');
    if (!b) return 'open a dialog with Download QR code';
    sessionStorage.setItem('__mock12download', b.outerHTML);
    return 'grabbed download';
  }
  if (mode === 'grab-button') {
    const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === 'Registration link');
    if (!b) return 'no header Registration link button here';
    sessionStorage.setItem('__mock12button', b.outerHTML);
    return 'grabbed button';
  }
  if (mode === 'add-download') {
    const html = sessionStorage.getItem('__mock12download');
    if (!dialog || !html) return 'grab the download button first, then open the dialog';
    let n = 0;
    for (const print of [...dialog.querySelectorAll('button')].filter((x) => /^Print .*flyer$/.test(x.innerText.trim()))) {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const dl = holder.firstElementChild;
      dl.dataset.mock = 'item12';
      print.before(dl);
      n += 1;
    }
    return `added ${n}`;
  }
  if (mode === 'bb-header') {
    const html = sessionStorage.getItem('__mock12button');
    const add = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === 'Add candidate');
    if (!html || !add) return 'grab the button first, then open a Black Belt cycle page';
    document.querySelectorAll('[data-mock=item12]').forEach((e) => e.remove());
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const b = holder.firstElementChild;
    b.dataset.mock = 'item12';
    add.after(b);
    b.style.marginLeft = '8px';
    return 'header drawn';
  }
  if (mode === 'camps-words') {
    const b = document.querySelector('button.cp-link-icon');
    if (!b) return 'open a camp page on a phone';
    b.classList.remove('cp-link-icon');
    if (!b.querySelector('[data-mock=item12]')) b.insertAdjacentHTML('beforeend', '<span data-mock="item12">Registration link</span>');
    return 'words drawn';
  }
  return 'set window.__mock12';
})()
