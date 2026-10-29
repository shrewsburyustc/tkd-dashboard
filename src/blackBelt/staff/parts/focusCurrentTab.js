// focusCurrentTab.js — after × closes an amber bar on a Black Belt tab, put the keyboard focus on
// that tab's own tab button (Cycles, Rubric and prices, Candidates …).
// Why it exists: the bar's × removes the button that had focus, and the browser then drops focus
// on the page body — a keyboard or screen-reader user would have to start again from the top
// (design review of BB4, v0.966). The shared ErrorBanner stays as it is; Black Belt's own "×"
// handlers call this instead.
//
//   focusCurrentTab()  — waits one frame (the bar is gone by then), then focuses the selected tab
//                        of the Black Belt page on screen (the cycle page's tabs first, else the
//                        Cycles / Rubric and prices tabs).
export function focusCurrentTab() {
  window.requestAnimationFrame(() => {
    const tab =
      document.querySelector('.bb .bb-cycle-tabs [role="tab"][aria-selected="true"]') ??
      document.querySelector('.bb [role="tablist"] [role="tab"][aria-selected="true"]');
    tab?.focus();
  });
}
