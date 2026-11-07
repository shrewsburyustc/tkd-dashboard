#!/usr/bin/env bash
# shoot-q2-pc.sh — CB14 Question 2's PC shots of the three hints with option A's links drawn on
# (inject-q2.js). Run from docs/Design Review/tools with TKD_CDP_PORT set; preview signed in as admin,
# Shrewsbury's classes cleared (__tkdPreview.clearSchool('Shrewsbury')). Phone shots: steps/q2-*.js.
set -e
O="../../Testing/Color Belt Testing/Design Review mockups/cb14"
INJ="$(cat "$O/inject-q2.js")"
node cdp.mjs size 1280 800 >/dev/null; sleep 3
node cdp.mjs eval 'location.hash="#schedule"; 1' >/dev/null; sleep 2
node cdp.mjs click "Shrewsbury" >/dev/null; sleep 2
node cdp.mjs click "Add time slot" >/dev/null; node cdp.mjs wait "first" >/dev/null
node cdp.mjs eval "$INJ" >/dev/null; node cdp.mjs eval '__q2.slotEmpty("A")'
node cdp.mjs move 5 790 >/dev/null; node cdp.mjs shot "$O/q2-pc-slot-empty-A.png" >/dev/null
node cdp.mjs textrects "Settings → Classes and ranks"; node cdp.mjs key Escape >/dev/null
node cdp.mjs click "Worcester" >/dev/null; sleep 2
node cdp.mjs click "Add time slot" >/dev/null; node cdp.mjs wait "From Testing" >/dev/null
node cdp.mjs eval "$INJ" >/dev/null; node cdp.mjs eval '__q2.slotHint("A")'
node cdp.mjs move 5 790 >/dev/null; node cdp.mjs shot "$O/q2-pc-slot-hint-A.png" >/dev/null
node cdp.mjs textrects "Settings → Classes and ranks"; node cdp.mjs key Escape >/dev/null
node cdp.mjs eval 'location.hash="#forms"; 1' >/dev/null; sleep 2
node cdp.mjs click "Shrewsbury" >/dev/null; sleep 1
node cdp.mjs click "Free class — Facebook" >/dev/null; sleep 2
node cdp.mjs eval '(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith("Free class time") && !/Drag/.test(x.getAttribute("aria-label") || "")); b.click(); return 1; })()' >/dev/null; sleep 1
node cdp.mjs eval "$INJ" >/dev/null; node cdp.mjs eval '__q2.forms("A")'
node cdp.mjs eval '(() => { const e = [...document.querySelectorAll(".field-hint")].find((x) => /no classes yet/.test(x.textContent)); e.scrollIntoView({ block: "center" }); return 1; })()' >/dev/null
node cdp.mjs move 5 790 >/dev/null; node cdp.mjs shot "$O/q2-pc-forms-A.png" >/dev/null
node cdp.mjs textrects "Settings → Classes and ranks"
