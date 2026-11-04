// all.js — P4's drawing steps in one file (oneshot.mjs runs it, then one named step through
// steps/run.js, which sets window.__p4step first). Each step: ready, then one shared part.
window.__p4steps = {
  ava: {
    title: 'Delete Ava Chen permanently?',
    body: 'The registration is deleted from November Children Testing. This can’t be undone.',
    hint: 'To keep the record, use Withdraw instead.',
    keepLabel: 'Keep student', actionLabel: 'Delete permanently', busyLabel: 'Deleting…', trash: true,
  },
  leave: {
    title: '2 results aren’t saved',
    body: 'Ava Chen and Noah Kim (Little Tiger + White) weren’t saved because the connection dropped. If you leave now, they’re lost. Stay, and they’ll save when the Wi-Fi is back.',
  },
  rank: {
    title: 'Delete High Green?',
    body: 'Green will test for Blue. Existing events keep their own copy. This can’t be undone.',
    keepLabel: 'Keep rank', actionLabel: 'Delete rank', busyLabel: 'Deleting…', trash: true,
  },
  klass: {
    title: 'Delete Group A and its 4 ranks?',
    body: 'Little Tiger’s and White’s final awards will become Not set. It’s also removed from the schedule: 6 time slots, counting every schedule. Existing events keep their own copy. This can’t be undone.',
    keepLabel: 'Keep class', actionLabel: 'Delete class', busyLabel: 'Deleting…', trash: true,
  },
  async run(name) {
    await __p4.ready();
    const s = this;
    switch (name) {
      case 'delstudent': return __p4.confirm(s.ava);
      case 'delstudent-busy': return __p4.confirm({ ...s.ava, busy: true });
      case 'delstudent-failed': return __p4.confirm({ ...s.ava, failed: "Couldn't delete. Check the connection, then try again." });
      case 'leave-today': return __p4.leaveToday(s.leave);
      case 'leave-after': return __p4.confirm({ ...s.leave, keepLabel: 'Stay on this page', actionLabel: 'Leave anyway' });
      case 'rank': return __p4.confirm(s.rank);
      case 'class': return __p4.confirm(s.klass);
      case 'class-busy': return __p4.confirm({ ...s.klass, busy: true });
      case 'compare': return __p4.compare();
      case 'compare-busy': return __p4.compare({ busy: 'keep-first' });
      case 'compare-phone': return __p4.compare({ isPhone: true });
      case 'reglink': return __p4.regLink();
      case 'reglink-fail': return __p4.regLink({ failCopy: true });
      case 'reglink-phone': return __p4.regLink({ isPhone: true });
      case 'reglink-phone-fail': return __p4.regLink({ isPhone: true, failCopy: true });
      case 'dupbox': return __p4.dupBox();
      case 'dupbox-rect': { const r = document.querySelector('.ev-dupbox').getBoundingClientRect(); return JSON.stringify([r.x, r.y, r.width, r.height]); }
      case 'time':return __p4.timeList('Group A start time');
      case 'scroll-end': {
        const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop();
        [d, ...d.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 5 && getComputedStyle(e).overflowY !== 'visible').forEach((e) => { e.scrollTop = 9999; });
        return 'ok';
      }
      default: throw new Error('no step ' + name);
    }
  },
};
'ok';
