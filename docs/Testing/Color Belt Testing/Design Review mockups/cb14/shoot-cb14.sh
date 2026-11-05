#!/usr/bin/env bash
# shoot-cb14.sh — CB14 sheet 1's shots at tablet and phone sizes (PC shots are taken with cdp.mjs by hand).
# Run from docs/Design Review/tools with TKD_CDP_PORT set; the preview must be signed in as an admin.
# Each shot draws and shoots in one connection (p3/oneshot.mjs), because cdp.mjs redraws phone pages.
set -e
C="../../Testing/Color Belt Testing/Design Review mockups/cb14"
ONE="../../Testing/Color Belt Testing/Design Review mockups/p3/oneshot.mjs"
S="$C/steps"
J="$C/inject-cb14.js"
# One size per line: "width height touch name". (Before: an unquoted list split into single words,
# so cdp.mjs got "size 320" with no height and hung.) SIZES may hold lines in the same form.
SPECS="${SIZES:-820 1180 touch w820
390 844 touch w390
320 640 touch w320}"
while IFS= read -r spec; do
  [ -n "$spec" ] || continue
  set -- $spec
  if [ $# -lt 4 ]; then echo "bad size line: $spec (want: width height touch name)" >&2; exit 1; fi
  timeout 20 node cdp.mjs size $1 $2 $3 >/dev/null || true
  sleep 2
  # remember each school's list at this size
  timeout 40 node "$ONE" $1 $2 $3 "$C/tmp-grab.png" "$S/wait.js" "$S/nav-classes.js" "$S/school-W.js" "$S/nav-classes.js" "$S/set-grab.js" "$J" >/dev/null
  timeout 40 node "$ONE" $1 $2 $3 "$C/tmp-grab.png" "$S/wait.js" "$S/school-S.js" "$S/set-grab.js" "$J" "$S/school-W.js" >/dev/null
  # Settings: the top of the page, then the new part
  timeout 40 node "$ONE" $1 $2 $3 "$C/$4-settings-after.png" "$S/wait.js" "$S/nav-settings.js" "$S/set-settings.js" "$J"
  timeout 40 node "$ONE" $1 $2 $3 "$C/$4-settings-part-after.png" "$S/wait.js" "$S/nav-settings.js" "$S/set-settings.js" "$J" "$S/scroll-part.js"
  # the Prices tab
  timeout 40 node "$ONE" $1 $2 $3 "$C/$4-prices-after.png" "$S/wait.js" "$S/nav-classes.js" "$S/set-prices.js" "$J"
  echo "shot $4"
done <<< "$SPECS"
rm -f "$C/tmp-grab.png"
node cdp.mjs size 1280 800 >/dev/null
