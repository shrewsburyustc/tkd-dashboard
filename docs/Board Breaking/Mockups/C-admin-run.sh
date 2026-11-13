#!/usr/bin/env bash
# C-admin-run.sh — rebuilds the three "C-admin-" review pictures for Board breaking's admin tab.
# Why: the pictures are made by four small steps; this lists them in one place so they are the same every time.
#   1. C-admin-gen.mjs     writes the mockup sources (C-admin-src/*.src.html)
#   2. build-mockup.mjs    makes each source one self-contained HTML (real stylesheets + icons copied in)
#   3. C-admin-shoot.mjs    takes every state at PC 1280x800, tablet 820x1180 touch, phone 390x844 touch, small phone 320x640 touch
#   4. compose-sheet.mjs   puts the states into ONE combined PNG per sheet (amber outlines = what is new)
# Run from the repo's top folder:  bash "docs/Board Breaking/Mockups/C-admin-run.sh"
set -e
M="docs/Board Breaking/Mockups"
T="docs/Dashboard Core/tools"
node "$M/C-admin-gen.mjs"
for n in C-admin-prices C-admin-chart C-admin-staffview; do
  node "$T/build-mockup.mjs" "$M/C-admin-src/$n.src.html" "$M/$n.html"
  node "$M/C-admin-shoot.mjs" "$M/$n.html" "$M/C-admin-shots/$n" marks
  node "$T/compose-sheet.mjs" "$M/$n.sheet.json"
done
