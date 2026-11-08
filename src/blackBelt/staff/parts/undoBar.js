// undoBar.js — hands a page's amber-bar setter to the shared save line (lib/saveLine.js).
// Why it exists: the shared line (rulebook v1.125–v1.129, design review R2-05) shows a failed Undo's
// words in "the page's bar" through one function, undoBar(bar | null). Black Belt's pages keep their
// bar in a plain useState ({ text, retry }), so this turns that setter into the function the line
// wants: a bar the line shows is marked (fromUndo), and when an Undo later works, only a marked bar
// is cleared — a failed SAVE's own bar stays (v1.127).
//
//   const line = useSaveLine({ section: T.UNDO_SECTION, showToast, undoBar: undoBarFor(setBanner) });
//
// bar = { text, retry, retrying, takeFocus } from the line. The pages draw it with parts/LineBar.jsx (an
// ErrorBanner that also acts on `takeFocus`, which only the shared PageBar did before); ErrorBanner reads
// `retrying` so a Retry that is on its way can't be pressed twice. This file only hands the bar over: the
// focus move is LineBar's.
export function undoBarFor(setBanner) {
  return (bar) => setBanner((current) => (bar ? { ...bar, fromUndo: true } : current && current.fromUndo ? null : current));
}
