// show-flyer.js — for a review picture only: the Star flyer is drawn into the page only while
// printing, and its look lives in @media print rules. With window.print stubbed and "Print … flyer"
// clicked, this copies every @media print rule into a plain on-screen style, so a screenshot shows
// the flyer as it prints (7 inches wide = letter paper minus the 0.75in margins). A reload removes it.
// Run:   node cdp.mjs eval "$(cat show-flyer.js)"
(() => {
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.media && /print/.test(r.media.mediaText)) {
        for (const inner of r.cssRules) if (!(inner instanceof CSSPageRule)) css += `${inner.cssText}\n`;
      }
    }
  }
  const s = document.createElement('style');
  s.textContent = `${css}html,body{background:#fff!important} .flyer-print{display:block!important;width:672px;margin:32px auto;}`;
  document.head.append(s);
  window.scrollTo(0, 0);
  return `${css.length} ${document.querySelector('.st-flyer-big')?.textContent}`;
})()
