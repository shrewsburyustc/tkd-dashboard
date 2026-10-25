// mock-item16b-buttons.js — draws Design Review item 16b's "after" picture ON TOP of the real Calendar page,
// for a picture only: the Calendar's three icon-only buttons (⋯ and the previous / next month arrows) drawn the
// way Camps' and Finance's are — the shared IconButton (src/components/IconButton.jsx): a 28px square with a
// 16px icon and a dark tooltip with the same words as its label; the arrows get Finance's bordered 32px look
// (.fin-ibtn). Today they are plain 44px buttons with 20px icons and no tooltip.
//   window.__mock16b = 'calendar'   on the Calendar: draws the three buttons, with the ⋯ tooltip showing
//   window.__mock16b = 'clear'      removes the drawing
// It borrows the app's real classes (tib, tib-box, tib-tip) and the Calendar's own icons. It only hides the
// app's buttons and adds new ones (moving or removing React's parts crashes the page). A reload removes it.
// Run:   node cdp.mjs eval "window.__mock16b = 'calendar'; $(cat mock-item16b-buttons.js)"
(() => {
  const mode = window.__mock16b;
  const MARK = 'item16b';
  const hide = (el) => {
    el.dataset.mockHide = MARK;
    el.style.display = 'none';
  };
  const mock = (el) => {
    el.dataset.mock = MARK;
    return el;
  };
  const clear = () => {
    document.querySelectorAll(`[data-mock=${MARK}]`).forEach((e) => e.remove());
    document.querySelectorAll(`[data-mock-hide=${MARK}]`).forEach((e) => {
      e.style.display = '';
      delete e.dataset.mockHide;
    });
  };
  if (mode === 'clear') {
    clear();
    return 'cleared';
  }
  if (mode === 'calendar') {
    const find = (start) => [...document.querySelectorAll('main button.icon-button')].find((b) => (b.getAttribute('aria-label') || '').startsWith(start));
    const more = find('More actions');
    const prev = find('Previous');
    const next = find('Next');
    if (!more || !prev || !next) return 'open the Calendar first';
    clear();
    // The shared IconButton: <button class="tib"><span class="tib-box">icon</span><span class="tib-tip">words</span></button>
    const swap = (original, bordered, showTip) => {
      const label = original.getAttribute('aria-label');
      const button = mock(document.createElement('button'));
      button.type = 'button';
      button.className = 'tib';
      button.setAttribute('aria-label', label);
      button.setAttribute('data-tip', 'below'); // near the top of the page the bubble goes below (placeTip does the same)
      const box = document.createElement('span');
      box.className = 'tib-box';
      const svg = original.querySelector('svg').cloneNode(true);
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      box.append(svg);
      if (bordered) {
        // Finance's previous / next day buttons (.fin-ibtn): 32px with a control border
        button.style.cssText = 'width:32px;height:32px;color:var(--color-text)';
        box.style.cssText = 'width:32px;height:32px;border:1px solid var(--color-border-control)';
      }
      const tip = document.createElement('span');
      tip.className = 'tib-tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.textContent = label;
      if (showTip) tip.style.display = 'block';
      button.append(box, tip);
      hide(original);
      original.after(button);
    };
    swap(more, false, true);
    swap(prev, true, false);
    swap(next, true, false);
    return 'calendar drawn';
  }
  return "set window.__mock16b = 'calendar' or 'clear'";
})()
