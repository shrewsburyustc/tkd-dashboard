# Design review of the Star rolling-check mockups A1–A3, B1–B2 (independent reviewer, 2026-11-06)

Read-only review. Checked against the rulebook (§1.4, §2.4 icon map, §3.5, §4 incl. the six WCAG 2.2 checks of v1.033, 10b rows v0.635, v0.638, v1.048, v1.055, v1.103), the fix lists (`docs/Design Review/Rolling check/Pass 1/Fix-Star.md` R4-10, R4-08, R2-08) and the real code. Nothing in the app was changed.

| Picture | Verdict | One line |
|---|---|---|
| A1 menu icons | **OK** | Exactly R4-10 / v1.048 (13); paths match Tabler 3.48; all four sizes. |
| A2 grayed Email result | **OK** (2 SHOULDs) | Matches v1.103 / Prospects; aria-describedby must apply only when hidden, not when busy. |
| A3 Undo toasts | **MUST-FIX** | The make-up Undo can't be reached by keyboard while the picker stays open; the picture says it works like every toast. |
| B1 Date signed on the form | **OK** (1 SHOULD) | Copies New students' box in the Star form's own sizes (right call); touch label is 1px bigger than the Signature label above it. |
| B2 Date signed for staff | **MUST-FIX** | No 320 shot; the "signature removed" state drops the date, though v0.635 and every other section keep it; the wrap leaves a "·" hanging at the end of line 1. |

---

## A1 — R4-10, ⋯ menu icons · OK

- **Does what the fix asks, nothing more:** "Change private day or time" → `ti-calendar`, "Back to the testing day" → `ti-calendar-event`. The words and order stay the same. This is the change in Fix-Star R4-10 (`CandidatesTab.jsx:1146–1147`).
- **Rulebook:** §2.4 already lists both uses (rulebook lines 143 and 148: "also changing a private testing's day or time, v1.048" and "Star's 'Back to the testing day', v1.048").
- **Same as other sections:** Color Belt's "Change day or time" uses `IconCalendar` (`src/screens/testing/private/PrivateTestingTab.jsx:1096`), and so does Star's own "Set private testing" (`CandidatesTab.jsx:1145`).
- **Drawing is honest:** `mock-stepA.js:19–20` uses the exact path data from `node_modules/@tabler/icons-react` 3.48.0 (IconCalendar.mjs / IconCalendarEvent.mjs, checked). It keeps the app's own `<svg>` size and stroke.
- **Sizes:** PC, tablet (touch), phone sheet and 320 are all there. Amber in Today and green in After are on the right two rows.
- **Note only (no change):** Color Belt ends a private testing with `IconCalendarX` ("Cancel private testing", `PrivateTestingTab.jsx:1107`). Star's "Back to the testing day" now shares `ti-calendar-event` with Star's "Testing privately" tag (v0.514), so the action that ends a private testing looks like the tag that marks one. v1.048 decided this and the rulebook wins. Just be ready if Jeffrey asks.

## A2 — R4-08, grayed Email result · OK, 2 SHOULDs

- **Does what the fix asks:** it gets `--color-border-strong` (rgb 207 207 202, the colors Fix-Star asks for), `cursor: not-allowed`, and `aria-describedby` → the "Email result is off…" line. This is the same look as Prospects' grayed Email (`src/styles/prospects.css:1234–1241`) and v1.103's shared gray (`src/styles/shared.css:798–805`). The button stays focusable (aria-disabled), as v1.000 (2) says.
- **Sizes:** all four are there. The 2.6× zoom is a good way to show a 1-step border change.
- **Contrast:** rgb(207,207,202) on white is under 3:1. WCAG 1.4.11 doesn't apply to inactive controls, and v1.103 already approved this gray. Fine.
- **SHOULD (build note, not the picture):** in the code, `off` is `ctx.hidden || ctx.busyId === row.id` (`src/screens/testing/star/results/ResultRows.jsx:141`). Point `aria-describedby` at the line **only while `ctx.hidden`**. While it's only busy, the line isn't on screen (`ResultsTab.jsx:601–607` draws it only when `hidden`), so the id would point at nothing. The mock gets this right by accident (`mock-stepA.js:48–53` sets it only when the line exists), but the build must not copy `off`.
- **SHOULD (picture, cheap):** in After, the "Email result is off…" line has a green outline, but in Today it has no amber one, and nothing about it changes on screen (it only gets an id). Either outline it amber in Today too, or say in the caption "outlined because the button now points at it; it doesn't look different". As drawn, it could read as a new line.

## A3 — R2-08, 5-second Undo toasts · MUST-FIX

- **"Private testing set" + Undo: fine.** The Undo button is the app's own markup (grabbed from a live `.toast .toast-undo`, `mock-stepA.js:58–85`; same as `src/components/Toast.jsx:110–115`). The code plan matches Back to the testing day's Undo (`CandidatesTab.jsx:865–871`). The dialog is already closed (`:850`), so the toast can be reached like any other toast. All four sizes are there.
- **MUST-FIX: the make-up "Drew Park added · Undo" can't be done from the keyboard as drawn.**
  - Star's make-up picker **stays open** after Add (`CandidatesTab.jsx:1053–1056`), and the picture shows the toast over the open picker at every size.
  - Testing dialogs trap Tab inside the dialog (`src/components/Dialog.jsx:8`, `:189–213`). The toast is drawn outside every dialog (`src/App.jsx:1266`; z-index 50 over the backdrop's 40, `app.css:950/1083`). So a mouse can click Undo, but a keyboard user can't Tab to it until the picker is closed, and by then the 5 seconds are usually over. This fails §4 "Everything works with keyboard only" (WCAG 2.1.1).
  - The note "hovering or focusing the toast pauses the time, as on every toast" is true for the mouse only. Here the toast can't get focus.
  - Black Belt avoids this: its picker **closes** before the Undo toast shows (`src/blackBelt/staff/candidates/useMakeupPicker.js:88–98`).
  - This is a real choice for Jeffrey, so the picture has to show it. Options:
    - **(a)** Close the picker after each Add, as Black Belt does. Costs a reopen for each extra make-up.
    - **(b)** Keep the picker open, with Undo in the picker row itself (e.g. "Added · Undo" in place of "Already added"). No timer and no focus problem, but it's a new look.
    - **(c)** Keep it as drawn and accept that only the mouse gets Undo while the picker is open.
  - My recommendation is (a): it copies a section that already does this (Black Belt), and Undo is reachable. Also say where focus goes after Undo: back to Drew's row, whose button turns back into "Add" (`runUndo` gets a `focus` target).
- **SHOULD:** both toast texts are still marked `// PROPOSAL` (`src/screens/testing/star/candidates/text.js:143` and `:300`). These pictures are the first time Jeffrey sees them drawn. Say so in the caption ("these words were never approved; OK here removes the PROPOSAL tags"), not "Words stay as they are".
- **SHOULD (wording question while it's open):** Black Belt's make-up toast says "Drew Park added · make-up from Summer 2026" (`src/blackBelt/staff/text.js:1268`). Star's "Drew Park added" reads the same as Add candidate's toast. If Jeffrey is approving the words anyway, offer Black Belt's form. Both toasts fit on one line at 320 today; a longer one wraps, which the toast allows.
- **Staff make-up toast without Undo:** correct. Staff can't delete a candidate (v0.110; `CandidatesTab.jsx:486–490`). Black Belt does the same (v0.913, `useMakeupPicker.js:93–98`). The note says it. OK.
- **Minor (check when built):** on the tablet, the wider "Private testing set | Undo" toast covers more of the bottom row's Mark paid / ⋯ than today's toast does (tablet After shot). Focus goes back to the opener's ⋯ after the dialog. That's usually a different row, but if the edited candidate is the bottom row, its ⋯ could sit under the toast (§4 check 3, "focus never hidden"). Test that case at 820 when building.

## B1 — v0.638, "Date signed" on the Star family form · OK, 1 SHOULD

- **Does what v0.638 asks:** "Date signed" goes under the signature: a gray box that can't be changed, with today's date in Massachusetts time ("Fri, Nov 6, 2026", the same `shortDate` style as New students), and the same hint text (`src/screens/forms/text.js:309–310`). The box colors copy `forms.css:933–938`, and the read-only input plus `aria-describedby` copies `FormFields.jsx:451–457`. It shows no private data, and the database already saves `signed_at`, so the "no database change" claim holds.
- **Sizes:** all four are there. At 320 the date fits on one line.
- **Open point (1), 12px PC label / 40px touch box instead of New students' 13px / 36px:** I agree with the choice. A field should match the form it sits in, and the Star form's touch fields are 40px with 16px text (`src/styles/register.css:692–707`, v0.411/v0.510). 16px text also stops phones zooming in. A 36px box would be the only short field on the Star form.
- **SHOULD:** on touch, the new label is 1px bigger than the Signature label right above it. The Signature label is pinned at 12px by `.reg-field--sign .reg-label` (`register.css:526–528`, which wins over the touch rule's 13px at `:705–707`). The new box is a separate `.reg-field`, so its "Date signed" label gets 13px on tablet and phone. When building, either put the box inside `.reg-field--sign`, or give its label the same 12px. Then the two labels match, as they do on PC. Mention it in the caption so the build isn't a surprise.
- **Amber in Today** sits on the hint line ("where the box goes"), and the subtitle says so. OK.

## B2 — v0.638, date signed on the candidate detail · MUST-FIX

- **MUST-FIX: no 320-wide shot.** CLAUDE.md asks for 320 in design review, and this is the one picture where the wrap is the open point. At 320 the label column leaves even less room, so "Ticked and signed Oct 31, 2026 ·" may break again. Take the shot.
- **MUST-FIX: the "signature removed" state.**
  - The note says it "keeps its 'signature removed <date> …' line", which means the date signed is not added there (`CandidateDialog.jsx:139`).
  - v0.635 (rulebook line 970) says the date signed "stays after the signature picture is deleted". v0.638 extends that rule to every section, and every other section keeps it: Color Belt "Signed on the form, <date> (the signature is deleted 90 days after testing)" (`src/screens/testing/text.js:732`), Black Belt "Signed on <date> · … deleted on <date>" (`src/blackBelt/staff/text.js:627`), Prospects' "Date signed" row (`ProspectPanel.jsx:434`).
  - `signedAt` is still in the detail data after removal (`src/lib/star/candidatesCore.js:290`), so this needs no database change.
  - Draw this state too, e.g. "Ticked and signed Sat, Oct 31, 2026 · signature removed Feb 1, 2027 (deleted 90 days after the testing day)".
- **Open point (2), wrap and weekday.** The wrap leaves "·" hanging at the end of line 1, with "View signature" alone on line 2. The date also has no weekday, while the Registered row two lines up says "Sat, Oct 31, 2026", the form box the family saw says "Fri, Nov 6, 2026", and Prospects' Date signed uses the weekday (`src/screens/prospects/text.js:237`, `dayOf` with the weekday by default). v1.055 (h) drops the weekday only for dates of birth. Two fixes, either is cheap:
  - **(a) Recommended:** a separate **"Date signed"** row under Acknowledgment, the same words as the family's box and Prospects' profile row: "Date signed · Sat, Oct 31, 2026". The Acknowledgment line stays "Ticked and signed · View signature" on one line. No wrap, no hanging dot, and it copies an approved section. It does add one row.
  - **(b)** Keep one line, but write the date with the weekday and keep "· View signature" together (no break between the dot and the link), so line 2 starts with "· View signature" or the whole thing moves down together.
  - Show Jeffrey both, with (a) as the recommendation.
- **Note only:** for a family-form registration the date signed is always the same day as the Registered row (the signature is saved when the form is sent). v0.638 still asks for it, so it's right to add. If Jeffrey asks "isn't that the same date?", the answer is yes, by design.
- **Sizes present:** PC, tablet and phone. The View signature dialog not changing is shown and correct (`SignatureDialog.jsx:36` / `text.js:274` already has the date and time).

---

## Second review (independent reviewer, 2026-11-06)

Re-checked the redrawn A2, A3, A3b, B1, B2 and reviewed the new C1. Read-only; nothing in the app changed.

| Picture | Verdict | One line |
|---|---|---|
| A2 grayed Email result | **OK** | Both SHOULDs done: the line is amber in Today and the caption says it doesn't change (`A2-email-grayed.html:27`); the build note limits aria-describedby to "hidden" only (`:101`). |
| A3 Undo toasts | **OK** | Make-up toast moved to its own choice (A3b); the "dialog has already closed, reachable by mouse and keyboard" claim is now true for the only toast left (`A3-undo-toasts.html:27`); PROPOSAL wording fixed. |
| A3b make-up Undo options | **OK** (1 SHOULD) | Keyboard problem stated plainly; (c) labelled as breaking §4 / WCAG 2.1.1; pros/cons fair; Black Belt's wording offered. Missing: where focus goes after Undo. |
| B1 Date signed on the form | **OK** | Label drawn 12 px on every size, caption says the build matches `.reg-field--sign` (`B1-date-signed-form.html:94`). |
| B2 Date signed for staff | **OK** (1 SHOULD) | 320 and removed states drawn for Today, (a) and (b); (a) keeps the date after removal, as v0.635 says. Option (b) splits the date itself across lines at 320. |
| C1 roster room | **MUST-FIX** (+2 SHOULDs) | Today/After honest and well measured, but the 696 alternative is offered as "your call" without a picture, and the measurement used one font only. |

### A2 — OK
- Today now outlines the "Email result is off…" line in amber at every size, and the caption says "The 'Email result is off …' line itself doesn't change; it is outlined because the button now points at it" (`A2-email-grayed.html:27`). First review's picture SHOULD is done.
- The green note says aria-describedby points at the line "only while private details are hidden — not while the button is only busy" (`:101`). First review's build SHOULD is done.

### A3 — OK
- The subtitle (`A3-undo-toasts.html:27`) now says the make-up toast is a separate choice (A3b), and that both toast texts are still PROPOSAL and an OK removes the tags. Both first-review wording SHOULDs are done.
- The note "hovering or focusing the toast pauses the time" now only covers "Private testing set", whose dialog has closed before the toast shows. That's true.
- The tablet "bottom row under the toast" build check is still written down. Good.

### A3b — OK, 1 SHOULD
- **Honest:** the subtitle explains *why* (Tab stays inside the dialog), and (c) is drawn as it is today with the con in bold: "breaks the rulebook's keyboard-only rule (§4 …, WCAG 2.1.1)" (`A3b-makeup-options.html:99`). It isn't hidden or softened.
- **Fair:**
  - (a)'s con, reopening Add candidate → Make-up for each extra make-up, is the real cost.
  - (b)'s cons are real: it's a new look, and nobody has decided how long the row Undo stays (`:81`).
  - The (b) row Undo is the row's own Add button, renamed, with an aria-label "Undo adding Drew Park" (`mock-stepA.js:96–102`). So its touch size is the Add button's, not a new smaller target.
- **Facts check out:**
  - (a) "focus goes back to Add candidate" (`:54`) matches the code. The picker is opened from the Add candidate menu (`CandidatesTab.jsx:1113`, `openMakeups(menu.anchor)`), and Black Belt closes, then `focusSoon(opener)` (`useMakeupPicker.js:87–92`).
  - Staff get no Undo in any option (v0.110). Correct.
  - Black Belt's "… added · make-up from <earlier testing>" wording is offered in the subtitle. Good.
- **SHOULD (still open from the first review):** say where focus goes **after Undo**.
  - In (a), the toast's Undo button disappears when the toast turns to "Undone", and Drew's row is deleted. Without a target, focus falls to the page body. Suggest: back to Add candidate, the same place focus went after the Add.
  - In (b), focus stays on Drew's row, whose button turns back into "Add".
  - One line in each option's note is enough.

### B1 — OK
- The touch label is drawn at 12 px, and the tablet/phone captions say "Label 12 px, the same as 'Signature' above it" / "both labels 12 px".
- The green note gives the build two ways to do it: put the box inside `.reg-field--sign`, or give its label 12 px (`B1-date-signed-form.html:94`). The first review's SHOULD is done.
- The New-students reference shot and its caption explain why this is 12 px and not 13 px. Clear.

### B2 — OK, 1 SHOULD
- **320 is there** for Today, (a) and (b), each with the signature on file and removed (`B2-date-signed-staff.html:53–69, 104–120, 148–164`). The first review's MUST-FIX is done.
- **Removed state follows v0.635** (rulebook line 970: the date signed "stays after the signature picture is deleted"):
  - In (a), the "Date signed · Sat, Jul 4, 2026" row stays under "Ticked and signed · signature removed Oct 31, 2026 (deleted 90 days after the testing day)" (`:94`). This is how Color Belt, Black Belt and Prospects keep it. The first review's MUST-FIX is done.
  - In (b), the date is folded into the line (`:138`). Also correct, just long.
- **Choice drawn fairly:**
  - (a) is recommended. Its pros/cons say it copies Prospects' row and the family box, adds the weekday, and costs one more row.
  - (b)'s con, "wraps at every size … two dates in one line", is honest (`:166`).
- **Tablet left out:** the subtitle says the candidate detail is the same centred dialog on tablet as on PC. That's acceptable for this one-row change.
- **SHOULD (option b only):** at 320, (b) breaks inside the date: "Ticked and signed Sat, Oct 31, / 2026 · View signature", and the removed state does the same with "Sat, Jul 4, / 2026". The 320 caption doesn't say so (`:151`, empty caption). Either add "the date itself breaks at 320" to (b)'s cons, or say the build keeps the date in one piece (non-breaking spaces). This is one more point for (a). It doesn't block, because (a) is the recommendation.

### C1 — L-02 roster room · MUST-FIX, 2 SHOULDs

**What's right**
- Matches Fix-Star pass 2 L-02 (`docs/Design Review/Rolling check/Pass 2/Fix-Star.md:53–62`). It shows 683 and 700 wide with Standard and Largest, plus 667 × 375 sideways, which the fix list names. It also shows 1280 / 820 Standard / 820 Largest / 390 / 320 unchanged.
- The room numbers add up: window minus 72 or 96 (683 → 611 / 587, 700 → 628 / 604, 667 → 571, 820 → 748 / 724).
- Follows v1.130 (rulebook line 1012) and `src/lib/pageRoom.js:18–34`:
  - A class follows `usePageRoomBelow(limit)`.
  - Only the roster switches. Dialogs and ⋯ menus keep the window, said in the subtitle.
  - The phone rows' styles aren't behind a phone-width @media rule.
  - The roster isn't drawn at the 1023.98 window rule (`star.css:886`).
- **Method is honest** (`C1-roster-room.html:111`):
  - It says plainly that After is the phone roster's own markup, copied at a 600 px window and swapped in.
  - It says the buttons in the drawn roster don't work, and the page around the roster is today's.
  - It says nothing in the app changed.
  - `mock-room.js` does what it says: real overlap measured with `Range.getClientRects` per text line, cell by cell.
  - The 617 / 636 thresholds come from 1–8 px steps on the real roster in the widest case (both schools, details shown, Largest).
  - This is the right way to pick a limit. It's better than the parts page's sample.

**MUST-FIX: the 696 alternative is offered but not drawn.**
- The note ends "Your call if you want more: … from 696 they look exactly as at 820" (`:101`). That makes it a choice for Jeffrey.
- CLAUDE.md says "show each option visually". The picture shows neither a 640–695 room with the "tight" columns (names on 4–5 lines, "Testing for" on 2 lines) nor what 696 would stack.
- Add one Today/After pair at a window in that band. For example, 720 wide touch Standard (room 648): with limit 640 it keeps tight columns; with limit 696 it gets stacked rows. Then he can see what he's choosing between.
- Or drop the alternative and state the limit as the drawer's decision. But see the recommendation below.

**SHOULD: the limit was measured in one font only.**
- The app's font is `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (`src/styles/tokens.css`). The measurements were taken in Chrome on Windows, which uses Segoe UI.
- On an iPad, the text is in San Francisco, which is generally wider than Segoe UI at the same size. So "Shrewsbury" in its 61 px column will stick out at a larger room than 636. A limit of 640 leaves 4 px of margin over the measured overflow.
- The note should say which browser and font it measured in. If possible, also re-measure once with Safari or WebKit, or with `-apple-system` forced.

**SHOULD: "the same as Dashboard core's sample" is not a reason.**
- `src/parts/L02.jsx:18` is `SAMPLE_ROOM = 640`, "the sample roster's limit". It describes the parts page's made-up roster.
- v1.130 says each roster's limit is its own, written once.
- No section roster on `main` calls the hook yet (`git grep usePageRoomBelow main` finds only `pageRoom.js`, `L02.jsx` and the checks). Color Belt's uncommitted worktree has `ROSTER_ROOM = 0` as a placeholder (`color-belt-session-01afc8/src/screens/testing/event/EventPage.jsx:128`). Camps and Black Belt have nothing.
- So there is no section number to match. Drop the "same as the sample" wording so it doesn't read as a rule.

**640 vs 696: recommend 696.**
- **640 is the bare minimum.** It's 4 px over the overflow measured in Segoe UI. It keeps columns in which names break to 4–5 lines. That is "no overlap", but hardly "fits": the Today 700-Standard shot already shows the names breaking.
- **Rulebook wording:** v1.053 (rulebook line 56) says the phone layout is used "when that room is too narrow for its tablet columns". The tablet columns approved and drawn are the 820 ones, and they look like 820 only from 696.
- **Cost of 696:** windows of 712–767 (Standard) and 736–791 (Largest) get the approved phone rows. Those rows work fully, use touch sizes, and need no sideways scroll. On a 744 iPad mini or a 768 iPad with Largest, the roster would be stacked rather than tight columns.
- **Benefit of 696:** it absorbs font differences between devices. And it removes the 640–695 band, where nobody has approved the columns.
- **If Jeffrey prefers the most columns:** 640 is defensible only after a measurement in the iPad's font confirms the margin.

