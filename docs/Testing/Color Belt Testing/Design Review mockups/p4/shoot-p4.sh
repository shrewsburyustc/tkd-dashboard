#!/usr/bin/env bash
# shoot-p4.sh — mockup P4's shots: Color Belt's own boxes today, and the shared parts that replace
# them (CB5 ConfirmBox, CB19 CompareDialog, CB10 RegistrationLinkBox, CB12 TimeList), at PC, 390
# and 320. Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in
# (PIN typed). Each shot reloads first so nothing drawn earlier carries over. Phones draw and shoot
# in one connection (p3/oneshot.mjs), because the phone page redraws on every cdp.mjs command.
set -e
P4="../../Testing/Color Belt Testing/Design Review mockups/p4"
ONE="../../Testing/Color Belt Testing/Design Review mockups/p3/oneshot.mjs"
EVENT="http://localhost:5191/#testing/color-belt/event/000001e0-0000-4000-8000-000000000001"
TAB="http://localhost:5191/#testing/color-belt"

prep() {  # fresh page at $1, wait for $2
  node cdp.mjs open "$1" >/dev/null
  node cdp.mjs reload >/dev/null
  node cdp.mjs wait "${2:-Ava Chen}" >/dev/null
}
inject() { node cdp.mjs eval "$(cat "$P4/inject-p4.js")" >/dev/null; node cdp.mjs eval "$(cat "$P4/steps/all.js")" >/dev/null; }
step() { node cdp.mjs eval "__p4steps.run('$1')" >/dev/null; }
shot() { node cdp.mjs move 2 2 >/dev/null; node cdp.mjs shot "$P4/$1" >/dev/null; echo "shot $1"; }
ranks() { prep "$TAB" "Classes and ranks"; node cdp.mjs click "Classes and ranks" >/dev/null; sleep 1; node cdp.mjs click "Expand Group A" >/dev/null; sleep 0.5; }
editEvent() {  # PC has an Edit button on the row; phones have Edit event in the row's ⋯
  prep "$TAB" "Events"
  node cdp.mjs click "Edit November Children Testing" >/dev/null 2>&1 || { node cdp.mjs click "More actions for November Children Testing" >/dev/null; sleep 0.5; node cdp.mjs click "Edit event" >/dev/null; }
  sleep 1; node cdp.mjs eval 'document.activeElement.blur();"ok"' >/dev/null; }
# a phone shot: draw step $4 (and $5) on the page that is open, in one connection
one() {
  local w=$1 h=$2 out=$3; shift 3
  local files=("$P4/inject-p4.js" "$P4/steps/all.js")
  local n=0
  for s in "$@"; do n=$((n+1)); printf "__p4steps.run('%s')\n" "$s" > "$P4/steps/_now$n.js"; files+=("$P4/steps/_now$n.js"); done
  node "$ONE" $w $h touch "$P4/$out" "${files[@]}" >/dev/null
  rm -f "$P4"/steps/_now*.js
  echo "shot $out"
}

if [ -z "$ONLY" ] || [ "$ONLY" = pc ]; then
  node cdp.mjs size 1280 800 >/dev/null
  editEvent; shot pc-eventdlg-today.png
  inject; node cdp.mjs eval "__p4.ready().then(()=>__p4.timeList('Group A start time'))" >/dev/null; shot pc-time-after.png
  prep "$EVENT"; node cdp.mjs click "Grading" >/dev/null; sleep 1; inject; step leave-today; shot pc-leave-today.png
  prep "$EVENT"; node cdp.mjs click "Grading" >/dev/null; sleep 1; inject; step leave-after; shot pc-leave-after.png
  for s in delstudent delstudent-busy delstudent-failed compare compare-busy reglink reglink-fail; do
    prep "$EVENT"; inject; step $s; shot "pc-$s-after.png"
  done
  ranks; inject; step class; shot pc-delclass-after.png
  ranks; inject; step class-busy; shot pc-delclass-busy-after.png
fi

if [ -z "$ONLY" ] || [ "$ONLY" = small ]; then
  node cdp.mjs size 390 844 touch >/dev/null
  if [ -z "$RESUME" ]; then  # RESUME=1 skips the shots before the time list
  prep "$EVENT"; node cdp.mjs click "Review" >/dev/null; sleep 1; shot w390-compare-today.png
  prep "$EVENT"; one 390 844 w390-compare-after.png compare-phone
  prep "$EVENT"; node cdp.mjs click "Registration link" >/dev/null; sleep 1; shot w390-reglink-today.png
  prep "$EVENT"; one 390 844 w390-reglink-after.png reglink-phone
  prep "$EVENT"; one 390 844 w390-reglink-fail-after.png reglink-phone-fail
  fi
  prep "$EVENT"; one 390 844 w390-dupbox-today.png dupbox-rect
  prep "$EVENT"; one 390 844 w390-dupbox-after.png dupbox
  editEvent; shot w390-eventdlg-today.png
  one 390 844 w390-time-after.png time

  node cdp.mjs size 320 640 touch >/dev/null
  prep "$EVENT"; node cdp.mjs click "More actions for Ava Chen" >/dev/null; sleep 0.5; node cdp.mjs click "Delete permanently" >/dev/null; sleep 1; shot w320-delstudent-today.png
  for s in delstudent delstudent-busy delstudent-failed; do
    prep "$EVENT"; one 320 640 "w320-$s-after.png" $s
  done
  prep "$EVENT"; one 320 640 w320-leave-today.png leave-today
  prep "$EVENT"; one 320 640 w320-leave-after.png leave-after
  ranks; one 320 640 w320-delclass-after.png class
  node cdp.mjs size 1280 800 >/dev/null
fi
