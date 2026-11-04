#!/usr/bin/env bash
# shoot-p2.sh — mockup P2's "after" shots on the Private testing tab at PC, tablet, phone and 320 wide:
# the Mark paid box (Liam Park), the Undo payment confirm (Noah Kim) and the cards with Not paid on.
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in.
set -e
P2="../../Testing/Color Belt Testing/Design Review mockups/p2"
P1="../../Testing/Color Belt Testing/Design Review mockups/p1"
CONFIRM=$(node -e 'const fs=require("fs");let h=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));h=h.replace(/Noah Chen/g,"Noah Kim").replace("The $140 check payment recorded on Oct 22","The $85 check payment recorded on Nov 2");process.stdout.write("__p2.confirm("+JSON.stringify(h)+")")' "$P1/ref-confirm.txt")
for spec in ${SIZES:-"1280 800 - pc" "820 1180 touch w820" "390 844 touch w390" "320 640 touch w320"}; do
  set -- $spec
  if [ "$3" = "-" ]; then node cdp.mjs size $1 $2 >/dev/null; else node cdp.mjs size $1 $2 $3 >/dev/null; fi
  node cdp.mjs open "http://localhost:5191/#testing/color-belt" >/dev/null
  node cdp.mjs reload >/dev/null  # drop anything drawn by the last size
  node cdp.mjs click "Private testing" >/dev/null
  node cdp.mjs wait "Liam Park" >/dev/null
  node cdp.mjs eval "$(cat "$P2/inject-p2.js")" >/dev/null
  # bring Liam's Mark paid into the upper part of the screen so the box fits under it
  node cdp.mjs eval '(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.getAttribute("aria-label")==="Mark Liam Park paid"); const y=b.getBoundingClientRect().y; if (y>innerHeight-230){const c=document.querySelector("main.shell-content").firstElementChild; c.style.marginTop=(-(y-300))+"px";} return "ok"})()' >/dev/null
  node cdp.mjs eval '__p2.markPaid("Liam Park","$95","Cash","at the desk")'
  node cdp.mjs eval 'document.activeElement && document.activeElement.blur(); "ok"' >/dev/null
  node cdp.mjs move 2 2 >/dev/null
  node cdp.mjs shot "$P2/$4-markpaid-after.png" >/dev/null
  node cdp.mjs eval '__p2.clear(); document.querySelector("main.shell-content").firstElementChild.style.marginTop=""; "ok"' >/dev/null
  node cdp.mjs eval "$CONFIRM"
  node cdp.mjs shot "$P2/$4-confirm-after.png" >/dev/null
  node cdp.mjs eval '__p2.clear(); document.activeElement.blur(); __p2.cards({filter:"notPaid", note:"gray"})'
  node cdp.mjs shot "$P2/$4-filter-after.png" >/dev/null
  echo "shot $4"
done
node cdp.mjs size 1280 800 >/dev/null
