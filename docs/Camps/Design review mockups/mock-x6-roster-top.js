// mock-x6-roster-top.js — Camps "the area above the roster" (picture 21-roster-top: pass 1 step 2,
// R3-10, R3-02, R5-04, R3-09), drawn ON TOP of the real preview page for a picture only. Nothing is
// saved; a reload removes it. It reuses the real parts' markup and classes:
//   - the shared duplicate box (.ev-dupbox) is MOVED, not redrawn, to the top of .cp-roster-area (R3-10);
//   - the count cards' own .ev-card-value / .ev-card-note spans (CountCards.jsx) for To collect (R3-02)
//     and Payments recorded (R5-04);
//   - the shared gray line under the cards (.cards-note) for option B / C;
//   - the shared IconButton markup (.tib / .tib-box / .tib-tip, IconButton.jsx) for the search ✕, as
//     Prospects' search box has it (PipelineBar.jsx);
//   - the shared "Showing … only · Show all" line (.ev-filter-line.cards-showing + .link-button.inline-link)
//     for the no-match line (R3-09).
// Usage: window.__x6 = { option: 'A'|'B'|'C'|null, collect: { count, money }, removedPaid, dupNote,
//          clear: true (✕ when the box has text), tip: true (PC tooltip shown), nomatch: true }
//        then run this file. option null = no change to the cards (only the moves / search parts).
(() => {
  const s = window.__x6;
  if (!s) return 'set window.__x6';
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const area = document.querySelector('.cp-roster-area');
  if (!area) return 'open a camp page';
  const out = {};

  // R3-10: the duplicate box first, above "Updated …" and the cards.
  const dup = area.querySelector('.ev-dupbox');
  if (s.moveDup !== false && dup) { area.prepend(dup); out.dup = box(dup); }

  // The cards (by their label text, as CountCards draws them).
  const card = (label) => [...area.querySelectorAll('.ev-card')].find((c) => c.querySelector('.ev-card-label')?.textContent.trim().startsWith(label));
  const note = (text) => { const n = document.createElement('span'); n.className = 'ev-card-note'; n.textContent = text; return n; };

  if (s.option) {
    // R3-02: the possible duplicate leaves To collect (count and money).
    const collect = card('To collect');
    if (collect && s.collect) {
      collect.querySelector('.ev-card-value').textContent = s.collect.count;
      collect.querySelectorAll('.ev-card-note').forEach((n) => n.remove());
      collect.append(note(s.collect.money));
      if (s.option === 'A') collect.append(note(s.dupNote ?? '1 possible duplicate not counted'));
      out.collect = box(collect);
      out.collectNotes = [...collect.querySelectorAll('.ev-card-note')].map(box);
    }
    // R5-04: Payments recorded says how much of it came from removed campers.
    const paid = card('Payments recorded');
    if (paid && s.removedPaid) {
      paid.querySelectorAll('.ev-card-note').forEach((n) => n.remove());
      paid.append(note(`includes ${s.removedPaid} from removed campers`));
      out.paid = box(paid);
      out.paidNote = box(paid.querySelector('.ev-card-note'));
    }
    // The gray line under the cards (the day's extras count line).
    const line = area.querySelector('.cards-note');
    if (line && s.option === 'B') {
      const second = document.createElement('p');
      second.className = 'cards-note';
      second.textContent = 'To collect leaves out 1 possible duplicate until it’s reviewed.';
      line.after(second);
      out.lineB = box(second);
    }
    if (line && s.option === 'C') {
      line.textContent = `${line.textContent} · To collect leaves out 1 possible duplicate`;
      out.lineC = box(line);
    }
    out.line = box(line);
  }

  // R3-09: the shared ✕ inside Find a camper while it has text.
  const search = area.querySelector('.cp-search');
  const input = search?.querySelector('input');
  if (search && input && s.clear && input.value) {
    const st = document.createElement('style');
    st.textContent = '.cp-search-input::-webkit-search-cancel-button{display:none}';
    document.head.append(st);
    input.style.paddingRight = '40px';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tib';
    b.setAttribute('aria-label', 'Clear search');
    b.style.cssText = 'position:absolute;top:50%;right:4px;transform:translateY(-50%);';
    b.innerHTML = '<span class="tib-box"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-x" aria-hidden="true"><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></svg></span><span class="tib-tip" aria-hidden="true">Clear search</span>';
    search.append(b);
    if (s.tip) {
      // as if the mouse were on it (PC only): the hover square and the tooltip
      b.querySelector('.tib-box').style.background = 'var(--color-surface)';
      b.querySelector('.tib-tip').style.display = 'block';
    }
    out.clear = box(b);
    out.search = box(search);
  }

  // R3-09: nobody matches the text → one gray line in the roster's place (search text wins).
  if (s.nomatch && input?.value) {
    const empty = area.querySelector('.tempty');
    let block = empty;
    while (block && block.parentElement !== area) block = block.parentElement;
    if (block) {
      const p = document.createElement('p');
      p.className = 'ev-filter-line cards-showing';
      p.append(`No campers match “${input.value}”. · `);
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'link-button inline-link';
      link.textContent = 'Clear search';
      p.append(link);
      block.replaceWith(p);
      // a card's own Showing line steps aside: the search text's words win
      out.nomatch = box(p);
    }
  }
  if (s.hideShowing) area.querySelectorAll('.cards-showing').forEach((p) => { if (!p.textContent.startsWith('No campers')) p.remove(); });

  const showing = [...area.querySelectorAll('.cards-showing')].find((p) => p.textContent.startsWith('Showing'));
  if (showing) out.showing = box(showing);
  out.updated = box(area.querySelector('.cp-updated-line'));
  out.cards = box(area.querySelector('.ev-cards'));
  out.firstRow = box(area.querySelector('tbody tr, .cp-rlist > *'));
  return out;
})();
