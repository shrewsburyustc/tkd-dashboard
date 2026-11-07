#!/usr/bin/env bash
# shoot-pc.sh — CB14 sheet 1's PC shots (1280 wide), each drawn and shot in one connection.
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in as an admin.
C="../../Testing/Color Belt Testing/Design Review mockups/cb14"
ONE="../../Testing/Color Belt Testing/Design Review mockups/p3/oneshot.mjs"
S="$C/steps"
J="$C/inject-cb14.js"
timeout 20 node cdp.mjs size 1280 800 >/dev/null || true
shot() { local h=$1 out=$2; shift 2; timeout 40 node "$ONE" 1280 "$h" - "$out" "$@" | tail -1; }
# remember each school's PC list
shot 800 "$C/tmp.png" "$S/wait.js" "$S/nav-classes.js" "$S/school-W.js" "$S/nav-classes.js" "$S/set-grab.js" "$J"
shot 800 "$C/tmp.png" "$S/wait.js" "$S/school-S.js" "$S/set-grab.js" "$J" "$S/school-W.js"
shot 800 "$C/pc-classes-today.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-clear.js" "$J"
shot 1400 "$C/pc-settings-after.png" "$S/wait.js" "$S/nav-settings.js" "$S/set-settings.js" "$J"
shot 1000 "$C/pc-q1a-staff-settings.png" "$S/wait.js" "$S/nav-settings.js" "$S/set-staffA.js" "$J"
shot 900 "$C/pc-prices-after.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-prices.js" "$J"
shot 900 "$C/pc-q1b-staff-prices.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-pricesStaff.js" "$J"
rm -f "$C/tmp.png"
