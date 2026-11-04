// inject-p4.js — draws mockup P4's "after" on top of the real preview (no app code changes): the
// shared parts that replace Color Belt's own copies — ConfirmBox (CB5), CompareDialog (CB19),
// RegistrationLinkBox (CB10) and TimeList (CB12). The shared parts are the REAL ones: Vite serves
// the app's own source files, so this imports them and draws them with the app's React (as P3).
// Today's leave question (it only shows after a failed save on the testing day) is drawn with the
// app's own Dialog and exactly the markup EventPage.jsx uses today.
// Run __p4.ready() once per page load (it is async), then the drawing functions.
window.__p4 = {
  async ready() {
    const deps = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/deps/react.js'));
    const v = deps.slice(deps.indexOf('?'));
    this.React = (await import(`/node_modules/.vite/deps/react.js${v}`)).default;
    const rd = await import(`/node_modules/.vite/deps/react-dom_client.js${v}`);
    this.createRoot = rd.createRoot ?? rd.default.createRoot;
    this.ConfirmBox = (await import('/src/components/ConfirmBox.jsx')).default;
    this.Compare = (await import('/src/components/CompareDialog.jsx')).default;
    this.RegLink = (await import('/src/components/RegistrationLinkBox.jsx')).default;
    this.TimeList = (await import('/src/components/TimeList.jsx')).default;
    this.Dialog = (await import('/src/components/Dialog.jsx')).default;
    this.icons = await import(`/node_modules/.vite/deps/@tabler_icons-react.js${v}`);
    return 'ready';
  },
  clear() {
    document.querySelectorAll('.p4-inject').forEach((e) => e.remove());
    (this.roots ?? []).forEach((r) => r.unmount());
    this.roots = [];
  },
  mount(element) {
    const host = document.createElement('div');
    host.className = 'p4-inject';
    document.body.appendChild(host);
    const root = this.createRoot(host);
    root.render(element);
    (this.roots ??= []).push(root);
    return host;
  },
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); },
  box() {
    const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop();
    const r = d.getBoundingClientRect();
    return JSON.stringify([Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]);
  },
  // The shared confirm box. busy: draws the busy look (the section's action never settles);
  // failed: the section's amber note under the buttons.
  async confirm({ title, body, hint = null, keepLabel, actionLabel, busyLabel, loses = 'forGood', trash = false, busy = false, failed = null, blur = true }) {
    const h = this.React.createElement;
    this.mount(h(this.ConfirmBox, {
      title, hint, keepLabel, actionLabel, busyLabel, loses, failed, busy,
      actionIcon: trash ? this.icons.IconTrash : null,
      onKeep() {}, onConfirm() { return new Promise(() => {}); },
    }, body));
    await this.wait(500);
    if (blur) document.activeElement?.blur();
    return this.box();
  },
  // Today's leave question, exactly as EventPage.jsx draws it (Leave anyway · blue Stay, focused).
  async leaveToday({ title, body }) {
    const h = this.React.createElement;
    this.mount(h(this.Dialog, { title, variant: 'confirm', onRequestClose() {} },
      h('p', { className: 'tdialog-sub tdialog-body' }, body),
      h('div', { className: 'dialog-actions' },
        h('button', { type: 'button', className: 'btn' }, 'Leave anyway'),
        h('button', { type: 'button', className: 'btn btn-primary', 'data-autofocus': true }, 'Stay on this page'))));
    await this.wait(500);
    return this.box();
  },
  // The shared Compare dialog with Color Belt's rows (Mia Lopez, as the preview's real pair).
  async compare({ busy = null, isPhone = false } = {}) {
    const h = this.React.createElement;
    this.mount(h(this.Compare, {
      title: 'Mia Lopez is registered twice', // Color Belt's title on every size, as today
      sub: 'Same name in the same class. Differences are highlighted.',
      heads: ['First registration', 'Second registration'],
      rows: [
        { key: 'registered', label: 'Registered', first: 'Oct 26, 6:05 PM · family form', second: 'Oct 26, 6:11 PM · family form', plain: true },
        { key: 'reference', label: 'Reference', first: 'CB-3107', second: 'CB-3109', plain: true },
        { key: 'testing', label: 'Testing for', first: 'Yellow → Orange', second: 'Yellow → Orange' },
        { key: 'paying', label: 'Paying by', first: 'Cash', second: 'Cash' },
        { key: 'payment', label: 'Payment', first: 'Paid Oct 28', second: 'Not paid' },
      ],
      note: 'Keeping one moves the other to Removed as “Duplicate copy” (Undo for 5 seconds; admins can Restore). Both are logged.',
      busy, failed: null, onKeep() {}, onKeepBoth() {}, onClose() {}, isPhone,
    }));
    await this.wait(500);
    document.activeElement?.blur();
    return this.box();
  },
  // The shared duplicate box in place of the roster's own (same words, Mia Lopez).
  async dupBox() {
    const h = this.React.createElement;
    const Dup = (await import('/src/components/DuplicateBox.jsx')).default;
    const old = document.querySelector('.ev-dupbox');
    const slot = document.createElement('div');
    slot.className = 'p4-inject';
    old.style.display = 'none';
    old.after(slot);
    const root = this.createRoot(slot);
    root.render(h(Dup, { countText: '1 possible duplicate', pairs: [{ key: 'mia', text: 'Mia Lopez (Group A) is registered twice', onReview() {} }] }));
    (this.roots ??= []).push(root);
    await this.wait(300);
    const r = slot.getBoundingClientRect();
    return JSON.stringify([r.x, r.y, r.width, r.height]);
  },
  // The shared Registration link box; failCopy: Copy link fails, to show the note inside the box.
  async regLink({ isPhone = false, failCopy = false } = {}) {
    const h = this.React.createElement;
    const host = this.mount(h(this.RegLink, {
      title: 'Registration link',
      eventName: 'November Children Testing',
      intro: 'Registration is open until Fri, Nov 13. Families choose their class and belt on the form.',
      links: [{ url: 'https://tkd-dashboard.pages.dev/register/p4w9tdkm', school: 'Worcester', flyer: () => null }],
      onCopied() {}, onClose() {}, isPhone,
      copy: failCopy ? () => Promise.reject(new Error('blocked')) : () => Promise.resolve(),
    }));
    await this.wait(700);
    if (failCopy) {
      [...document.querySelectorAll('.p4-inject button, [role=dialog] button')].find((b) => b.innerText.trim() === 'Copy link')?.click();
      await this.wait(500);
    }
    document.activeElement?.blur();
    return this.box();
  },
  // The shared time list in place of the browser's list in the open Edit event dialog: the select
  // with that aria-label is hidden and the TimeList drawn in its place, then opened.
  async timeList(selectLabel, { open = true } = {}) {
    const h = this.React.createElement;
    const sel = [...document.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === selectLabel);
    const slot = document.createElement('span');
    slot.className = 'p4-inject';
    slot.style.display = 'block';
    slot.style.width = sel.getBoundingClientRect().width + 'px';
    sel.style.display = 'none';
    sel.after(slot);
    const root = this.createRoot(slot);
    root.render(h(this.TimeList, { value: sel.value, onChange() {}, labelId: undefined }));
    (this.roots ??= []).push(root);
    await this.wait(400);
    // every other browser list in the dialog is drawn as the shared field too (closed)
    for (const other of [...document.querySelectorAll('[role=dialog] select')]) {
      if (other === sel || other.style.display === 'none') continue;
      const s2 = document.createElement('span');
      s2.className = 'p4-inject';
      s2.style.display = 'block';
      s2.style.width = other.getBoundingClientRect().width + 'px';
      other.style.display = 'none';
      other.after(s2);
      const r2 = this.createRoot(s2);
      r2.render(h(this.TimeList, { value: other.value, onChange() {} }));
      this.roots.push(r2);
    }
    await this.wait(300);
    if (open) slot.querySelector('[role=combobox]')?.click();
    await this.wait(400);
    const list = document.querySelector('[role=listbox]')?.getBoundingClientRect();
    const f = slot.getBoundingClientRect();
    return JSON.stringify({ field: [f.x, f.y, f.width, f.height], list: list ? [list.x, list.y, list.width, list.height] : null });
  },
};
'ok';
