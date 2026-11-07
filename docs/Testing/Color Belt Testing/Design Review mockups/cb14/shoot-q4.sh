#!/usr/bin/env bash
# shoot-q4.sh — CB14 sheet 4 (Question 4 of 4: the name of Color Belt's Prices tab).
# Today's tab bar ("Classes and ranks") and each option drawn on sheet 1's Prices tab (inject-cb14.js
# 'prices', then inject-q4.js renames it), at PC 1280, tablet 820 (touch), phone 390 (touch) and 320
# (touch); option A also as staff at 390. Each shot draws and shoots in one connection (p3/oneshot.mjs).
# Every shot prints inject-q4.js's tab bar measurement (does the bar scroll sideways?) to q4-measure.txt.
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in as an admin,
# top bar on Worcester.
set -e
set -o pipefail
C="../../Testing/Color Belt Testing/Design Review mockups/cb14"
ONE="../../Testing/Color Belt Testing/Design Review mockups/p3/oneshot.mjs"
S="$C/steps"
J="$C/inject-cb14.js"
Q="$C/inject-q4.js"
M="$C/q4-measure.txt"
: > "$M"
# after a reload the preview shows its PIN screen: type the preview PIN (2580) into it
unlock() { timeout 20 node cdp.mjs type "input[type=password]" "2580" >/dev/null || true; sleep 2; }
run() { timeout 40 node "$ONE" "$@" | tail -2 | head -1 | tee -a "$M"; }
# One size per line: "width height touch name" (touch = "-" for the PC)
SPECS="1280 800 - pc
820 1180 touch w820
390 844 touch w390
320 640 touch w320"
while IFS= read -r spec; do
  set -- $spec
  W=$1; H=$2; T=$3; N=$4
  if [ "$T" = touch ]; then timeout 20 node cdp.mjs size $W $H touch >/dev/null || true; else timeout 20 node cdp.mjs size $W $H >/dev/null || true; fi
  sleep 2
  echo "== $N" >> "$M"
  run $W $H $T "$C/q4-$N-today.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-clear.js" "$J" "$S/q4-set-today.js" "$Q"
  for o in A B C; do
    run $W $H $T "$C/q4-$N-$o.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-prices.js" "$J" "$S/q4-set-$o.js" "$Q"
  done
  echo "shot $N"
done <<< "$SPECS"
# staff, option A, phone 390: the staff account, a reload, the shot, then back to admin
timeout 20 node cdp.mjs size 390 844 touch >/dev/null || true
timeout 20 node cdp.mjs eval "$(cat "$S/q4-role-staff.js")" >/dev/null
timeout 20 node cdp.mjs reload >/dev/null; sleep 3; unlock
echo "== w390 staff" >> "$M"
run 390 844 touch "$C/q4-w390-Astaff.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-pricesStaff.js" "$J" "$S/q4-set-Astaff.js" "$Q"
timeout 20 node cdp.mjs eval "$(cat "$S/q4-role-admin.js")" >/dev/null
timeout 20 node cdp.mjs reload >/dev/null; sleep 3; unlock
timeout 20 node cdp.mjs size 1280 800 >/dev/null || true
echo done
