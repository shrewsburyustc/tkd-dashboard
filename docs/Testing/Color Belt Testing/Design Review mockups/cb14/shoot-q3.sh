#!/usr/bin/env bash
# shoot-q3.sh — CB14 sheet 3 (Question 3 of 4: the two schools in Settings → Classes and ranks).
# Draws sheet 1's Settings part (inject-cb14.js 'settings') and then each option on it (inject-q3.js),
# at PC 1280, tablet 820 (touch), phone 390 (touch) and 320 (touch). Each shot draws and shoots in one
# connection (p3/oneshot.mjs), because cdp.mjs redraws phone pages.
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in as an admin,
# top bar on Worcester, both schools with classes (the preview's own fake data).
# SIZES="pc w390" shoots only those sizes; w390long (not in the default list) = A and B on one tall phone page.
set -e
C="../../Testing/Color Belt Testing/Design Review mockups/cb14"
ONE="../../Testing/Color Belt Testing/Design Review mockups/p3/oneshot.mjs"
S="$C/steps"
J="$C/inject-cb14.js"
Q="$C/inject-q3.js"
run() { timeout 40 node "$ONE" "$@" | tail -1; }
for N in ${SIZES:-pc w820 w390 w320}; do
  case $N in
    pc) W=1280; H=1400; T=-;;
    w820) W=820; H=1180; T=touch;;
    w390) W=390; H=844; T=touch;;
    w320) W=320; H=640; T=touch;;
    w390long) W=390; H=2900; T=touch;; # A and B only: a tall phone page, to compare their length
  esac
  if [ "$T" = touch ]; then timeout 20 node cdp.mjs size $W 800 touch >/dev/null || true; else timeout 20 node cdp.mjs size $W 800 >/dev/null || true; fi
  sleep 2
  # remember each school's list at this size (first class open)
  run $W 800 $T "$C/tmp-q3.png" "$S/wait.js" "$S/nav-classes.js" "$S/school-W.js" "$S/nav-classes.js" "$S/set-grab.js" "$J" >/dev/null
  run $W 800 $T "$C/tmp-q3.png" "$S/wait.js" "$S/school-S.js" "$S/set-grab.js" "$J" "$S/school-W.js" >/dev/null
  # Today (PC only): Testing → Color belt testing → Classes and ranks, Worcester in the top bar
  if [ "$N" = pc ]; then run $W 800 $T "$C/q3-pc-today.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-clear.js" "$J"; fi
  # phones: scroll so the part starts at the top; PC: the whole page in one tall shot
  SC=()
  if [ "$N" != pc ]; then SC=("$S/scroll-part.js"); fi
  OPTS="A BWorcester BShrewsbury Bempty C"; [ "$N" = w390long ] && OPTS="A BWorcester"
  for o in $OPTS; do
    PRE=(); POST=()
    if [ "$o" = BShrewsbury ]; then PRE=("$S/q3-swap.js"); POST=("$S/q3-unswap.js"); fi
    run $W $H $T "$C/q3-$N-$o.png" "$S/wait.js" "$S/nav-settings.js" "${PRE[@]}" "$S/set-settings.js" "$J" "${POST[@]}" "$S/q3-set-$o.js" "$Q" "${SC[@]}"
  done
  echo "shot $N"
done
rm -f "$C/tmp-q3.png"
timeout 20 node cdp.mjs size 1280 800 >/dev/null || true
