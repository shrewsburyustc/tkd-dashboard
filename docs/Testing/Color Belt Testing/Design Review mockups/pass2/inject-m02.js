// inject-m02.js: draws pass 2's M-02 "after" ON TOP of an open History list in the preview, for the
// mockup only. Today one save that records (or undoes) a payment by another way AND changes Paying by
// shows as two entries, and "History · N changes" counts both. After (v1.055 (a), as Camps' v0.736):
// one save is one entry, money first, joined with "; ". Each "Paying by changed" entry is joined to
// the payment entry next to it with the same time and person; the count drops by one per join.
// A reload removes it.
(() => {
  const list = document.querySelector('.hist-list');
  if (!list) return 'open the History list first';
  const items = [...list.querySelectorAll('.hist-item')];
  const textOf = (li) => li.querySelector('.hist-text').textContent;
  const metaOf = (li) => li.querySelector('.hist-meta').textContent;
  let joined = 0;
  for (const li of items) {
    if (!li.isConnected || !textOf(li).startsWith('Paying by changed')) continue;
    // the payment entry of the same save: the neighbour with the same time and person that isn't
    // joined yet (the list is newest first, so a save's two rows sit next to each other)
    const near = [li.previousElementSibling, li.nextElementSibling].find(
      (n) => n && n.classList.contains('hist-item') && !n.dataset.joined && metaOf(n) === metaOf(li) && /^Payment /.test(textOf(n)),
    );
    if (!near) continue;
    near.querySelector('.hist-text').textContent = `${textOf(near)}; ${textOf(li)}`;
    near.dataset.joined = 'yes';
    li.remove();
    joined += 1;
  }
  const label = document.querySelector('.hist-btn .hist-label');
  const count = list.querySelectorAll('.hist-item').length;
  // the middle dot, made from its number so the PowerShell shoot script can't garble it
  const dot = String.fromCharCode(183);
  if (label) label.textContent = count === 1 ? `History ${dot} 1 change` : `History ${dot} ${count} changes`;
  return `joined ${joined}`;
})();
