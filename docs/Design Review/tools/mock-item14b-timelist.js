// mock-item14b-timelist.js — draws Design Review item 14b's "after" picture ON TOP of the real preview page,
// for a picture only: a dialog's browser time boxes replaced by Star's time list (its field, and the list
// open under the second field), in 5-minute steps with AM / PM written out.
//   1. In Star's Edit event with the Start time list OPEN, run with window.__mock14b = 'grab'
//      → keeps the field and the open list (the app's own markup) in sessionStorage.
//   2. Open a dialog with browser time boxes, then run with window.__mock14b = 'draw' and
//      window.__mock14bData = { values: ['4:00 PM', '4:40 PM'], openIndex: 1, list: ['4:25 PM', …], chosen: '4:40 PM' }
// Nothing in the app changes; closing the dialog removes it.
// Run:   node cdp.mjs eval "$(cat mock-item14b-timelist.js)"
(() => {
  if (window.__mock14b === 'grab') {
    const list = document.querySelector('.fa-list');
    const field = [...document.querySelectorAll('div.fa-field')].find((f) => /AM|PM/.test(f.innerText));
    if (!list || !field || !list.getBoundingClientRect().height) return 'open Star\'s Start time list first';
    sessionStorage.setItem('__mock14bField', field.outerHTML);
    sessionStorage.setItem('__mock14bList', list.outerHTML);
    return 'grabbed';
  }
  const data = window.__mock14bData;
  const dialog = [...document.querySelectorAll('[role=dialog]')].pop();
  const inputs = dialog ? [...dialog.querySelectorAll('input[type=time]')] : [];
  const fieldHtml = sessionStorage.getItem('__mock14bField');
  const listHtml = sessionStorage.getItem('__mock14bList');
  if (!data || !inputs.length || !fieldHtml) return 'grab first, set window.__mock14bData, and open a dialog with time boxes';
  dialog.querySelectorAll('[data-mock=item14b]').forEach((e) => e.remove());
  const holder = document.createElement('div');
  const fields = inputs.map((input, i) => {
    holder.innerHTML = fieldHtml;
    const field = holder.firstElementChild;
    field.dataset.mock = 'item14b';
    field.removeAttribute('id');
    if (i !== data.openIndex) field.classList.remove('is-open'); // only the open one looks open
    // Replace the field's words (its first text) with this box's time.
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) { if (node.textContent.trim()) { node.textContent = data.values[i]; break; } }
    input.style.display = 'none';
    input.after(field);
    return field;
  });
  if (listHtml && data.openIndex != null) {
    holder.innerHTML = listHtml;
    const list = holder.firstElementChild;
    list.dataset.mock = 'item14b';
    const options = [...list.querySelectorAll('[role=option]')];
    // Show the wanted times in the first visible rows, the chosen one highlighted like Star's.
    const chosenClass = (options.find((o) => o.getAttribute('aria-selected') === 'true') || {}).className || '';
    const plainClass = (options.find((o) => o.getAttribute('aria-selected') !== 'true') || {}).className || '';
    options.forEach((o, i) => {
      if (i < data.list.length) {
        o.textContent = data.list[i];
        const isChosen = data.list[i] === data.chosen;
        o.className = isChosen ? chosenClass : plainClass;
        o.setAttribute('aria-selected', String(isChosen));
      } else o.style.display = 'none';
    });
    const anchor = fields[data.openIndex].getBoundingClientRect();
    list.style.position = 'fixed';
    list.style.left = Math.round(anchor.x) + 'px';
    list.style.top = Math.round(anchor.bottom + 4) + 'px';
    list.style.width = Math.round(anchor.width) + 'px';
    list.style.height = 'auto';
    list.style.maxHeight = 'none';
    list.style.zIndex = '2000';
    list.scrollTop = 0;
    document.body.append(list);
  }
  return 'drawn';
})()
