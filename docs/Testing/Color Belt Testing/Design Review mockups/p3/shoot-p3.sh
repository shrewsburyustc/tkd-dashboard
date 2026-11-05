#!/usr/bin/env bash
# shoot-p3.sh — mockup P3's shots: Color Belt's two summaries today and after (History line + Print
# receipt), History failing and with Hide private details on, and the shared receipt (Owen's, and
# Ava's two options). Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be
# signed in (PIN typed). Each shot reloads first so nothing drawn earlier carries over.
set -e
P3="../../Testing/Color Belt Testing/Design Review mockups/p3"
EVENT="http://localhost:5191/#testing/color-belt/event/000001e0-0000-4000-8000-000000000001"
TAB="http://localhost:5191/#testing/color-belt"

# fresh page + the helpers
prep() {
  node cdp.mjs open "$1" >/dev/null
  node cdp.mjs reload >/dev/null
  node cdp.mjs eval '(async()=>{(await import("/src/lib/finance/deviceFinance.js")).setHidePayments(false);return "ok"})()' >/dev/null
  node cdp.mjs wait "${2:-Owen Reed}" >/dev/null
  node cdp.mjs eval "$(cat "$P3/inject-p3.js")" >/dev/null
  node cdp.mjs eval "$(cat "$P3/data-p3.js")" >/dev/null
  node cdp.mjs eval "$(cat "$P3/receipts-p3.js")" >/dev/null
  node cdp.mjs eval '__p3.ready()' >/dev/null
}
private() {  # open the Private testing tab, optionally its Past side
  prep "$TAB" "Private testing"
  node cdp.mjs click "Private testing" >/dev/null
  node cdp.mjs wait "Liam Park" >/dev/null
  if [ "$1" = past ]; then node cdp.mjs click "Past" >/dev/null; node cdp.mjs wait "Sofia Reyes" >/dev/null; fi
}
scrolldlg() { node cdp.mjs eval '(()=>{const d=[...document.querySelectorAll("[role=dialog]")].pop();[d,...d.querySelectorAll("*")].filter(e=>e.scrollHeight>e.clientHeight+5&&getComputedStyle(e).overflowY!="visible").forEach(e=>e.scrollTop='"$1"');document.scrollingElement.scrollTop='"$1"';return "ok"})()' >/dev/null; }
shot() { node cdp.mjs move 2 2 >/dev/null; node cdp.mjs shot "$P3/$1" >/dev/null; echo "shot $1"; }

if [ -z "$ONLY" ] || [ "$ONLY" = pc ]; then
  node cdp.mjs size 1280 800 >/dev/null
  # event summary: today, after (top and scrolled), history failed, receipt on top
  prep "$EVENT"; node cdp.mjs click "Owen Reed" >/dev/null; sleep 1; shot pc-event-sum-today.png
  node cdp.mjs eval '__p3.summary({rows:__p3data.owen})' >/dev/null; shot pc-event-sum-after.png
  scrolldlg 9999; shot pc-event-sum-after2.png
  scrolldlg 0
  node cdp.mjs eval '__p3.receipt(__p3receipts(__p3.footer()).owen,"Owen Reed · November Children Testing")' >/dev/null; shot pc-receipt-owen.png
  prep "$EVENT"; node cdp.mjs click "Owen Reed" >/dev/null; sleep 1
  node cdp.mjs eval '__p3.summary({rows:__p3data.owen, fail:true})' >/dev/null; shot pc-event-hist-failed.png
  # private summary: today, after, the receipt options
  private; node cdp.mjs click "Ava Chen" >/dev/null; sleep 1; shot pc-private-sum-today.png
  node cdp.mjs eval '__p3.summary({rows:__p3data.ava})' >/dev/null; shot pc-private-sum-after.png
  node cdp.mjs eval '__p3.receipt(__p3receipts(__p3.footer()).avaA,"Ava Chen · Private testing")' >/dev/null; shot pc-receipt-avaA.png
  node cdp.mjs eval '__p3.clear(); "ok"' >/dev/null
  node cdp.mjs eval '__p3.summary({rows:__p3data.ava})' >/dev/null
  node cdp.mjs eval '__p3.receipt(__p3receipts(__p3.footer()).avaB,"Ava Chen · Private testing")' >/dev/null; shot pc-receipt-avaB.png
  # Sofia (past, passed) with Hide private details on: money rows left out of History
  private past
  node cdp.mjs eval '(async()=>{(await import("/src/lib/finance/deviceFinance.js")).setHidePayments(true);return "ok"})()' >/dev/null; sleep 1
  node cdp.mjs click "Sofia Reyes" >/dev/null; sleep 1
  node cdp.mjs eval '__p3.summary({rows:__p3data.sofia, hidden:true})' >/dev/null; shot pc-private-hidden.png
  node cdp.mjs eval '(async()=>{(await import("/src/lib/finance/deviceFinance.js")).setHidePayments(false);return "ok"})()' >/dev/null
fi

if [ -z "$ONLY" ] || [ "$ONLY" = small ]; then
  node cdp.mjs size 820 1180 touch >/dev/null
  prep "$EVENT"; node cdp.mjs click "Owen Reed" >/dev/null; sleep 1
  node cdp.mjs eval '__p3.summary({rows:__p3data.owen})' >/dev/null; shot w820-event-sum-after.png

  # Phones: cdp.mjs puts the size back on every command and the phone page then draws itself again,
  # dropping what was added — so the drawing and the picture happen in one connection (oneshot.mjs).
  one() { local w=$1 h=$2 out=$3; shift 3; local steps=(); for s in "$@"; do steps+=("$P3/steps/$s.js"); done; node "$P3/oneshot.mjs" $w $h touch "$P3/$out" "$P3/inject-p3.js" "$P3/data-p3.js" "$P3/receipts-p3.js" "${steps[@]}" >/dev/null; echo "shot $out"; }
  node cdp.mjs size 390 844 touch >/dev/null
  prep "$EVENT"; node cdp.mjs click "Owen Reed" >/dev/null; sleep 1
  one 390 844 w390-event-sum-after.png owen-sum
  one 390 844 w390-event-sum-after2.png owen-sum scroll-end
  one 390 844 w390-receipt-owen.png owen-receipt-phone

  node cdp.mjs size 320 640 touch >/dev/null
  private; node cdp.mjs click "Ava Chen" >/dev/null; sleep 1
  one 320 640 w320-private-sum-after.png ava-sum scroll-end
  node cdp.mjs size 1280 800 >/dev/null
fi
