#!/usr/bin/env bash
# shoot-sizes.sh — mockup P1's Mark paid box and Undo payment confirm at tablet, phone and 320 wide.
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in.
set -e
P1="../../Testing/Color Belt Testing/Design Review mockups/p1"
CONFIRM=$(node -e 'const fs=require("fs");let h=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));h=h.replace(/Noah Chen/g,"Owen Reed").replace("The $140 check payment recorded on Oct 22","The $65 cash payment recorded on Oct 27");process.stdout.write("__p1.confirm("+JSON.stringify(h)+")")' "$P1/ref-confirm.txt")
for spec in ${SIZES:-"820 1180 touch w820" "390 844 touch w390" "320 640 touch w320"}; do
  set -- $spec
  node cdp.mjs size $1 $2 $3 >/dev/null
  node cdp.mjs open "http://localhost:5191/#testing/color-belt/event/000001e0-0000-4000-8000-000000000001" >/dev/null
  node cdp.mjs wait "Ava Chen" >/dev/null
  node cdp.mjs eval "$(cat "$P1/inject-p1.js")" >/dev/null
  # bring Ava's Mark paid into the upper part of the screen so the box fits under it
  node cdp.mjs eval '(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.getAttribute("aria-label")==="Mark Ava Chen paid"); const c=document.querySelector("main.shell-content").firstElementChild; c.style.marginTop=(-(b.getBoundingClientRect().y - 300))+"px"; return "ok"})()' >/dev/null
  node cdp.mjs eval '__p1.markPaid("Ava Chen","$50","Cash","on the form")'
  node cdp.mjs eval 'document.activeElement && document.activeElement.blur(); "ok"' >/dev/null
  node cdp.mjs shot "$P1/$4-markpaid-after.png" >/dev/null
  node cdp.mjs eval '__p1.clear(); document.querySelector("main.shell-content").firstElementChild.style.marginTop=""; "ok"' >/dev/null
  node cdp.mjs eval "$CONFIRM"
  node cdp.mjs shot "$P1/$4-confirm-after.png" >/dev/null
  echo "shot $4"
done
node cdp.mjs size 1280 800 >/dev/null
