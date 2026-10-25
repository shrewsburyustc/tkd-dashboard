# Rulebook rows 1.000–1.034 — for review

Design review session, 2026-10-24 and 2026-10-25 (written on top of `main` after its Black Belt merge, merged in as b3407f4). **Nothing is committed yet.** This page shows exactly what changed in `docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md` (the rulebook). The version line now reads **1.034 (draft) · Last updated 2026-10-24**.

- **35 new decision rows** (10b, just above the v0.26 row) and **35 changelog lines** (end of §11).
- **71 older rows** get a short "(See v1.0xx: …)" note at their start — not rewritten.
- **Sections reworded:** §1.1, §1.2, §2.1, §2.4 (icon map), §3.2, §3.5, §4, §6, §7, §8, §10 — before and after below.
- **Checked by a separate reviewer:** 22 points found — 20 fixed (missing or incomplete notes, five unclear wordings, leftover old words in §2.4, §6, §7 and §10); the 2 that needed your call are decided (below). Numbering, table cells, pictures and CRLF line endings passed.

## The two open points — both decided

1. **D10a — Black Belt's "Discard changes?" box: decided B (2026-10-25)** — it follows the rule: Keep editing on the left and focused first, Discard on the right and red (row 1.008; notes on v0.928 / v0.932). While re-applying the rows after main's Black Belt merge, its new Dan-change box (v0.955) got the same treatment ("Keep 1st Dan", as Star's) and v0.950 a note.
2. **D10b — the Calendar's and Schedule's red Remove: decided A (2026-10-25)** — they stay red; §7 says "gone for good" means nothing to bring it back from later (the 5-second Undo is a safety net), and Withdraw stays plain because Restore brings the person back (row 1.007, §7). Nothing changes on screen.
3. **Older, not from this change:** three older rows — v0.229 (Camps section added), v0.707 (camp payments in Finance) and v0.716 (the camp week switcher) — have a bare `|` inside a cell, which splits the table there. A housekeeping fix for later (escape it as `\|`); nothing here depends on it.

## 1. Section changes (before → after)

### TKD Dashboard — Design Guidelines

**Before:**

> **Version:** 0.960 (draft) · **Last updated:** 2026-10-24

**After:**

> **Version:** 1.034 (draft) · **Last updated:** 2026-10-25

### 1.1 Simple

**Before:**

> - **One visible button per action per screen.** The same action never appears as two visible buttons on one screen. Keyboard shortcuts don't count. (The empty-state button replaces the page-header add button on that screen rather than duplicating it.)

**After:**

> - **One visible button per action per screen.** The same action never appears as two visible buttons on one screen. Keyboard shortcuts don't count. **An empty list shows one line and no button: the page header's add button stays the one way to add** (decided v1.028; the old empty-state button is gone).

### 1.2 Clean

**Before:**

> - **Background:** white. **Accent:** school blue — **no more than 5 blue elements visible per screen** (active nav item, primary button, links, selected states). Status tags don't count. (Exception: the Star grading grid's selected cell and retest outlines, v0.512.) Red is not an accent; it appears only on delete/remove actions (section 7).

**After:**

> - **Background:** white. **Accent:** school blue — **no more than 5 blue elements visible per screen** (active nav item, primary button, links, selected states). Status tags don't count. (Exception: the Star grading grid's selected cell and retest outlines, v0.512.) Red is not an accent; it appears only on actions that lose something for good (section 7, v1.007).

### 2.1 No large buttons

**Before:**

> - **No full-width buttons** on desktop or tablet. (Exception: the single submit button on a phone form.)

**After:**

> - **No full-width buttons** on desktop or tablet. (Exceptions: the single submit button on a phone form; **a confirm box's two buttons when they don't fit on one line — they stack, each the full width of the box, in the row's order**, v1.008.)

### 2.4 Master icon map

**Before:**

> | Save / done | `ti-check` — used **only** for save/done, plus one recorded exception: **Mark paid** and the **Paid** card (Color Belt v0.136, Camps v0.709) |

**After:**

> | Yes / done — Save, done, **Mark paid**, the **Paid** card, a passed result, a chosen option (one broad meaning, decided v1.024; was "save/done only" plus the Mark paid exception) | `ti-check` |

### 2.4 Master icon map

**Before:**

> | Edit | `ti-edit` |

**After:**

> | Edit (everywhere, including Forms; decided v1.024) | `ti-edit` |

### 2.4 Master icon map

**Before:**

> | Undo | `ti-arrow-back-up` |
> | Close / cancel | `ti-x` |

**After:**

> | Undo — and **Restore**, which undoes Withdraw (decided v1.024) | `ti-arrow-back-up` |
> | No / close — Close, Cancel, clear, Not passed (one broad meaning, decided v1.024) | `ti-x` |

### 2.4 Master icon map

**After:**

> | Move to / Continue — Move to private testing, moving to a Prospects stage, Forms' Continue (decided v0.403, v0.246; added to the map v1.025) | `ti-arrow-right` — not `ti-chevron-right`, which opens a page |
> | Go to today (Finance's Today, in the phone ⋯ menu and beside the day box; the Calendar's Today button; decided v1.024) | **no icon** — the word "Today" only (the Event icon keeps its one meaning) |

### 2.4 Master icon map

**Before:**

> | Check in / Came (decided v0.236) | `ti-user-check` |
> | No-show (decided v0.236) | `ti-user-x` |

**After:**

> | Check in / Came (decided v0.236; also Camps' day grid, v1.024) | `ti-user-check` |
> | No-show / Didn't come (decided v0.236; also Camps' day grid and Color Belt's No show result, v1.024) | `ti-user-x` |

### 2.4 Master icon map

**Before:**

> | Withdraw from a roster (Color Belt, Camps; recorded v0.229) | `ti-user-minus` |
> | Download QR code (Camps Registration link; decided v0.232) | `ti-download` — same icon as Export |

**After:**

> | Withdraw from a roster (Color Belt, Camps, Black Belt — its "Remove candidate" becomes Withdraw, v1.007; recorded v0.229, v0.914) | `ti-user-minus` |
> | Download QR code (the Registration link box in every section, v1.015; first in Camps, v0.232) | `ti-download` — same icon as Export |

### 2.4 Master icon map

**Before:**

> | Change plan or Kukkiwon (Black Belt; decided v0.914) | `ti-switch-horizontal` |

**After:**

> | Change how they'll pay — Color Belt and Star (decided v1.024) and Black Belt's Change plan or Kukkiwon (v0.914): one meaning, changing how a family pays | `ti-switch-horizontal` |

### 2.4 Master icon map

**Before:**

> | Remove / withdraw a candidate (Color Belt Withdraw, Black Belt Remove candidate; added to the map v0.914) | `ti-user-minus` |

**After:**

> | Swipe or scroll sideways (the hint under Prospects' board; decided v0.246; added to the map v1.025) | `ti-arrows-horizontal` |
> | Split a bracket (Black Belt's rubric editor; decided v0.921, mockup R6; added to the map v1.025) | `ti-arrows-split-2` |
> | Cancel a private testing (Color Belt; decided v0.403; added to the map v1.025) | `ti-calendar-x` |
> | Hide private details — the account-menu switch and the top-bar chip (decided v0.215 / v0.506; added to the map v1.025) | `ti-currency-dollar-off` |
> | Grading note (Color Belt grading; decided v0.185, v0.190; added to the map v1.025) | `ti-note` |
> | Make-up (Star; its one meaning since v1.024; decided v0.121; added to the map v1.025) | `ti-repeat` |
> | Take a photo of this screen (Forms' kiosk thank-you, which says so; kept, added to the map v1.025) | `ti-camera` |

### 2.4 Master icon map

**Before:**

> | Not paid card (Black Belt Candidates roster; decided v0.914) | `ti-circle-x` |

**After:**

> | Not paid card — every roster (Color Belt events and private testing, Star, Black Belt, Camps' To collect card; decided v1.024, joining v0.914 and v0.229) | `ti-circle-x` — the clock then means only time (the Schedule, Black Belt's Paying on schedule) |

### 2.4 Master icon map

**Before:**

> | Not paid count card (Color Belt, Camps; recorded v0.229) | `ti-clock` |

**After:** *(removed)*


### 3.2 Find anything fast

**Before:**

> - **Global search bar** in the top bar on every screen **once at least one section has something to search** (decided v0.12). Searches across every section that exists.

**After:**

> - **People search in the top bar** ("Search people") on every page (decided v0.12 and v1.031): one search across every section's people — Color Belt, Star, Black Belt, Camps, Prospects; results grouped by section, showing **name, event and school only** (nothing private; Prospects keep "Ava R."); a tap opens the person's summary. The search boxes inside each list stay. Built after the design review's fixes, with a design and a security review.

### 3.5 Saving and failures

**Before:**

> - **Offline:** a visible "Offline — changes will sync when reconnected" bar appears. Check-ins made offline are queued and sent when the connection returns; nothing is discarded.

**After:**

> - **Problems stay on screen (decided v1.004):** refusals and errors use the shared amber bar until closed (Retry when it can be retried, × to close); the reason a button is grayed is a gray line next to it; toasts only say something was done.
> - **Offline (decided v1.005):** one amber offline bar under the top bar, on every page, while the device is offline or after two failed refreshes in a row; it goes away by itself when the connection is back. Its words are adapted from Star's approved offline message (Star grading keeps its grade-by-grade line). **Check-ins need the connection (decided v1.032):** nothing is queued on the device; a Wi-Fi drop is covered by this bar, the failed tap's Retry and "Not saved" tag, and Print roster as the paper backup (as v0.188 for grading).

### 4. Accessibility

**Before:**

> Target: **WCAG 2.1 AA** (the standard accessibility checklist for websites).

**After:**

> Target: **WCAG 2.2 AA** (the standard accessibility checklist for websites; raised from 2.1 by v1.033).

### 4. Accessibility

**After:**

> - **The six checks WCAG 2.2 added (v1.033), in plain words:** (1) **target size** — anything you tap or click is at least 24 × 24 px (touch screens already get 44 × 44, rule 2.5); (2) **no dragging needed** — anything done by dragging can also be done with a tap or click (e.g. ⋯ Move up / down, the status tag instead of a Board drag; recorded exception: the drawn signature on the family forms, v0.107); (3) **focus never hidden** — the control the keyboard is on is never covered by a pinned bar, the offline bar or a toast; (4) **sign in without a memory test** — no puzzle and no copying a code by hand; password managers and pasting work; (5) **don't ask twice** — what someone already typed in the same task is filled in or offered, not asked again; (6) **help in the same place** — contact lines and help links sit in the same place on every page. Phases 3–5 of the design review test them.

### 6. Layout framework

**Before:**

> - **Summary strip:** up to 4 small metric cards. Only on section home screens, not on every page.

**After:**

> - **Summary strip:** up to 4 small metric cards. Only on section home screens, not on every page — and above every roster (v1.013).

### Color

**Before:**

> | Delete / remove | Red | `#A32D2D` on `#FCEBEB` | **Deleting or removing only:** delete and remove buttons (including remove from class/roster), their confirmations, trash and remove icons on hover |

**After:**

> | Delete (gone for good) | Red | `#A32D2D` on `#FCEBEB` | **Losing something for good only (v1.007):** Delete permanently and other delete buttons, the action button of a confirm box that loses something for good (incl. "Leave anyway", v1.008), the Calendar's and Schedule's Remove (gone once their 5-second Undo is over, v1.007), trash icons on hover — never Withdraw or another removal that can be brought back later (Restore) |

### Color

**Before:**

> - Blue (accent) and red (delete/remove) are never used as large filled backgrounds.

**After:**

> - Blue (accent) and red (gone for good, v1.007) are never used as large filled backgrounds.

### Color

**Before:**

> - **Red means delete or remove — nothing else** (decided v0.5, confirmed v0.6). If staff see red, something is about to be deleted or removed. This applies even to reversible removals that offer Undo. No red for errors, alerts, branding in the UI, or status tags.

**After:**

> - **Red means gone for good — nothing else** (decided v0.5, confirmed v0.6; reworded v1.007). If staff see red, something is about to be lost for good: **Delete permanently** (which always asks first), and the action button of an "are you sure?" box that loses something for good (v1.008). **"Gone for good" means nothing to bring it back from later** (v1.007, D10b): the 5-second Undo is a safety net, not a way back, so the Calendar's and Schedule's Remove (an event, a closure, a time slot) stay red. **Removals that can be brought back later are not red:** Withdraw stays plain (Restore brings the person back). No red for errors, alerts, branding in the UI, or status tags.

### Lists and tables (the most-used component)

**After:**

> - **A person's ⋯ menu (decided v1.011 / v1.012):** three groups with a line between — about the person (Edit details first, then the section's own items, Change how they'll pay, Review possible duplicate), money (Edit payment, Undo payment, refunds, Print receipt), taking someone off (Withdraw or Cancel private testing, then Delete permanently, last and red). Items that don't apply are left out; the rest never move. No "Admin" heading: staff don't see what they can never do; what they can do but not right now is grayed with an "Ask an admin" reason.

### Metric cards

**Before:**

> - Clicking a card opens the filtered list behind it (e.g. a "18" count opens the list of those 18 records).

**After:**

> - **Every roster has the row of count cards (decided v1.013); tapping a card filters the list below it** (e.g. "18 Not paid" shows those 18). A money total ("Payments recorded") stays a total. Black Belt keeps its four plan cards in the same look; Finance's report cards jump to their group (a report, not a roster).

### Empty states

**Before:**

> - One line explaining the space + one action, e.g. "No classes scheduled today" + `＋ Add class`.
> - Exception: if there is genuinely no action available (e.g. the empty Home), the line appears alone — no dummy button.

**After:**

> - **One line explaining the space, and no button** (decided v1.028): the page header's add button stays the one way to add (rule 1.1), e.g. "No private testings yet. Add one when a family asks to test privately."
> - Staff who can't add see the line with "An admin adds them." and no button (v0.53).

### Toasts and errors

**After:**

> - **Problems never go in a toast (decided v1.004):** refusals and errors use the shared amber bar; a toast only says something was done. The reason a button is grayed is a gray line next to it.
> &nbsp;
> ### "Are you sure?" boxes (decided v1.008)
> - One shared box. The button that changes nothing says what stays — "Keep …" for a thing, "Stay …" for a place — and sits on the left; the action repeats the words pressed and sits on the right, red when it loses something for good, blue otherwise.
> - First focus on the button that changes nothing when the action loses something; otherwise on the action.
> - While it works, the pressed button grays and says what it is doing ("Deleting…") and the other button grays too. On a small phone the two buttons stack full width when they don't fit (2.1).

### 10. Open decisions

**Before:**

> 6. ~~Primary button color~~ — **Decided v0.5:** blue for primary actions; red reserved for delete/remove only (confirmed v0.6).

**After:**

> 6. ~~Primary button color~~ — **Decided v0.5:** blue for primary actions; red reserved for actions that lose something for good (confirmed v0.6; reworded v1.007).

## 2. The new rows (10b)

### v1.000 — Hide private details: Camps, Prospects and the staff side (decided v1.000; applies v0.249 / v0.506)

Design review item 2 (Jeffrey, 2026-10-22) and end-review details D2a / D2b (2026-10-24); pictures `docs/Design Review/Walkthrough/02-camps-hide-private-details.png`, `docs/Design Review/End review/d2a-prospects-hidden.png`, `docs/Design Review/End review/d2b-staff-emails.png`. v0.249's rule ("every screen, in every section, now and in future") applied where it was missing. (1) **Camps hides money** while Hide private details is on: no Paid column or "to collect" on the roster; "Hidden on this tablet" / "Payment details are hidden on this tablet." in the camper detail; attendance, check-in and the duplicate warning stay. (2) **Prospects:** the panel's **Email** button grays (the approved unavailable look, still focusable, as Star's Email result, v0.514) with one gray line "Email is off while private details are hidden. Email the family at the desk." (the top bar's icon); **every form answer reads "Hidden on this tablet"** — the questions and Show signature stay, as Star's View signature; **Call, Text and the phone stay**. (3) **What the switch hides is now:** a family's date of birth, email, every payment detail **and the answers to a form's own questions** (Forms' forms, shown in Prospects' Form answers and waiver — a form can ask a birthday or an email, and the dashboard can't tell which answers are private), on every screen; **phone numbers stay**; "email" means a family's. (4) **Staff accounts is desk-only while the switch is on:** the account menu's "Staff accounts" grays with one gray line "Off while private details are hidden." (like Star's desk-only New candidate, v0.507; a detail for Main's mockup: the page itself, if open or opened by its address, shows the same line instead of the list), so no staff email, new password or new PIN shows on a screen others can see; **your own email stays** in the account menu and on Set PIN. Owners: Camps; new students (Prospects); Main (Staff accounts). Rejected: D2a A (only the email), C (also the phone — Camps' parent and emergency phones would hide on the camp tablet too); D2b A (staff side unchanged), B (staff emails hidden — the reset boxes would lose the email that tells two accounts apart).

### v1.001 — One Mark paid box with "Paid by" (decided v1.001; changes v0.109, v0.136, v0.709, v0.715, v0.218, v0.226, v0.708)

Design review item 3 (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/03-taking-a-payment.png`). Option C: **the same small box everywhere** — Mark paid → the amount + **Paid by** Cash / Check / Card (preset to the family's choice, hint "They chose … on the form.") → **Mark paid $X**. Color Belt (one click today), Camps (tag → box) and Star (its dialog) use it; **Black Belt keeps its dialog** (its payment plans need "For") with the same words — "Paid by", not "Method". A different amount or date is fixed afterwards with Edit payment (admins). Main builds the box once (v1.030); full PC / tablet / phone mockups come before it is built. Owners: Color Belt, Camps, Star, Black Belt (its word).

### v1.002 — Print receipt in every section (decided v1.002; extends v0.220)

Design review item 3b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/03b-receipts.png`). Option B: **Black Belt's "Print receipt" (v0.220) in every section** — in the person's ⋯ menu and their detail → the same preview (school name, what was paid and how, total due, paid to date, balance, both schools' addresses, "Fees are non-refundable.") → Print or save as PDF. **Printed when a family asks**; taking a payment stays two taps. Main builds the receipt once (v1.030). Emailed receipts come later, once the dashboard can send email (as for Black Belt). Owners: Color Belt, Star, Camps.

### v1.003 — Fixing a payment: Edit payment and Undo payment together (decided v1.003; changes v0.508, v0.912)

Design review item 4 (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/04-fixing-a-payment.png`), with Color Belt's ⋯ menu as the model ("make universally like this picture with the confirmation as double security"). Everywhere: **Edit payment** and **Undo payment** sit together in the person's ⋯ menu (as Color Belt's: Edit details · Move to private testing — Edit payment · Undo payment — Withdraw · Delete permanently); **Undo payment always asks first** (double security) and names what comes off; **Edit payment always ends with "Payment changed" + Undo**. Black Belt (several payments per person): the row ⋯ "Undo payment" / "Edit payment" act on the **latest** payment and the confirmation names it (as Color Belt private testing); older payments stay on the payment line's ⋯ in the detail. Not changed: refunds (each approved) and Black Belt's required "Reason for the change". Owners: Color Belt and Camps (Undo asks first; Edit gets Undo), Star (Edit gets Undo), Black Belt (the latest payment on the row).

### v1.004 — Problems stay on screen (decided v1.004; changes v0.615; §3.5, §8)

Design review item 5 (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/05-errors-that-vanish.png`). Option B: **problems always stay on screen** — refusals and errors use the **shared amber bar until closed** (Retry when it can be retried, × to close); **the reason a button is grayed is a gray line next to it**; **toasts only say something was done**. Black Belt's refusal toasts move to the bar; Prospects' "That prospect no longer exists." toast (v0.615's build plan) moves to the bar. §3.5 and §8 "Toasts and errors" say this. Owners: Black Belt, new students (Prospects).

### v1.005 — One offline bar on every page (decided v1.005; changes v0.513, v0.718; §3.5)

Design review item 5b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/05b-wifi-drops.png`). Option B: **one offline bar for the whole dashboard** — amber, under the top bar, on every page **while the device is offline or after two failed refreshes in a row**; gone by itself when the connection is back. Words adapted from Star's approved offline message (v0.513); **Star grading keeps its grade-by-grade line**; **Camps' refresh bar folds into it** (v0.718); §3.5's "will sync" words change to match. Owner: Main (the shared bar).

### v1.006 — Undo for 5 seconds after every reversible change (decided v1.006; applies rule 1.4)

Design review item 6 (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/06-undo-after-a-change.png`). Option B: **rule 1.4 everywhere** — every change that can be reversed shows **Undo for 5 seconds**: Camps' saves, **Restore in every section**, Star's "Change how they'll pay", Prospects' panel status, Forms' Close / Open, Color Belt private testing's "Changes saved", and Black Belt's Edit details and cycle saves. **Finance's "Day reopened" stays as is** (closing the day again is its undo). Owners: Camps, Star, new students (Prospects, Forms), Color Belt, Black Belt.

### v1.007 — Red means gone for good: Withdraw plain, Delete permanently red and asks first; what "gone for good" means (decided v1.007; changes v0.904's menus; §7 reworded)

Design review item 7 (Jeffrey, 2026-10-22) and end-review detail D10b (2026-10-25); pictures `docs/Design Review/Walkthrough/07-removing-a-person.png`, `docs/Design Review/End review/d10b-red-remove.png`. Option C: **red means "gone for good"** — **Withdraw stays plain** in every roster (it happens at once with a 5-second Undo; Restore brings the person back); **in a roster only Delete permanently is red, and it asks first** (naming what goes). **Black Belt's "Remove candidate" and its choice box become the same two items** as the others, Withdraw · Delete permanently, in the row ⋯ and the candidate detail's ⋯; for a candidate with payment records (v0.904) or grades (v0.950) Delete permanently stays grayed with its approved reason as the gray line under it. §7's "even reversible removals" sentence is reworded. **What "gone for good" means (D10b):** nothing to bring it back from later — the 5-second Undo is a safety net, not a way back. So the Calendar's Remove (an event or a closure) and the Schedule's Remove (a time slot), which act at once with a 5-second Undo and then are gone, **stay red** (v0.233, v0.234); Withdraw stays plain because Restore brings the person back. Not changed: Color Belt private's "Cancel private testing" (blue, asks first, nothing deleted) and Prospects' "Delete prospect" (red, asks first); who may withdraw (Camps lets staff, v0.700; the others admins). Owner: Black Belt. Rejected: D10b B (plain, because they can be undone), C (red, and they ask first).

### v1.008 — "Are you sure?" boxes: one shared box (decided v1.008; changes v0.49, v0.66, v0.190, v0.192, v0.233, v0.246, v0.512, v0.911, v0.912, v0.928, v0.932, v0.955; §2.1 exception)

Design review item 8 (Jeffrey, 2026-10-22) and end-review details D1a–D1d and D10a (2026-10-23 to 2026-10-25); pictures `docs/Design Review/Walkthrough/08-are-you-sure-boxes.png`, `docs/Design Review/End review/d1a-busy-box.png`, `docs/Design Review/End review/d1b-narrow-buttons.png`, `docs/Design Review/End review/d1c-button-order.png`, `docs/Design Review/End review/d1d-safe-words.png`, `docs/Design Review/End review/d10a-bb-discard.png`. One rule for every "are you sure?" box (Main builds the box once, v1.030): (1) **The button that changes nothing says what stays** — "Keep …" for a thing (Keep payment, Keep student, Keep class, Keep prospect …; "Keep it" where there's no short name), "Stay …" for a place — and **the other button repeats the words pressed** ("Delete class", not "Delete"). The "Cancel" boxes change (Color Belt classes and ranks, Star categories, Schedule, Black Belt's cycle and Undo payment, Prospects, Forms, Calendar), and so do Star Results' "Undo Mark as sent", Black Belt's "Delete personal details now?", Undo refund and Undo returned mark; Color Belt's "Keep event / Keep student" and Camps' "Keep camp / template / camper" stay. **Asks that lose nothing say what stays too (D1d):** Forms' "Open kiosk mode on this device?" → **"Stay in the dashboard"**; "End kiosk mode on all tablets?" → **"Keep kiosk mode on"**; Prospects' two Came boxes ("Did … come to the free class?", "… 's free class is still ahead") → **"Keep in [the card's Board column]"** ("Keep in Booked"). "Cancel" is no longer a confirm-box button; it stays in form dialogs, where it throws away the typing. (2) **While it works (D1a):** the pressed button grays and says what it is doing — its verb + "ing…" ("Deleting…", "Undoing…", "Withdrawing…"), in the approved unavailable look — and "Keep …" grays too until it's done, so nothing can be pressed twice. (3) **Small phones (D1b):** when the two buttons don't fit on one line they stack, each the full width of the box, in the row's order (§2.1's exception). (4) **One order (D1c):** the button that changes nothing on the left, **focused first when the action loses something** (otherwise the action is focused, as the kiosk asks and "Came?"); the action on the right, **red when it loses something for good**, blue otherwise. **The three "… isn't saved" leave warnings swap** (Color Belt event and private grading, Star grading): "Stay on this page" left and focused, **"Leave anyway" right and red** (changes v0.192). **Black Belt's rubric editor box "Discard changes to 1st Dan?" follows the same rule (D10a):** Keep editing on the left and focused first, **Discard on the right and red** (changes v0.928 / v0.932, whose plain Discard came from the old §7). Black Belt's Dan-change box says "Keep [the current Dan]" ("Keep 1st Dan"), as Star's (changes v0.955). Owners: Main (the shared box); every section rewords its own boxes. Rejected: D1a A (no change while it works), C ("Keep …" stays pressable), D1b A (squeezed two-line labels), C (stacked on every phone), D1c A (the leave warnings reversed), C (same order without the red), D1d A ("Cancel" kept in the asks that lose nothing), C ("Go back"); D10a A (keep v0.932 as an exception), C (the same order without the red).

### v1.009 — Color Belt private testing rows open the summary (decided v1.009; changes v0.403)

Design review item 9a (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/09-opening-a-person.png`). Option B: tapping anywhere on a Color Belt **private testing** row opens **the same read-only summary as the event roster** — class, testing for, price, when it was added, paying by, and the payment with its date; **Close · Edit details**. Mark paid and the ⋯ stay on the row. Owner: Color Belt.

### v1.010 — The history line in every person's summary (decided v1.010; changes v0.112, v0.508, v0.900)

Design review item 9b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/09b-change-history.png`). Option B: every person's summary ends with Prospects' one line, **"History · N changes ›"**; a tap opens the list, newest first: what changed, then when · who. **With Hide private details on, amounts and paid status are left out** (as Star's history, v0.506). Color Belt (event and private testing), Camps and Black Belt gain it (Black Belt had left it out, v0.900); Star's five-row block becomes the same line (v0.112); Prospects keeps its own. Database work: only Star and Finance have functions that read `change_log` (RLS on, no grants), so Color Belt, Camps and Black Belt each need one, with a security review. Main builds the shared line (v1.030). Owners: Color Belt, Camps, Black Belt, Star.

### v1.011 — One ⋯ menu order; "Edit details" everywhere (decided v1.011; changes v0.110, v0.121, v0.403, v0.713, v0.900; §8)

Design review item 10a (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/10-menu-order.png`). Option B: **Color Belt's order in every person's ⋯ menu**, three groups with a line between: **(1) about the person** — Edit details first, then the section's own items (Move to / Set private testing, Change plan or Kukkiwon, Change day or time, Grade), Change how they'll pay, Review possible duplicate; **(2) money** — Edit payment, Undo payment, refunds, Print receipt; **(3) taking someone off** — Withdraw (or Cancel private testing), then Delete permanently, last and red. Items that don't apply are left out; the rest never move. **"Edit details" everywhere** (Star's "Edit candidate" renamed). Owners: Star, Camps, Black Belt; Color Belt private testing moves "Change how they'll pay" below its own items.

### v1.012 — Admin-only items in the ⋯ menu: no "Admin" heading (decided v1.012; changes v0.713; §8)

Design review item 10b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/10b-admin-only-items.png`). Option B: **no "Admin" heading in any ⋯ menu** — one rule: **staff don't see what they can never do**; what they can do but not right now is **grayed with an "Ask an admin" reason** line; **admins see the whole menu in v1.011's order**. Camps' heading goes. Not changed: the account menu's "Admin" group (pages, not actions; v0.70). Owner: Camps.

### v1.013 — Count cards on every roster; tapping a card filters (decided v1.013; changes v0.402; §8)

Design review item 11 (Jeffrey, 2026-10-22: "have cards as universal"; picture `docs/Design Review/Walkthrough/11-count-cards.png`). **Every roster has the row of count cards, and tapping a card filters the list** (§8 Metric cards): Color Belt private testing's cards filter like the event's (changes v0.402); Camps' summary line becomes cards (v1.014); "Payments recorded" stays a total everywhere. Black Belt keeps its four plan cards in the same look and tap behaviour (its plans need them); Finance's Daily report keeps its cards jumping to their group (a report, not a roster). Main builds the cards once (v1.030). Owners: Color Belt (private testing), Camps.

### v1.014 — Camps' four count cards (decided v1.014; changes v0.715)

Design review item 11b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/11b-camps-cards.png`). Option B: Camps gets **its own four cards in the same look: Campers · Coming (that day) · To collect · Payments recorded**; tapping **Coming** or **To collect** filters the roster (Campers shows everyone; Payments recorded stays a total). Its summary line goes; the "Updated …" time stays. **Confirmed:** Black Belt keeps its four plan cards (Paid in full · Paying on schedule · Late · Not paid); Finance's report cards stay as they are. Owner: Camps.

### v1.015 — One Registration link button and box (decided v1.015; changes v0.90, v0.99, v0.134, v0.232, v0.900)

Design review item 12a (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/12-registration-link.png`). Option B: one **"Registration link" button with its words on every screen, in the page header** (Black Belt moves it out of ⋯; Camps keeps its blue, its phone button gets words). One **box**: **Copy link and Download QR code everywhere** (Color Belt and Star gain Download QR code); **Print flyer where it is today** (Color Belt, Star; Forms' Print a sign); Camps and Black Belt stay without a flyer. Forms keeps "Share" (it also holds kiosk mode). Main builds the box once (v1.030). Owners: Color Belt, Star, Black Belt, Camps.

### v1.016 — Close / Open: one verb pair, no icons (decided v1.016; changes v0.700, v0.900, v0.235; follows v0.85)

Design review item 12b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/12b-close-open.png`). Option B: one verb pair, each section's own noun, **no icons**: **Close registration / Open registration** (Color Belt, Star, Black Belt), **Close sign-up / Open sign-up** (Camps — "Reopen" goes), **Close form / Open form** (Forms — "Open form again" goes). Black Belt's lock icons and Forms' door icons go. Owners: Black Belt, Camps, new students (Forms).

### v1.017 — Family pages: the same words do the same jobs (decided v1.017; changes v0.235)

Design review item 13 (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/13-family-pages.png`). Option B: each family page keeps its shape (Forms stays three short steps; the others keep their check page), and **the same words do the same jobs**: **Continue** to go on, **Back** to go back, and the last button says what it does — "Send registration" (testing), "Sign up" (Camps), **"Send" (Forms, instead of "Submit")**; Forms' "Next" becomes **"Continue"**. Done pages keep their own words (v0.604's thank-you heading stays). Owner: new students (Forms).

### v1.018 — Star's date picker for every date (decided v1.018; changes v0.502, v0.147, v0.207, v0.245, v0.911)

Design review item 14a (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/14-dates.png`). Option B: **Star's date picker (v0.502) for every date staff or families pick** — Color Belt (instead of the browser's date fields, v0.147), Black Belt (its own planned switch, v0.911), Camps' sign-up dates, Prospects, Schedule, Calendar, Forms (including date questions on its family page), Finance's day box, and the family pages' date of birth. **Camps' camp-days calendar stays** (it picks several days at once). Owners: every section with a date box.

### v1.019 — One time list (decided v1.019; changes v0.157, v0.92, v0.173, v0.207, v0.233, v0.600, v0.713, v0.900)

Design review item 14b (Jeffrey, 2026-10-22; picture `docs/Design Review/Walkthrough/14b-times.png`). Option B: **one time list everywhere** — Star's list, in **5-minute steps**, **AM/PM on every time**, **opening at the chosen time**; **Schedule and Calendar drop the browser's time box**; the range fits the job: **6:00 AM–10:00 PM** for classes, testing and camps; **Finance's reminder keeps 11 AM–11 PM and Off**. Main builds the list once (v1.030). Owners: every section with a time.

### v1.020 — The back link everywhere (decided v1.020; applies v0.59; changes v0.235, v0.197)

Design review item 15a (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/15-back-links.png`). Option B: **the v0.59 back-link rule everywhere** — "← [place]" as a text link above the page title. **Forms' builder gets "← Forms"** above its title (its bare arrow goes); **Finance's History gets "← Back to the day"** above its heading (its outline button goes). Owners: new students (Forms), Finance.

### v1.021 — The staff line: one pattern in two forms (decided v1.021; changes v0.234, v0.235; follows v0.40)

Design review item 15b (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/15b-view-only.png`). Option B: one gray line, full stops and a capital "Ask", in two forms: **"View only. Ask an admin to [what only admins do]."** where staff can only look (as Classes and ranks, v0.40); **"[what staff can do]. Ask an admin to [the rest]."** where they can do part of the page. **Calendar** becomes "View only. Ask an admin to make changes."; **Forms** becomes "Staff can fill in and share forms. Ask an admin to create or change forms." Only Calendar's and Forms' lines change. Owner: new students (Calendar, Forms).

### v1.022 — "Both" in the top bar (decided v1.022; changes v0.35's blank page in v0.34's row, v0.36, v0.155, v0.198)

Design review item 15c (Jeffrey, 2026-10-23) and end-review detail D3 (2026-10-24); pictures `docs/Design Review/Walkthrough/15c-both-schools.png`, `docs/Design Review/End review/d3-both-refunds.png`. Option B: on **Both**, Color Belt shows **Finance's boxes** (the v0.198 pattern) instead of the blank "Choose a school" page (v0.35): **one box per school** with its **upcoming testing** and **"Open Worcester" / "Open Shrewsbury"** (they switch the whole dashboard to that school; picking Both again goes back). **Nothing can be changed on Both**, so v0.34's separation stays; with Worcester or Shrewsbury picked, Color Belt stays as today. **One wording everywhere: "Both schools"** — Home's date line, Schedule's page line and Camps' page line change. **D3:** on Both, Finance's box for a school with refunds says **"after $X refunds"** next to its total — the Total card's words (v0.209): "$675.00 8 payments · after $445.00 refunds" — and "Both schools together" says it too; worked out from the box's own numbers (cash + check + card − total), so no database change; a box with no refunds stays as it is. For Color Belt's mockups (D5): private testings in the boxes, the words when a school has none, the phone layout. Owners: Color Belt (the boxes), new students (Schedule's line), Camps (its line), Main (Home's line), Finance (D3). Rejected: D3 A (no note), C (a refunds part in the line).

### v1.023 — Where settings live (decided v1.023; changes v0.36, v0.38, v0.40, v0.50, v0.135, v0.233, and v0.902 / v0.921 / v0.937's tab name)

Design review item 15d (Jeffrey, 2026-10-23) and end-review detail D4 (2026-10-24); pictures `docs/Design Review/Walkthrough/15d-settings.png`, `docs/Design Review/End review/d4-bb-tab-name.png`. Option B: **one rule** — things several sections use live in **Settings** (account menu → Admin): **Schools** and **Classes and ranks**; things one section uses **stay in that section**, as **a tab named for what's in it**, or the **page's ⋯** where a page has no tabs (Prospects' Edit statuses and Calendar's Event types stay). **Classes and ranks move to Settings** (Jeffrey's 2026-10-17 plan; changes v0.38, v0.40, v0.50); **Color Belt keeps its testing prices, sparring gear and final award in a "Prices" tab** (its name to be settled in the mockups, D6). **D4:** Black Belt's "Rubric and prices" tab becomes **"Rubric and waiver"** (its prices moved to each cycle, v0.902); its first line keeps "Prices are set on each cycle." Open for the mockups (D6): a staff view of Classes and ranks (Settings is admins only), the Schedule's and Forms' hints linking to Settings → Classes and ranks, per-school classes on a page that ignores the top bar. Owners: Main + Color Belt (the move), new students (the hints), Black Belt (the tab name). Rejected: D4 A (keep "Rubric and prices"), C ("Rubric, waiver and emails").

### v1.024 — One icon per meaning (decided v1.024; changes v0.181, v0.190, v0.207, v0.229, v0.715, v0.914; §2.4)

Design review item 16a (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/16a-one-icon.png`). Option B, written into the §2.4 map: **Not paid `ti-circle-x`** (Color Belt events and private testing and Star change from the clock; Camps' To collect card takes it; the map rows v0.229 / v0.914 become one — the clock then means only time); **Change how they'll pay `ti-switch-horizontal`** (Color Belt gets it; Star changes from `ti-repeat`, which then means only Make-up); **Restore `ti-arrow-back-up`** (Color Belt events and Camps get it — Restore undoes Withdraw); **Came `ti-user-check`** and **Didn't come `ti-user-x`** (Camps' day grid and Color Belt's No show result change, v0.181); **Edit `ti-edit`** (Forms' pencil goes); **Go to today: no icon** (Finance, like the Calendar's Today button); **✓ `ti-check` = "yes / done" and ✗ `ti-x` = "no / close"**, written as two broad meanings (nothing changes on screen). Black Belt, Prospects and Calendar already match. Owners: Color Belt, Star, Camps, new students (Forms), Finance.

### v1.025 — Icon housekeeping: tooltips, Forms' Sent tick, 8 map rows (decided v1.025; §2.4; applies §1.4)

Design review item 16b (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/16b-icon-housekeeping.png`). Option B: (1) the **13 icon-only buttons** in Calendar, Schedule, Prospects and Forms become the shared `IconButton` (28px, 16px icon, a tooltip with the same words as its label, rule 1.4); **Calendar's previous / next arrows take Finance's bordered look** (`.fin-ibtn`); the dialogs' phone Back arrows stay. (2) **Forms' Sent screen** uses the family thank-you page's tick (24px `ti-check` in the pale-green circle; its 40px tick was over §2.2's 24px limit). (3) **The 8 missing map rows are written** (§2.4): Go to / move to `ti-arrow-right` (v0.403, v0.246) · Swipe or scroll sideways `ti-arrows-horizontal` (v0.246) · Split a bracket `ti-arrows-split-2` (v0.921) · Cancel a private testing `ti-calendar-x` (v0.403) · Hide private details `ti-currency-dollar-off` (v0.215) · Grading note `ti-note` (v0.185, v0.190) · Make-up `ti-repeat` (v0.121) · Take a photo of this screen `ti-camera` (Forms' kiosk thank-you; never decided, kept). Owner: new students (the buttons, the Sent tick).

### v1.026 — How money and names are written; one money helper (decided v1.026)

Design review item 17a (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/17a-money-names.png`). Option B: **today's practice is the rule** — on screens money is written **"$65"**, with cents only when there are some ("$290.50"); **Finance's report, print and export always show cents ("$65.00")**. **One shared money helper** replaces the five (so Star's "$32.5" can't happen). **Names stay as they are**: testing rosters by belt, then last name; Camps by first name; Prospects and Calendar "Ava R.". Owners: Main (the helper, v1.030), then every section.

### v1.027 — The unsaved-changes guard everywhere (decided v1.027; finishes v0.56's alignment)

Design review item 17b (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/17b-unsaved-changes.png`). Option B: **the guard holds everywhere** (§6, v0.46: with typed changes, Esc, a click outside or Back keep the dialog open with "Unsaved changes. Save or cancel first."; phones add "Discard changes", v0.56): Forms' **Fill in** and **New form** keep their note until Send / Save or Cancel (a second Esc does nothing); **Camps' Save as template** and **Prospects' Edit statuses** get the shared note; **Change PIN / Change password join the rule — Jeffrey's OK for v0.56's alignment.** Recorded exceptions: Finance's Close the day keeps a draft (v0.800); Black Belt's rubric editor (v0.928); one-click dialogs with nothing typed. Detail for Forms: Fill in's note goes under its buttons (v0.81). Owners: new students (Forms, Prospects), Camps, Main (account dialogs).

### v1.028 — Empty lists: one line; the header button is the one way to add (decided v1.028; changes v0.403; §1.1, §8)

Design review item 17c (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/17c-empty-lists.png`). Option B: **an empty list shows one line; the page header's button stays the one way to add** (staff who can't add see "… An admin adds them." and no button, as v0.53). §8 Empty states and §1.1 are reworded. **Color Belt's Private testing drops its second "Add private testing" button** (its box becomes the same line as every other list; changes v0.403). Owner: Color Belt.

### v1.029 — One results pattern for the testing sections (decided v1.029; settles v0.189; changes v0.181's words)

Design review item 18 (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/18-results.png`). Option B: Color Belt gets **Star's Print results** (who passed to which belt, a page per class; v0.143) and an **admin-only Download CSV** (copied from Star's, v0.144), next to its class switch; its result button says **"Passed"** ("Not passed" and "No show" stay; changes v0.181's "Pass"). Results stay inside Color Belt's Grading tab (no Results tab). **Email result only where the form collects an email** (Star; Black Belt's planned Results tab already fits). This settles v0.189's deferred "Print results". The CSV is likely a database function, as Star's (security review). Owner: Color Belt.

### v1.030 — Shared parts live in one place and are built first (decided v1.030)

Design review item 19 (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/19-shared-parts.png`). Option B: **Main builds the shared parts first** in `src/components/` (helpers in `src/lib/`): the Compare + possible-duplicate box, the confirm box (v1.008), the Mark paid box (v1.001), the registration link box (v1.015), the count cards (v1.013, v1.014), the history line (v1.010), the receipt (v1.002), the time list (v1.019), the money helper (v1.026), the misplaced helpers (`useLiveLoad`, `ChoiceGroup`, `DeleteDialog`, `usePaymentsHidden`), shared words and shared styles; **then each section's prompt says "use the shared part"** (Black Belt drops its copies, Calendar its menu copy). Nothing on screen changes in Main's step; the section prompts wait for it — except Finance's Black Belt payments, which go first (v1.034). Owner: Main first, then every section.

### v1.031 — The top-bar people search (decided v1.031; §3.2)

Design review item 20a (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/20a-search.png`). Option B: **Main builds a people search in the top bar** ("Search people", every page) **across every section** (Color Belt, Star, Black Belt, Camps, Prospects); **results grouped by section, showing name, event and school only** (nothing private; Prospects keep "Ava R."); **a tap opens the person** (their summary, v1.009 / v1.010); **the in-list search boxes stay**. Built after the design review's fixes; the "/" shortcut (§3.6) then works. Needs a design and a security review (one search across every section's people, RLS, nothing private in results). The shortcuts on / off switch stays planned. Owner: Main.

### v1.032 — Check-ins need the connection (decided v1.032; drops §3.5's queue line; as v0.188)

Design review item 20b (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/20b-offline-checkins.png`). Option B: **check-ins need the connection** — §3.5's "Check-ins made offline are queued…" line is dropped; a Wi-Fi drop is covered by **the offline bar (v1.005)**, **the failed tap's Retry** (and "Not saved" tag) and **Print roster** as the paper backup — the same choice as v0.188 for grading. Prospects' and Calendar's "Came?" follow the same rule. No new build.

### v1.033 — Accessibility target: WCAG 2.2 AA (decided v1.033; §4)

Design review item 20c (Jeffrey, 2026-10-23; picture `docs/Design Review/Walkthrough/20c-wcag.png`). Option B: **the target becomes WCAG 2.2 AA** (§4); **the six checks 2.2 added go into §4 in plain words** — target size 24 px · no dragging needed · focus never hidden · sign in without a memory test · don't ask twice · help in the same place; **phases 3–5 of the design review test them** (to check: focus behind pinned bars and the offline bar, the touch-screen PIN, the public pages' contact line, small tag buttons).

### v1.034 — Black Belt payments reach the Daily report before Black Belt's form opens (decided v1.034; follows v0.808 / v0.809)

End-review detail D7 (Jeffrey, 2026-10-24; picture `docs/Design Review/End review/d7-bb-payments.png`). v0.808 adds Black Belt payments to the Daily report and Close the day "when Black Belt payments exist"; they exist since Black Belt's Record payment went live (2026-10-21), and in the preview a recorded Black Belt payment is missing from that day's report. Option A: **Finance's Black Belt step (v0.808; returned checks v0.809; its own migration) is built next — it doesn't wait for Main's shared parts (v1.030) — and goes live before Black Belt's family form is switched on (Black Belt's CP6)**; **nothing on screen meanwhile**, and no Black Belt payment is recorded in the dashboard until then (they are taken the old way). To be written into both sessions' plans and Black Belt's CP6 checklist, through their prompts. Rejected: B (temporary amber notes in Record payment and on the Daily report), C (Record payment grayed until Finance's step is live).

## 3. Changelog lines (end of §11)

| Version | Date | Change |
|---|---|---|
| 1.000 | 2026-10-24 | Hide private details: Camps hides money; Prospects grays Email and hides form answers, phones stay; form answers join what the switch hides; Staff accounts is desk-only while it is on (design review item 2, D2a, D2b) (10b). |
| 1.001 | 2026-10-22 | One Mark paid box with "Paid by" in Color Belt, Camps and Star; Black Belt keeps its dialog with the same words (design review item 3) (10b). |
| 1.002 | 2026-10-22 | Black Belt's Print receipt in every section, printed when a family asks (design review item 3b) (10b). |
| 1.003 | 2026-10-22 | Fixing a payment: Edit payment and Undo payment together; Undo asks first; Edit ends with Undo; Black Belt's row acts on the latest payment (design review item 4) (10b). |
| 1.004 | 2026-10-22 | Problems stay on screen in the amber bar; a grayed button gets a gray reason line; toasts only say something was done (design review item 5; §3.5, §8) (10b). |
| 1.005 | 2026-10-22 | One offline bar on every page, gone by itself when the connection is back (design review item 5b; §3.5) (10b). |
| 1.006 | 2026-10-22 | Undo for 5 seconds after every reversible change, as rule 1.4; Finance's Day reopened stays (design review item 6) (10b). |
| 1.007 | 2026-10-25 | Red means gone for good — nothing to bring it back from later: Withdraw plain everywhere; in a roster only Delete permanently is red and asks first; Black Belt gets the same two items; the Calendar's and Schedule's Remove stay red (design review item 7, D10b; §7 reworded) (10b). |
| 1.008 | 2026-10-25 | "Are you sure?" boxes: the safe button says what stays ("Keep …" / "Stay …"), the action repeats the pressed words; busy look; stacking on small phones; one button order; the leave warnings and Black Belt's Discard box swap (design review item 8, D1a–D1d, D10a; §2.1 exception, §8) (10b). |
| 1.009 | 2026-10-22 | Color Belt private testing rows open the same summary as the event roster (design review item 9a) (10b). |
| 1.010 | 2026-10-22 | Every person's summary ends with "History · N changes ›"; amounts and paid status left out while private details are hidden (design review item 9b) (10b). |
| 1.011 | 2026-10-22 | One ⋯ menu order in every section (about the person, money, taking someone off); "Edit details" everywhere (design review item 10a; §8) (10b). |
| 1.012 | 2026-10-22 | No "Admin" heading in ⋯ menus: staff don't see what they can never do; what they can't do right now is grayed with an "Ask an admin" reason (design review item 10b; §8) (10b). |
| 1.013 | 2026-10-22 | Count cards on every roster; tapping a card filters the list (design review item 11; §8) (10b). |
| 1.014 | 2026-10-22 | Camps' four cards: Campers · Coming · To collect · Payments recorded; Black Belt's plan cards and Finance's report cards confirmed (design review item 11b) (10b). |
| 1.015 | 2026-10-22 | One Registration link button in the page header and one box: Copy link and Download QR code everywhere, Print flyer where it is today (design review item 12a) (10b). |
| 1.016 | 2026-10-22 | Close / Open: one verb pair with each section's noun, no icons (design review item 12b) (10b). |
| 1.017 | 2026-10-22 | Family pages: Continue, Back, and a last button that says what it does; Forms says Continue and Send (design review item 13) (10b). |
| 1.018 | 2026-10-22 | Star's date picker for every date staff or families pick; Camps' camp-days calendar stays (design review item 14a) (10b). |
| 1.019 | 2026-10-22 | One time list: 5-minute steps, AM/PM, opens at the chosen time; Schedule and Calendar drop the browser box (design review item 14b) (10b). |
| 1.020 | 2026-10-23 | The v0.59 back link everywhere: Forms' builder "← Forms", Finance's History "← Back to the day" (design review item 15a) (10b). |
| 1.021 | 2026-10-23 | The staff line in two forms: "View only. Ask an admin to …" / "[what staff can do]. Ask an admin to …" (design review item 15b) (10b). |
| 1.022 | 2026-10-24 | Both: Color Belt shows one box per school; "Both schools" everywhere; Finance's Both boxes say "after $X refunds" (design review item 15c, D3) (10b). |
| 1.023 | 2026-10-24 | Where settings live: shared things in Settings (Schools, Classes and ranks), one section's things in a tab named for what's in it; Color Belt's Prices tab; Black Belt's "Rubric and waiver" (design review item 15d, D4) (10b). |
| 1.024 | 2026-10-23 | One icon per meaning: Not paid ti-circle-x, Change how they'll pay ti-switch-horizontal, Restore ti-arrow-back-up, Came / Didn't come, Edit, Today without an icon, ✓ / ✗ as two broad meanings (design review item 16a; §2.4) (10b). |
| 1.025 | 2026-10-23 | Icon housekeeping: 13 icon-only buttons get the shared button with a tooltip; Forms' Sent tick; 8 missing icon-map rows written (design review item 16b; §2.4) (10b). |
| 1.026 | 2026-10-23 | Money on screens "$65" (cents only when there are some), Finance's report "$65.00"; one money helper; names as today (design review item 17a) (10b). |
| 1.027 | 2026-10-23 | The unsaved-changes guard everywhere; Change PIN / Change password join it (v0.56's alignment) (design review item 17b) (10b). |
| 1.028 | 2026-10-23 | Empty lists show one line; the page header's button is the one way to add (design review item 17c; §1.1, §8) (10b). |
| 1.029 | 2026-10-23 | One results pattern: Color Belt gets Star's Print results and an admin CSV, its button says Passed; Email result only where the form collects an email (design review item 18; settles v0.189) (10b). |
| 1.030 | 2026-10-23 | Shared parts live in one place and Main builds them first; then each section uses them (design review item 19) (10b). |
| 1.031 | 2026-10-23 | The top-bar people search across every section; name, event and school only (design review item 20a; §3.2) (10b). |
| 1.032 | 2026-10-23 | Check-ins need the connection; §3.5's offline queue line dropped (design review item 20b) (10b). |
| 1.033 | 2026-10-23 | Accessibility target WCAG 2.2 AA, with its six added checks in plain words (design review item 20c; §4) (10b). |
| 1.034 | 2026-10-24 | Black Belt payments reach the Daily report before Black Belt's form opens: Finance's step first, nothing on screen meanwhile (design review D7) (10b). |

## 4. Notes added to older rows

| Older row | Note added at its start |
|---|---|
| Testing and locations (decided v0.34) | See v1.022: on Both, Color Belt shows one box per school instead of the blank page; the separation stays. |
| Classes, ranks and prices (decided v0.36) | See v1.023: Classes and ranks move to Settings — how a page that ignores the top bar shows each school's list is settled in the mockups (D6 |
| Testing section layout (decided v0.38) | See v1.023: Classes and ranks move to Settings; Color Belt keeps a Prices tab. |
| Testing roles: Classes and ranks (decided v0.40) | See v1.023: Classes and ranks move to Settings. |
| Phase 1 design approved (v0.49) | See v1.008: confirm boxes say "Keep …" instead of "Cancel" and repeat the pressed words. |
| Testing tabs before phase 2 (decided v0.50) | See v1.023: Classes and ranks move to Settings. |
| Phone: discarding unsaved changes (decided v0.56) | See v1.027: done — Change PIN and Change password join the guard. |
| Testing chooser (decided v0.59) | See v1.020: this back link everywhere, including Forms' builder and Finance's History. |
| Star testing phase 1 design approved (v0.66) | See v1.008: confirm boxes say "Keep …" instead of "Cancel" and repeat the pressed words. |
| Star testing: registration open / closed (decided v0.85) | See v1.016: the same Close / Open verb pair, without icons, in every section. |
| Star testing: registration link and QR code (decided v0.90) | See v1.015: one Registration link button and box everywhere — Copy link and Download QR code. |
| Star testing Events tab design approved (v0.92) | See v1.019: Start time uses the shared time list — 5-minute steps, 6:00 AM–10:00 PM. |
| Star testing: two school links shown to staff + form top (decided v0.99) | See v1.015: the box gains Download QR code for each school's link. |
| Star testing Candidates: recording payments (decided v0.109, from Jeffrey's requests) | See v1.001: Record payment becomes the shared Mark paid box with "Paid by". |
| Star testing roles: Candidates tab (decided v0.110) | See v1.011: "Edit candidate" is renamed "Edit details". |
| Star testing Candidates: detail view and editing (decided v0.112) | See v1.010: the History block becomes the one line "History · N changes ›". |
| Star testing Candidates mockups approved (decided v0.121) | See v1.011: one ⋯ order in every section; "Edit details" everywhere. |
| Color Belt phase 2 mockups approved (v0.134) | See v1.015: the Registration link box gains Download QR code. |
| Settings → Schools (decided v0.135) | See v1.023: Classes and ranks become a second part of Settings. |
| Color Belt phase 2: build plan answers (decided v0.136; changes v0.36) | See v1.001: Mark paid opens the shared small box — the amount + Paid by — instead of recording in one click. |
| Color Belt phase 2: build walkthrough (CP1) approvals (decided v0.147) | See v1.018: Star's date picker replaces the browser's date fields. |
| Star testing Home mockups approved (decided v0.155) | See v1.022: Home's date line says "Both schools". |
| Color Belt: live roster updates and class time steps (decided v0.157) | See v1.019: one shared time list everywhere (these 5-minute steps, AM/PM |
| Star testing database: the contract's 23 open items (decided v0.173) | See v1.019: private-day times use the shared list — 5-minute steps, 6:00 AM–10:00 PM. |
| Color Belt phase 3: the results (decided v0.181) | See v1.029: the button says "Passed"; v1.024: No show uses `ti-user-x`. |
| Color Belt phase 3: printed grading sheet (decided v0.189) | See v1.029: Print results and an admin-only CSV, as Star's. |
| Color Belt phase 3 mockups approved (v0.190) | See v1.024: No show uses `ti-user-x`, and ✓ / ✗ are now the map's yes / no meanings, so no exception is needed; v1.029: the button says "Passed"; v1.008: the mockup G8's "Cancel" is "Keep student", as built. |
| Color Belt phase 3: build contract answers (decided v0.192; changes v0.188) | See v1.008: "Stay on this page" left and focused, "Leave anyway" right and red. |
| Mat-side tablet: whole dashboard, private details hidden (decided v0.249) | See v1.000: applied to Camps and Prospects; form answers join the list; phone numbers stay; staff emails aren't covered — Staff accounts is desk-only while the switch is on. |
| Color Belt phase 4: who sets it, and the money (decided v0.226) | See v1.001: Mark paid opens the shared small box with "Paid by". |
| Camps section added (decided v0.229) | See v1.024: Not paid is `ti-circle-x` everywhere; the clock means only time. |
| Camps: sign-up only online (decided v0.232; changes the Q4 answer) | See v1.015: the shared Registration link box; Camps keeps its blue button and no flyer. |
| Camps: paying (decided v0.709) | See v1.001: the shared Mark paid box with "Paid by". |
| Camps mockups approved (v0.713) | See v1.011 menu order, v1.012 no "Admin" heading, v1.019 the shared time list. |
| New students and Schedule (decided v0.233) | See v1.008: the Schedule's confirm boxes say "Keep …" and repeat the pressed words; v1.019: the shared time list replaces the browser's time box; v1.023: Classes and ranks move to Settings. |
| Calendar (decided v0.234) | See v1.021 the staff line, v1.018 / v1.019 the shared date picker and time list, v1.025 the icon buttons. |
| Forms (decided v0.235) | See v1.016 Close form / Open form without door icons, v1.017 Continue and Send, v1.020 "← Forms", v1.021 the staff line, v1.025 the Sent tick and icon buttons. |
| Prospects: differences from the mockup after P3 (decided v0.245) | See v1.018: the follow-up's date field becomes Star's date picker. |
| Prospects: Board view, dragging and the progress track (decided v0.246) | See v1.008: in the Came boxes this button says "Keep in [the card's column]", e.g. "Keep in Booked". |
| Dashboard calendar built in Star phase 2 (decided v0.502) | See v1.018: this date picker is used for every date staff or families pick. |
| Color Belt phase 4: the separate Private testing tab — how it works (decided v0.402; follows v0.401) | See v1.013: the count cards filter the list, like the event's. |
| Color Belt phase 4 separate-tab mockups approved (v0.403; replaces v0.228) | See v1.009: tapping a row opens the summary; v1.028: the empty tab shows one line, no second Add button; v1.011: "Change how they'll pay" moves below its own items. |
| Camps build plan answers (decided v0.700) | See v1.016: "Reopen sign-up" becomes "Open sign-up". |
| Daily report: moving between days + History (decided v0.197) | See v1.020: "← Back to the day" is a text link above the heading. |
| Daily report on Both (decided v0.198) | See v1.022: a box with refunds says "after $X refunds" next to its total; "Both schools together" too. |
| Daily report mockups approved (v0.207) | See v1.018: Star's date picker for the export dates; v1.019: Settings times use the shared list in 5-minute steps, 11 AM–11 PM and Off kept; v1.024: `ti-check` means yes / done. |
| One switch: "Hide private details" (decided v0.506; changes v0.215 and v0.249–v0.253) | See v1.000: applied to Camps and Prospects; form answers join the list; phone numbers stay; Staff accounts is desk-only while the switch is on. |
| Star phase 3 gap mockups approved (decided v0.508) | See v1.003: Edit payment and Undo payment sit together; Undo payment asks first; Edit payment ends with Undo; v1.010: the History block becomes the one line "History · N changes ›". |
| Camps: a camp payment's school is this device's school (decided v0.708; changes v0.707 part 1) | See v1.001: Mark paid opens the shared small box — the amount + Paid by; the school still comes from This device. |
| Schedule: new time slots start on PM (decided v0.600) | See v1.019: the browser's time box is replaced by the shared time list. |
| Black Belt money in the Daily report (decided v0.808) | See v1.034: Finance's Black Belt step is built next and is live before Black Belt's form is switched on. |
| Daily report: bounced (returned) checks (decided v0.809) | See v1.034: built with Finance's Black Belt step, before Black Belt's form is switched on. |
| Star Grading, private grading and the printed sheet: gap mockups approved (decided v0.512) | See v1.008: the leave question's buttons swap — "Stay on this page" left and focused, "Leave anyway" right and red. |
| Black Belt testing: post-dated checks (decided v0.218) | See v1.001: the dialog says "Paid by", not "Method". |
| Black Belt testing: receipts (decided v0.220) | See v1.002: Print receipt in every section. |
| Black Belt testing: cycles, family form and Candidates/payments mockups approved (decided v0.900) | See v1.010 history line, v1.011 menu order, v1.015 Registration link in the page header, v1.016 Close / Open registration without lock icons, v1.019 the shared time list. |
| Black Belt testing: a cycle's prices are set when it is saved (decided v0.902; changes v0.217 and v0.900) | See v1.023: the tab becomes "Rubric and waiver". |
| Black Belt testing database: payment records are never deleted (decided v0.904) | See v1.007: Black Belt's menus show Withdraw · Delete permanently, Delete grayed with this reason as the gray line under it. |
| Black Belt testing CP2 for B1, and the temporary way in (decided v0.911) | See v1.018: Star's date picker replaces the browser date fields; v1.008: Delete cycle's "Cancel" becomes "Keep …". |
| Black Belt testing: Undo payment asks first (decided v0.912; changes Candidates 5) | See v1.003: the row ⋯ Undo payment / Edit payment act on the latest payment; v1.008: "Cancel" becomes "Keep payment". |
| Black Belt testing: payment icons (decided v0.914; changes the Candidates mockups) | See v1.024: Not paid `ti-circle-x` everywhere; v1.007: "Remove candidate" becomes Withdraw · Delete permanently. |
| Camps: the camp page is one roster (decided v0.715; changes v0.704) | See v1.014: the summary line becomes four count cards; the "Updated …" time stays; v1.001: the shared Mark paid box with "Paid by"; v1.024: the day grid uses `ti-user-check` / `ti-user-x`. |
| Star Grading, private grading and the printed sheet: built and approved in preview (decided v0.513) | See v1.005: one offline bar on every page, its words adapted from Star's; grading keeps its grade-by-grade line. |
| Camps: roster fixes from the live test (decided v0.718; changes v0.715) | See v1.005: the refresh bar folds into the one offline bar. |
| Calendar follow-ups + Show menu: build plan answers (decided v0.615; changes v0.612, v0.244 / v0.611 wording) | See v1.004: "That prospect no longer exists" shows in the amber bar, not a toast. |
| Black Belt testing: an editable rubric now, and where a change applies (decided v0.921; changes v0.901) | See v1.023: the tab becomes "Rubric and waiver". |
| Black Belt testing rubric editor: leaving with unsaved changes (decided v0.928) | See v1.008: on PC and tablet the box puts Keep editing on the left, focused first, and Discard on the right in red (D10a |
| Black Belt testing rubric editor: the Discard button (decided v0.932) | See v1.008: Discard is red, on the right; Keep editing on the left and focused first (D10a |
| Black Belt testing: rail menu item, "Next:" line and its own address — C2 (decided v0.937; finishes v0.516's "not yet" list) | See v1.023: the Rubric and prices tab becomes "Rubric and waiver". |
| Black Belt grading database Q-G3: grades block deleting; withdraw instead (decided v0.950; extends v0.904) | See v1.007: Delete permanently stays grayed with this reason as the gray line under it. |
| Black Belt: the Dan-change dialog approved (decided v0.955; draws v0.951) | See v1.008: "Cancel" becomes "Keep 1st Dan" (the current Dan |

