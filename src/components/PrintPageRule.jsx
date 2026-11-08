// PrintPageRule.jsx — the paper's size and margins while a sheet prints (pass 2 P-04).
// Why it exists: an unnamed @page rule inside another section's print rules (finance.css 0.6in,
// testing-events.css 0.75in) beats a NAMED page (`@page rcpt-receipt`, `@page pp-visitor`) in Edge and
// Chrome, so a sheet printed after those styles had loaded got the wrong margins (the shared receipt
// printed at 0.6in all round; the visitor sheet's foot went onto an extra page). A later unnamed
// @page wins over those, and goes away with the sheet: this part draws one, inside the sheet's own
// print portal, so it exists only while that sheet is printed.
// The visitor sheet (prospects/PrintSheet.jsx PAGE_RULE) and Black Belt's and Color Belt's results
// sheets each write the same rule by hand; they can switch to this part later.
//
// Props:
//   size    the paper, default 'letter portrait'
//   margin  the margins as CSS, e.g. '0.6in 0.7in' (top and bottom, then the sides)
export default function PrintPageRule({ size = 'letter portrait', margin }) {
  return <style>{`@page { size: ${size}; margin: ${margin}; }`}</style>;
}
