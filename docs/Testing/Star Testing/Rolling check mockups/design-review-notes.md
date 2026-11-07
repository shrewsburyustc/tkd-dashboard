# Star rolling check, pass 1 Step A + pass 2 L-02: design review of the uncommitted build (2026-11-07)

Method: preview app on localhost:5175 (fake database), hidden Chrome via `docs/Design Review/tools/cdp.mjs`, touch emulation at 820x1180, 390x844, 320x700, 667x375, and 683/700/720/767/768/784/791/792 wide. Screenshots: `shots/design-review/`. No source file was changed. Verdict: no MUST-FIX.

## 1. Candidate menu icons (A1) - OK
- Alex Kim menu: Edit details = `edit`, Change private day or time = `calendar`, Back to the testing day = `calendar-event`, Grade = `school`, Edit payment = `cash-edit`, Undo payment = `arrow-back-up`, Print receipt, Withdraw, Delete permanently. Same as the picture at 1280 and 320 touch; 820 and 390 checked by DOM (same icons).
- Row height 32 px mouse, 44 px touch at 820/390/320; sheet with Cancel at 390 and 320. No sideways scroll.

## 2. Grayed Email result (A2) - OK
- Border rgb(207,207,202) 1px (was 229,229,226), cursor not-allowed, aria-disabled=true, still focusable, aria-describedby -> `#str-email-off` ("Email result is off while private details are hidden. Email results at the desk."), line is 13 px. Enter on it does nothing (no dialog, no toast).
- Keyboard focus ring 2 px solid rgb(0,53,149). Button 28 px high (mouse), 36 px (touch).
- SHOULD (not new): touch button is 36 px, under the 44 px touch-row rule (above the 24 px minimum); same size as Mark paid, so left as the shared `btn-sm`. Grayed text rgb(138,138,133) on rgb(247,247,245) is about 3:1; disabled controls are exempt from the contrast rule.

## 3. Undo toasts (A3, A3b) - OK, with one SHOULD
- Set private testing: toast "Private testing set" + Undo; 40 px at PC, 44 px touch, one line at 320, centered above the bottom bar on the phone. Focus returns to the row's ... button and the toast does not cover it. Undo restores the old state, toast "Undone", focus stays on ... (checked on Ethan Lopez).
- Make-up as admin: picker closes, toast "<name> added" + Undo, focus ends on Add candidate, Undo removes the candidate and the picker offers them again. Staff: toast "Drew Park added" with no Undo. Staff do get Undo on "Private testing set", which matches rulebook v0.521 (only the make-up Undo is admin only).
- SHOULD: right after Add, focus sits on `<body>` for about 0.6-1.2 s and only then lands on Add candidate (measured at t+100..600 ms = BODY, t+1200 ms = Add candidate; with a 1.5 s wait it was already there). A keyboard or screen reader user can press a key into nothing in that gap. Move focus when the picker closes, not when the list reloads.
- SHOULD (mock only?): the toast shows 0.5-1 s before the row shows "Private - Sat, Nov 14 ..." or loses a removed make-up row (list reload). Probably the fake database delay; check on the real one.

## 4. Family form Date signed (B1) - OK
- `<label for="sreg-signed">Date signed</label>` + `<input readonly id="sreg-signed" aria-describedby="sreg-signed-hint">`, value "Sat, Nov 7, 2026", hint "Filled in automatically with today's date." So the screen reader name is "Date signed", read only, with the hint as description.
- Label 12 px (same as the Signature label), hint 12 px, gray rgb(247,247,245) box with rgb(207,207,202) border. Box 32 px high / 13 px at PC; 40 px / 16 px at 820, 390, 320. Date fits on one line at 320 (box 254 px wide). No sideways scroll at any size.
- Keyboard focus: 2 px solid rgb(0,53,149), :focus-visible true. The box is a tab stop (readonly input); fine, and it lets a screen reader reach it.

## 5. Staff detail Date signed (B2 option A) - OK
- Noah Chen (family form): Registration block: Registered, Reference, Acknowledgment "Ticked and signed - View signature", then new row "Date signed  Sun, Nov 1, 2026" (same dt/dd row class as the others, 13 px gray label). Morgan Hale (Summer, signature removed): Acknowledgment keeps its "signature removed ..." text, Date signed row stays. Sofia Reyes (added at the desk): "Not signed here (added at the desk)", no Date signed row. At 390 and 320 the date is on one line and nothing overflows. Matches the picture.

## 6. Roster limit 696 (C1) - OK, with notes
Rooms measured (`main[data-page-room]`) match the picture: 683 Standard 611, Largest 587; 700 -> 628/604; 720 -> 648/624; 667x375 Largest 571.
- Stacked rows (no header, name + registered, stars - school, paying - paid, tag + Mark paid): 683/700/720 wide at Standard and Largest, 667x375 Largest, 767 Standard (room 695), 791 Largest (room 695), 390 and 320. Zero overlapping text pairs, zero text outside its row, no clipped cells, no document or table sideways scroll in any of them. Row height 45-142 px (320: 67-152), all 44 px or more.
- Columns come back exactly at room 696: 768 Standard and 792 Largest; also 784 Standard, 820 Standard (room 748), 820 Largest (724), 1280 Standard (1228) and Largest (1184). No overlaps, no clipping, no sideways scroll.
- SHOULD (as drawn, not a build fault): just above the limit (room 696-712) the Candidate column is only about 97-107 px, so names plus "Shrewsbury - Registered Oct 31" wrap to 3-6 lines (rows up to 123 px) and "0 stars -> 1 star" breaks onto two lines. Readable, nothing overlaps; the picture accepted it for 696. If it should look better, the limit could go to about 740.
- SHOULD (already there, not in this diff): "Review possible duplicate" chip on a flagged row is a button 129 x 22 px on touch, under the 24 px minimum target (WCAG 2.5.8) and the 44 px touch rule. Same chip at 1280 mouse not measured. Mark paid is 36 px, ... is 44 px.

## Could not check
- Real screen reader speech and the mouse pointer icon (the cursor is read from CSS; the description link from the DOM).
- Real iPad Safari font (Segoe UI was used, as in the picture's note).
- The 5-second Undo expiry visually (toast gone by about 5 s in tests; timing not measured to the millisecond).
- A picture-by-picture overlay diff: compared by eye and by measured numbers, not pixel diff.
