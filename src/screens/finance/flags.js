// Finance's on/off switches, kept in one place so every screen that depends on one reads the same
// value (design review R4-05, rulebook v1.041).

// The "weren't closed" warnings: History's amber "N days this month weren't closed: …" line
// (v0.821), each History day's "Not closed" tag (v0.822), and Home's "N earlier days at …
// weren't closed" line (v1.041). Off for now: the school still closes the drawer on paper, so
// every day would be flagged. To bring all three back when the school starts closing days in the
// dashboard, set this to true. (Today's own "drawer isn't closed yet" reminder on Home has its own
// control: Finance → Settings.)
export const SHOW_UNCLOSED = false;
