# Phase 1 inventory — Prospects, Forms + kiosk, Schedule, Calendar (owner: new students session)
Scope: main at 1c42e8b, 2026-10-21. Written by the new-students inventory agent; checked afterwards by a separate checker agent.

All paths are relative to the repo root (`C:\Users\jberg\projects\tkd-dashboard\.claude\worktrees\zen-allen-e41a06\`).

**Mockup keys** (all in `docs/Prospects/`):
- **P#** = `TKD-Prospects-Mockups.html` screen #
- **F#** = `TKD-Forms-Mockups.html`
- **S#** = `TKD-Class-Schedule-Mockups.html`
- **C#** = `TKD-Calendar-Mockups.html`

**nf** = not found in the docs. No doc in this area says what paper or old process these screens replace. Rulebook v0.233 only says the dashboard "starts handling new students (prospects) only".

## Part A — Screens, dialogs, menus and public pages

| # | Name (as staff see it) | Kind | File(s) | How you get there | Who | Rulebook | Mockup | Paper |
|---|---|---|---|---|---|---|---|---|
| 1 | Prospects (List) | screen | src/screens/Prospects.jsx, src/screens/prospects/ProspectList.jsx | rail / phone bar "Prospects" (#prospects) | staff+admin | 0.236, 0.244, 0.245, 0.246, 0.247, 0.610, 0.611 | P1, P2, P9, P11 | nf |
| 2 | Board | screen view | src/screens/prospects/Board.jsx, useCardDrag.js | List/Board switch | staff+admin | 0.246, 0.247, 0.610 | P12, P13, Prospects-noshow-on-board.png | nf |
| 3 | Stage bar + chips + search (phone: tiles + Today tile) | toolbar | src/screens/prospects/PipelineBar.jsx | top of each school section | staff+admin | 0.236, 0.246, 0.247 | P1, P2 | nf |
| 4 | Prospect panel | side panel: beside the list on PC, below it on tablet, full-screen Dialog with ← on phone | src/screens/prospects/ProspectPanel.jsx, Progress.jsx; Prospects.jsx:747 | row/card click, Sibling row, Calendar follow-up | staff+admin (Delete: admin) | 0.236, 0.244, 0.245, 0.246, 0.255 | P1, P3, P4, P5, P10, P11 | nf |
| 5 | Status menu | menu (phone: sheet) | ProspectPanel.jsx:182-218 | status tag + chevron | staff+admin | 0.245(2) | P5 | nf |
| 6 | Follow-up quick choices | inline expander | ProspectPanel.jsx:220-274 | "Follow up" row | staff+admin | 0.245(3) | P3 | nf |
| 7 | "History · n changes" | inline dropdown | ProspectPanel.jsx:379-396 | panel | staff+admin | 0.255 | none cited | nf |
| 8 | Form answers and waiver / Show signature | inline expander | ProspectPanel.jsx:398-428 | panel | staff+admin | 0.242, 0.244(6) | P10 | nf |
| 9 | Page ⋯ ("Edit statuses", one per school on Both) | menu | Prospects.jsx:723, 751-765 | header ⋯ | staff+admin | 0.245(7) | P7 | nf |
| 10 | Edit statuses (list) | dialog | src/screens/prospects/StatusesDialog.jsx:45-111 | ⋯ → Edit statuses | staff+admin | 0.236, 0.244(5,7) | P7 | nf |
| 11 | Status row ⋯ | menu | StatusesDialog.jsx:90-109 | row ⋯ | staff+admin | 0.244(5) | P7 | nf |
| 12 | Add status / Edit status | dialog step | StatusesDialog.jsx:150-222 | "+ Add status" / row click | staff+admin | 0.236 | P7 | nf |
| 13 | Delete "{status}"? (Move them to) | confirm | StatusesDialog.jsx:114-148 | ⋯ Delete status | admin | 0.244(5) | P7 | nf |
| 14 | Add prospect (which Live form; School on Both) | dialog | src/screens/prospects/Dialogs.jsx:138-180 | "+ Add prospect" / N | staff+admin | 0.236, 0.245(4) | P6 | nf |
| 15 | Book a free class / Change {name}'s free class | dialog | Dialogs.jsx:35-89 | panel buttons; Board drop on Booked | staff+admin | 0.244(2), 0.246 | P10 | nf |
| 16 | Joined (Date joined) | dialog | Dialogs.jsx:91-110 | status → Joined; drop on Joined | staff+admin | 0.236, 0.246 | P8 | nf |
| 17 | Did {name} come…? / "…free class is still ahead" | dialog | Dialogs.jsx:114-136 | drop on Came | staff+admin | 0.246, 0.247 | P12 | nf |
| 18 | Delete {name}? | confirm | Dialogs.jsx:182-199 | panel "Delete prospect" | admin | 0.236, 0.244, 0.611 | nf | nf |
| 19 | Rail / phone-bar count badge | nav badge | src/components/Rail.jsx:30-39, BottomBar.jsx:30-38 | always | staff+admin | 0.236, 0.244(3), 0.245(6,8) | P1 | nf |
| 20 | Forms list | screen | src/screens/Forms.jsx, src/screens/forms/FormsList.jsx | rail "Forms" (#forms; phone: More) | admin; staff view-only | 0.235, 0.243(5) | F1, F10 | nf |
| 21 | Form row ⋯ | menu (phone: sheet) | Forms.jsx:207-223 | row ⋯ (admin; staff on phone only) | staff+admin | 0.235, 0.243(5) | F1 | nf |
| 22 | New form | dialog | src/screens/forms/NewFormDialog.jsx | "+ New form" / N | admin | 0.235, 0.241 | F2 | nf |
| 23 | Delete this form? (with sign-ups: blocked note + Close) | confirm | Forms.jsx:310-328 | ⋯ Delete | admin | 0.241 | F1 | nf |
| 24 | Form builder | full page that replaces the list; no address of its own | src/screens/forms/Builder.jsx | admin row click, Create, ⋯ Edit | admin | 0.235, 0.241–0.243 | F3–F6 | nf |
| 25 | Field palette | left panel (PC) | FieldPalette.jsx | builder | admin | 0.235, 0.243(1) | F3 | nf |
| 26 | Add field menu | menu / sheet | Builder.jsx:508, 582, 550-561 | "+ Add field" (tablet/phone) | admin | 0.235 | F3 | nf |
| 27 | Field ⋯ (Move up, Move down, Delete field) | menu (phone) | Builder.jsx:538, 562-567 | phone field row | admin | 0.235 | F3 | nf |
| 28 | Field settings | right panel / phone full-screen Dialog | FieldEditor.jsx; Builder.jsx:603-607 | click a field | admin | 0.235, 0.243(3,7,8) | F3, F5 | nf |
| 29 | Booking settings | panel section | BookingSettings.jsx | "Book a class" field selected | admin | 0.242(2), 0.243(2) | F4 | nf |
| 30 | Form settings | right panel / phone full screen | FormSettings.jsx | empty space / "Form settings" | admin | 0.243(6,7), 0.601, 0.604 | F6 | nf |
| 31 | Share "{form}" | dialog | ShareDialog.jsx | row ti-share; builder "Share" | staff+admin | 0.235, 0.243(4) | F7 | nf |
| 32 | Open kiosk mode on this device? | inline confirm inside Share | ShareDialog.jsx:204-222 | Share → kiosk button | staff+admin | 0.241(3), 0.608 | F7, F9, Kiosk-K3-where.png | nf |
| 33 | End kiosk mode on all tablets? | inline confirm | ShareDialog.jsx:223-237 | Share link-button | staff+admin | 0.608, 0.609 | Kiosk-K4-ended.png | nf |
| 34 | Printed sign | print view | ShareDialog.jsx:30-43 | Share → Print a sign | staff+admin | 0.235 | F7 | nf |
| 35 | Fill in · {form} (steps, then "Sent") | dialog | FillInDialog.jsx, FormFields.jsx, SignaturePad.jsx, useFillIn.js | ⋯ / row "Fill in"; Add prospect | staff+admin | 0.235, 0.243(9), 0.603 | F8, F10 | nf |
| 36 | Preview · {form} | dialog (no Submit) | same | builder "Preview"; staff row click | staff+admin | 0.243(5) | F10 | nf |
| 37 | Kiosk welcome (plus ending / ended lines) | full screen | src/screens/kiosk/KioskApp.jsx:151-172; src/App.jsx:1178-1189 | Share → Open kiosk mode (dashboard locks) | families at desk | 0.235, 0.241(3), 0.608, 0.609 | F9 | nf |
| 38 | Kiosk form | screen | KioskApp.jsx:175-179 → src/forms/FormsApp.jsx (kiosk prop) | Start | families | 0.608 | F9 | nf |
| 39 | Kiosk thank-you (30 s, Done) | screen | src/forms/ThankYou.jsx:66-114 | after Submit | families | 0.606 | Kiosk-K1-thanks.png | nf |
| 40 | Still there? | alertdialog (own markup) | KioskApp.jsx:207-218 | 2 min idle | families | 0.608 | F9 | nf |
| 41 | Staff PIN to leave kiosk mode | PIN pad | KioskApp.jsx:181-191; src/screens/LockScreen.jsx:111-136 | corner ti-lock | staff | 0.607 | F9, Kiosk-K2-leaving.png | nf |
| 42 | "The sign-up screen didn't load" + Reload | error screen | src/screens/kiosk/KioskLoadGuard.jsx | kiosk file fails to load | staff | none (security review L2) | none | nf |
| 43 | Public sign-up, one step per page | public page | forms.html, src/forms/FormsApp.jsx, parts.jsx, functions/api/forms/[slug].js | /f/<slug> link or QR | public | 0.235, 0.241, 0.410, 0.602, 0.603 | F8, Forms-public-diff1/2.png | nf |
| 44 | Thanks, {first}! (+ Add to calendar) | public page | src/forms/ThankYou.jsx:35-62, ics.js | after Submit | public | 0.601, 0.604 | F8, Forms-public-diff3-thanks.png | nf |
| 45 | This form is closed (tap-to-call phone) | public page | FormsApp.jsx:375-390 | closed form | public | 0.605 | Forms-public-diff4-closed.png | nf |
| 46 | Not found / Sign-ups are paused / The form didn't load (+ Try again) | public page | FormsApp.jsx:391-399 | bad link, PUBLIC_FORMS off, network | public | 0.235 | F8 | nf |
| 47 | Preview strip | banner | src/forms/parts.jsx:25-31 | preview mode only | — | — | — | — |
| 48 | School "Phone (optional)" | field in Settings → Schools (outside these files) | src/screens/settings/text.js:13, 40 | Settings | admin | 0.605 | Forms-public-diff4-phone-settings.png | nf |
| 49 | Schedule (one school) | screen | src/screens/Schedule.jsx, src/screens/schedule/ScheduleSchool.jsx, TimeGrid.jsx | rail "Schedule" (#schedule; phone: More) | admin edits; staff views | 0.233, 0.237, 0.238, 0.600 | S1, S5, S6, S7 | nf |
| 50 | Schedule on Both | screen | Schedule.jsx:100-175 | switcher on Both | staff+admin | 0.233 | S8 | nf |
| 51 | Which school? | dialog | Schedule.jsx:157-173 | Both: Plan a change / Add time slot / N | admin | 0.233 | S8 | nf |
| 52 | Schedule picker (Current / Planned / Past schedules) | select | ScheduleSchool.jsx:512-558 | page | staff+admin | 0.233 | S1, S5 | nf |
| 53 | Planned schedule ⋯ | menu | ScheduleSchool.jsx:443-453, 544-555 | ⋯ beside the picker | admin | 0.233 | S5 | nf |
| 54 | Page ⋯ on phone (Plan a change) | menu / sheet | ScheduleSchool.jsx:485-497; Schedule.jsx:103-113 | phone header ⋯ | admin | 0.233 | S1 | nf |
| 55 | Add / Edit time slot | dialog | SlotDialog.jsx | "+ Add time slot" / N / slot click | admin | 0.233, 0.237, 0.600 | S2, S3 | nf |
| 56 | Plan a schedule change / Edit planned schedule | dialog | PlanDialog.jsx | Plan a change; ⋯ Change start date / Rename | admin | 0.233 | S4 | nf |
| 57 | Delete the {name} schedule? | confirm | ScheduleSchool.jsx:663-688 | ⋯ Delete planned schedule | admin | 0.233 | S5 | nf |
| 58 | Planned / past info bar | inline bar | ScheduleSchool.jsx:560-566, 603-608 | pick a planned or past schedule | staff+admin | 0.233 | S5 | nf |
| 59 | Calendar Month (grid + day side panel) | screen | src/screens/Calendar.jsx, src/screens/calendar/MonthGrid.jsx | rail / phone bar "Calendar" (#calendar) | admin edits; staff views | 0.234, 0.239, 0.240, 0.612–0.615 | C1, C5, C7, C8, Calendar-show-mockup-PC.png | nf |
| 60 | Phone month (dots, hollow ring) + day list | screen | PhoneMonth.jsx + DayPanel.jsx | phone | staff+admin | 0.234, 0.612 | C1, Calendar-show-mockup-tablet-phone.png | nf |
| 61 | Week view | screen view | WeekView.jsx | Month/Week switch (PC/tablet) | staff+admin | 0.234, 0.240(3), 0.612 | C2 | nf |
| 62 | Day panel (also Check in, Follow-ups) | side panel on PC; below on tablet/phone | DayPanel.jsx | click a day | staff+admin | 0.234, 0.236, 0.241(6), 0.612, 0.615 | C1, C5 | nf |
| 63 | "+ Add" menu ("Add to the calendar": Event, Closure) | menu | Calendar.jsx:635-645, 788-793 | "+ Add" | admin | 0.234, 0.240(6) | C1 | nf |
| 64 | Page ⋯ (Event types) | menu | Calendar.jsx:625-634, 794 | header ⋯ | admin | 0.234, 0.240(6) | C6 | nf |
| 65 | Show menu | dropdown / phone sheet | ShowMenu.jsx, src/lib/calendar/showKinds.js | "Show" button | staff+admin | 0.613–0.615 | Calendar-show-mockup-*.png | nf |
| 66 | Add / Edit event; "Event" (staff view) | dialog | EventDialog.jsx | Add → Event / N / event click | admin edits; staff views | 0.234, 0.239(4), 0.240(4) | C3, C7 | nf |
| 67 | Add / Edit closure; "Closure" (staff view) | dialog | ClosureDialog.jsx | Add → Closure / closure click | admin edits; staff views | 0.234, 0.239(2,4), 0.240(1), 0.241(6) | C4, C5 | nf |
| 68 | Event types (list / add / edit) | dialog | EventTypesDialog.jsx | ⋯ → Event types | admin | 0.234, 0.239(3), 0.240(5) | C6 | nf |
| 69 | Event type row ⋯ | menu | EventTypesDialog.jsx:113-132 | row ⋯ | admin | 0.240(5) | C6 | nf |
| 70 | Delete {type}? (Move to) | confirm | EventTypesDialog.jsx:138-177 | ⋯ Delete type, or Edit → Delete | admin | 0.234, 0.239(3) | C6 | nf |

## Part B — How this area does each common job

### J1 — Roster / list

| Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|
| Prospects List | PC: role=table, whole row clickable (prospects.css:317). With the panel open, only Child · Progress · Status show. One row per child ("Ava R."). Blue dot = not opened yet. No row actions. Tablet: full list, panel below. Phone: card buttons (name · parent, track, amber follow-up line, status tag). | "Child", "Parent", "Progress", "Follow up", "Status" | ti-alert-triangle | local ProspectList.jsx:47-117 |
| Prospects Board | One column per stage with a count; No-shows sit in Booked. Card = name, parent, one line. Tablet scrolls sideways; phone shows one column (swipe or tap a tile). | "Nobody here", "Scroll sideways for more stages", "Drag a card to another stage, or open it and change the status." | ti-arrows-horizontal | local Board.jsx |
| Forms list | PC role=table: Form · Status tag (Draft / Live green / Closed) · This month · Type · actions. Only the name opens the row. Phone: two-line rows. Both: W/S letter. | "N sign-ups", "N this month" | ti-share, ti-dots | local FormsList.jsx; shared IconButton |
| Statuses / Event types lists | grip + row button (swatch, name) + ⋯ | "used by the app" | ti-grip-vertical, ti-dots | local; Grip from src/screens/testing/RankRows.jsx |
| Builder | Canvas with a grip per field and dashed "Step n · …" dividers. Phone: list rows + ⋯. | "Always on the form" | field-type icons, ti-lock | local Builder.jsx |

### J2 — Open / edit a row

| Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|
| Prospects | Row/card opens the panel (not a dialog). Status, follow-up and notes are edited inline. Call/Text/Email use tel: / sms: / mailto:. On PC, Call shows the number large with Copy. | "Call", "Text", "Email", "Copy number" / "Copied" | ti-phone, ti-message, ti-mail, ti-copy, ti-x (close) | local ProspectPanel.jsx |
| Prospects check-in (inline) | On the class day, a "Check in" box in the panel. After class: "Did … come?" with Came / No-show. The Calendar day panel has Check in for today's free classes. | "Check in", "Did {name} come to the free class?", "Came", "No-show", "checked in" | ti-user-check, ti-user-x | ProspectPanel.jsx:149-175; DayPanel.jsx:150-161 |
| Forms | Admin row opens the builder page. Staff row opens a read-only Preview dialog (published forms only). | — | ⋯ Edit = ti-pencil | Forms.jsx:203-206 |
| Schedule | Admin clicks a slot box → Edit time slot. Staff boxes can't be clicked. | — | — | TimeGrid.jsx:124-131 |
| Calendar | Day click → day panel. Event/closure row or chip → Edit (admin) or View (staff: read-only, Close). | "View only — ask an admin to change this." | ti-chevron-right on rows | DayPanel / EventDialog / ClosureDialog |

### J3 — Add new

| Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|
| Prospects | Primary button, header right; N key | "Add prospect" (phone "Add") | ti-plus | Prospects.jsx:726 |
| Forms | Primary, admins only | "New form" (phone "New") | ti-plus | Forms.jsx:341 |
| Schedule | Primary + outline "Plan a change" (phone: under ⋯) | "Add time slot" (phone "Add") | ti-plus, ti-calendar-plus | ScheduleSchool.jsx:475-510 |
| Calendar | Primary opens a menu; N skips the menu and opens Add event | "Add" → "Event" / "Closure" | ti-plus, ti-calendar-event, ti-calendar-off | Calendar.jsx:635 |
| Inside dialogs | Outline buttons | "Add status", "Add type", "Add field", "Add option", "Add another child" | ti-plus | local |

### J6 — Remove / withdraw / delete

| Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|
| Prospect | Red-text button at the bottom of the panel → confirm → toast, no Undo | "Delete prospect" → "{name} was deleted." | ti-trash | ProspectPanel.jsx:431 |
| Custom status | ⋯ → confirm with a Move-to picker | "Delete status" | ti-trash (red item) | StatusesDialog |
| Free-class booking | Plain button (not red), instant, toast with Undo | "Cancel booking" → "{name}'s free class was cancelled." | — | ProspectPanel.jsx:297 |
| Form | ⋯ → confirm; blocked when it has sign-ups | "Delete" → "{name} was deleted." | ti-trash | Forms.jsx |
| Builder field | Red-text button or ⋯, instant, no confirm, no Undo | "Delete this field" / "Delete field" | ti-trash | FieldEditor.jsx:172; Builder.jsx:566 |
| Child (Fill in) | Icon button, instant | — | ti-trash | FormFields.jsx:150 |
| Time slot | Red "Remove" inside Edit, instant, Undo toast | "Mon 4:00 White removed" | ti-trash | SlotDialog.jsx:98 |
| Planned schedule | Confirm, toast without Undo | — | ti-trash | ScheduleSchool.jsx |
| Event / closure | Red "Remove" inside the dialog, instant, Undo toast | "Removed {title}" / "Removed closure: {reason}" | ti-trash | EventDialog / ClosureDialog |
| Event type | Confirm with Move-to | "{name} deleted" | ti-trash | EventTypesDialog |

### J7 — Row ⋯ menus (order as shown; all use the shared RowMenu)

| Where | Items, in order | Icons |
|---|---|---|
| Forms row (admin) | Edit · Fill in for a family (dimmed unless Live) · Duplicate · Close form / Open form again (not on Drafts) · separator · Delete (red). Staff on phone: Fill in for a family only. | ti-pencil, ti-plus, ti-copy, ti-door-exit / ti-door-enter, ti-trash |
| Builder field (phone) | Move up · Move down · separator · Delete field (dimmed on locked fields) | ti-arrow-up, ti-arrow-down, ti-trash |
| Builder Add field | Field types grouped Contact / Choices / School / Layout, separated | field-type icons |
| Prospects page | Edit statuses (one item per school on Both) | ti-edit |
| Prospects status menu | Stages, separator, side exits; current one shows ti-check + "(now)", others a color dot | ti-check |
| Status row | Edit · Move up · Move down · separator · Delete status (dimmed for staff and built-ins) | ti-edit, ti-arrow-up, ti-arrow-down, ti-trash |
| Planned schedule | Change start date · Rename · separator · Delete planned schedule | ti-calendar, ti-edit, ti-trash |
| Calendar Add | Event · Closure | ti-calendar-event, ti-calendar-off |
| Calendar page | Event types | ti-palette |
| Event type row | Edit · Move up · Move down · separator · Delete type | ti-edit, ti-arrow-up, ti-arrow-down, ti-trash |

### J8 — Search / filter / sort / "Both"

| Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|
| Prospects | Database search: names, or 4+ phone digits; starts at 2 characters, 300 ms. Click a stage to filter. List opens on "Follow up today". Side-exit chips. No sort control. Board: "Showing n of m…" + "Show everyone". Both: two school sections, each with its own bar and a pin heading, and ONE search above them. | "Search name or phone", "Follow up today · N", "Both schools" | ti-search, ti-clock-hour-4, ti-map-pin, ti-x | local PipelineBar.jsx, Prospects.jsx:732 |
| Forms | No search, filter or sort. Both: all forms with a W/S letter. New form on Both pre-selects Worcester. | — | — | Forms.jsx:119 |
| Schedule | Schedule picker (select). Both: two sections with pin headings; Add / Plan ask "Which school?". | "Worcester and Shrewsbury" (other sections say "Both schools") | ti-map-pin | schedule/text.js:15 |
| Calendar | Show menu, remembered per person on the device. Both: chips start with W / S / "W S"; class counts add both schools; per-school headings in the panel. Event/closure dialogs default to "Both". | "Show", "4 of 5", "Show on the calendar", "Show everything", "Done" | ti-filter | local ShowMenu.jsx (a copy of RowMenu) |

### J9 — Summary / count cards

| Where | How it works | Icons | Component |
|---|---|---|---|
| Prospects | Stage bar: count + proportional bar per stage (Joined bar green). Phone: stage tiles + "Today" tile. Board column counts. No metric cards. | ti-clock-hour-4 (Today tile) | PipelineBar.jsx |
| Calendar | Day-box summaries: "4 classes", "2 free classes", "2 follow-ups" | — | MonthGrid.jsx |
| Forms | "This month" column | — | FormsList.jsx |

### J10 — Confirm dialogs (all use Dialog variant="confirm"; red filled delete button)

| Where | Title | Body | Buttons |
|---|---|---|---|
| Prospect | "Delete {name}?" | "…are deleted, and the family's sign-up and answers with it. This can't be undone." | Cancel / Delete ("Deleting…") |
| Status | `Delete "{name}"?` | "N people are in "X". Move them to:" + select | Cancel / Delete |
| Form | "Delete this form?" | `"{name}" and its booking settings will be deleted. This can't be undone.` | Cancel / Delete — shows **"Saving…"** while deleting |
| Planned schedule | "Delete the {name} schedule?" | "…deleted for good. … keeps running past … This can't be undone." | Cancel / Delete |
| Event type | "Delete {name}?" | "…Pick the type they move to. This can't be undone." + "Move to" | Cancel / Delete |
| Kiosk open / end | inline in Share, not Dialog | "Open kiosk mode on this device?" / "End kiosk mode on all tablets?" | Cancel / "Open kiosk mode" (blue, ti-device-tablet) / "End kiosk mode" (blue) |

### J11 — Toast + Undo (shared `src/components/Toast.jsx`, through `showToast` at App.jsx:234)

| Where | Undo toasts | Toasts without Undo | Icon |
|---|---|---|---|
| Prospects | "{name} checked in.", "…didn't show — call back tomorrow.", "…moved to {stage}.", cancelled booking | "Status: X", "Note saved.", "Free class booked for X.", deleted, "That prospect no longer exists." | No-Undo toasts get ti-check (the default) |
| Forms | none | duplicated / closed / reopened / deleted / published / booking saved | ti-check (default) |
| Schedule | added, saved, removed, planned | deleted; "Undone" | always icon:false |
| Calendar | added, saved, removed, check-in | type added / saved / deleted; "Undone" | always icon:false |

### J12 — Failed save / errors / retry / offline

| Where | How it works | Exact words | Component |
|---|---|---|---|
| Load failure, all four sections | ErrorBanner with Retry | e.g. "Couldn't load the prospects. Check the connection and try again." | shared ErrorBanner (Prospects.jsx:567, Forms.jsx:266, ScheduleSchool.jsx:581, Calendar.jsx:712) |
| Prospects save failure | Banner, dismiss only, no Retry | "It wasn't saved. Check the connection and try again."; stale: "Someone else changed this prospect…" | Prospects.jsx:731 |
| Forms list / builder | Banner, dismiss only; builder status line shows amber "· not saved" | "Your last change wasn't saved. … it will try again with your next change." | Builder.jsx:574 |
| Schedule / Calendar | Amber note inside the dialog (Save is the retry). Stale → blocking note; on phone it has a "Discard changes" button. Failed Undo → banner with Retry. | — | — |
| Everywhere | Offline bar: not found. Unsaved row marker: not found. | — | — |

### J13 — Empty states / loading

| Where | Loading | Empty |
|---|---|---|
| All four | Skeleton `sskeleton` / `tskeleton-row` (2 bars; builder 1 bar) | — |
| Prospects | panel "Loading…" | "No prospects yet. They appear here when a family sends a form, or with "Add prospect"." / "Nobody to follow up today." / "No one matches that search." |
| Forms | — | "No forms yet. Start one with "New form"." |
| Schedule | — | "No classes on the {school} schedule yet." (Add button stays in the header, v0.238) |
| Calendar | — | "No classes this day."; "No event types yet. Add one, like Tournament or Camp." |
| Public form | "Loading the form…" | — |

### J14 — Print / receipt / export

| Where | How it works | Icons |
|---|---|---|
| Share | Download QR as PNG (`qr-{slug}.png`); "Print a sign" = letter-size flyer, reusing Color Belt's flyer print CSS | ti-download, ti-printer |
| Public thank-you | "Add to calendar" downloads `free-class.ics` | ti-calendar-plus |
| Elsewhere | No CSV export | — |

### J15 — Link / QR / share (Share dialog only)

Contents, top to bottom:
- Title `Share "{name}"`, form status under it.
- A Draft shows only: "A Draft form can't be shared until it's published."
- Link: the link + "Copy" (changes to "Copied"), icon ti-copy.
- Live forms only: 128px QR code + Download + Print a sign.
- "Front desk": "Open kiosk mode on this device" (ti-device-tablet), with a link-button "End kiosk mode on all tablets".
- Close.

Opened from: list row IconButton ti-share ("Share {name}") or the builder's outline "Share" button.

### J16 — Settings / admin configuration

| Where | How it works | Exact words | Icons |
|---|---|---|---|
| Form settings (builder panel) | Saves as you go. Switches drawn as checkboxes with role=switch. | Form name; Thank-you message; "Send confirmation email"; ""Add to calendar" button"; "Email the school about new sign-ups"; "Emails start once the school's sending address is set up."; Web address "…/f/"; "Accepting sign-ups (Live)" | — |
| Booking settings | Own primary Save | "Changes here go live right away."; "Show the next / days"; "Book at least / hours ahead"; "Save booking settings" | ti-check |
| Other settings | Edit statuses (dialog); Event types (dialog); class color (in the slot dialog); school phone (Settings section) | — | — |
| Per person on device | Saved in this browser per staff member | keys `tkd.prospects.view.<id>` (List/Board), `tkd.calendar.hidden.<id>` (Show menu) | — |

### J17 — Date / time entry

- The browser's own date box (`<input type="date">`) everywhere in this area:
  - follow-up date: ProspectPanel.jsx:259, 349
  - Joined date (default today, latest today): Dialogs.jsx:98
  - planned schedule "Starts on" (after today): PlanDialog.jsx:111-124
  - event Starts / Ends: EventDialog.jsx:186-227
  - closure From / To: ClosureDialog.jsx:141-167
  - form "Date" field: FormFields.jsx:122
- The browser's own time box (`<input type="time" step=300>`): time slots (SlotDialog.jsx:231-261) and event times.
- The shared `DatePicker.jsx` is **not used** in this area.
- Defaults: a new slot starts 4:00–4:40 PM (v0.600); event and closure start on the chosen day.

### J18 — Signature

- One local component, `src/screens/forms/SignaturePad.jsx`: a canvas with pointer events and a "Clear" link-button.
- Used by staff Fill in, the public form and the kiosk.
- Words: "Signature", "Sign with a finger, pen or mouse.", "Please sign in the box."
- Prospects panel: "Show signature" (each look recorded), or "(picture deleted after 90 days)".

### J19 — Duplicates

- Prospects: a family signing up twice is **not flagged** (v0.244(4)). Staff use search. Siblings from one sign-up appear as "Sibling" rows in the panel.
- Forms "Duplicate" means something else: copy a form as a Draft "Copy of …".

### J21 — Public form flow

**Steps (FormsApp.jsx):**
- Header strip: logo, school name, town.
- Progress bar; heading = the step's name; "Step n of N" under it.
- Back / Next / Submit buttons **without icons** (staff Fill in has ti-arrow-left / ti-arrow-right / ti-check).
- Errors show after the family leaves a filled field, or after Next. Message: "Please check the answers marked above."
- **No review/check page.**
- Turnstile runs on the last step, at Submit. Hidden honeypot field. Privacy line on the last step.

**Done page:** "Thanks, {first}!", the form's message, "Your free class" list, a "save this page" line, and Add to calendar.

**Message pages:** closed (with phone), not found, paused, didn't load ("Try again").

**Kiosk:** the same FormsApp with autofill off, then the kiosk thank-you (ti-camera, Done, "Starting over in N seconds…").

### J22 — Page structure

| Where | Structure |
|---|---|
| All four sections | `.phead`: h1 title, subtitle (school or "Both schools"); add button on the right. |
| Staff view-only lines | Forms "View only — ask an admin to create or change forms." · Schedule "View only. Ask an admin to make changes." · Calendar "View only — ask an admin to make changes." |
| Builder | Replaces the page: ← icon-button "Back to Forms", h1 = form name, status line, Preview / Share / Publish. |
| Calendar toolbar | ‹ › title, Today, Show, Month/Week. |
| Tabs | No tabs anywhere in this area. |

### J23 — Notes / history

- Prospects: "Notes and calls" — typed notes always visible, newest first, with "Oct 18 · {who}". Automatic changes sit in the closed "History · n changes" row. "Entered by {name}" in the header line.
- Calendar: event notes field with hint "Notes are kept in the change history." No history view.
- Schedule: past schedules, read-only, via the picker (ti-history bar).

### J24 — Unsaved changes / Esc

| Where | What Esc / backdrop / back does |
|---|---|
| Schedule, Calendar dialogs, Calendar Event types | Note "Unsaved changes. Save or cancel first.", dialog stays open (phone note adds "Discard changes"). |
| Prospects panel | Note "Unsaved note. Save it or cancel first." |
| Prospects Book / Joined / Came / Add | Closes straight away (no check). |
| Prospects Edit statuses | Goes back to the list and **drops the typed changes** (Prospects.jsx:702-707). |
| Forms New form | First Esc shows the note; **second Esc closes** (Forms.jsx:299-303). |
| Fill in | First Esc: "This sign-up isn't sent yet. Send it or press Cancel to throw it away."; **second Esc discards** (useFillIn.js:104-110). |
| Builder | Back saves first. |

### J25 — Create the container

| Where | Fields | Result |
|---|---|---|
| New form | School segmented control (on Both), "Form name", "Start from" template cards: Free class (ti-user-plus), Walk-in (ti-door), Event (ti-calendar-event), Blank (ti-file). Button "Create" (ti-check). | Opens the builder on the Draft |
| Plan a schedule change | "Name (optional)" (placeholder "Winter"), "Starts on", "Start from" Copy of … / Blank | Undo toast |
| Add event | Title, Type select with swatch, All day, Starts / Ends, School (Worcester / Shrewsbury / Both), "More details (notes)" | — |
| Add closure | Reason, From / To, School, "What's cancelled" All / Some classes | — |

## Part C — Rulebook mismatches noticed in passing

1. **Icon-only buttons with no tooltip** (§1.4, §4). They use `.icon-button` (aria-label only; app.css:157 has no tooltip). Places: Prospects.jsx:723; ProspectPanel.jsx:107; Calendar.jsx:626, 663, 666; ScheduleSchool.jsx:487, 545; Schedule.jsx:104; Builder.jsx:350, 538; FieldEditor.jsx:81; FormFields.jsx:150; StatusesDialog.jsx:61; EventTypesDialog.jsx:81. Only FormsList uses the shared IconButton, which has the tooltip.
2. **Icons that break the icon map (§2.4):**
   - Forms ⋯ Edit uses ti-pencil (map: ti-edit) — Forms.jsx:211
   - Close form / Open form again use ti-door-exit / ti-door-enter (not in the map) — Forms.jsx:217
   - Duplicate uses ti-copy (map: Copy to clipboard) — Forms.jsx:213
   - "Fill in for a family" uses ti-plus (map: Add new) — Forms.jsx:212
   - "Book a free class" uses ti-calendar-plus (map: free-class booking = ti-user-plus) — ProspectPanel.jsx:303
   - ti-check as the "current status" mark and as Show-menu tick marks (map: save/done only) — ProspectPanel.jsx:208, ShowMenu.jsx:158
   - Not in the map: ti-arrow-right (FillInDialog.jsx:139, Progress.jsx:63), ti-arrows-horizontal (Board.jsx:144), ti-circle-check (FillInDialog.jsx:59), ti-camera (ThankYou.jsx:102)
   - ti-users for the Children field (map: count cards only) — FieldPalette.jsx:30
   - Expand/collapse uses chevron-right/down at ProspectPanel.jsx:403 and EventDialog.jsx:250 (map: chevron-down/up; only the History row has the v0.255 exception)
   - Icons at 12–14px in buttons and chips (§2.2 says 16) — WeekView.jsx:78-79, Board.jsx:42, PipelineBar.jsx:54
3. **Reversible changes without Undo (§1.4):**
   - Prospects status change from the panel menu has no Undo (Prospects.jsx:244), while the same change by Board drag does (399-404)
   - Follow-up date change: no toast at all (Prospects.jsx:259)
   - Joined and booking: no Undo (253, 311)
   - Forms Close / Open again: no Undo (Forms.jsx:176; Builder.jsx:337)
   - Builder Delete field: instant, no Undo (Builder.jsx:222-236)
   - "Cancel booking" is a removal but is not red (§7) — ProspectPanel.jsx:297
4. **Unsaved-changes guard (§6, v0.83(4) "it stays open"):** a second Esc throws the typing away in New form (Forms.jsx:299-303) and Fill in (useFillIn.js:104-110). Prospects Edit statuses has no guard (Prospects.jsx:702-707); Calendar's Event types does.
5. **Failed saves (§3.5):** no Retry on Prospects or Forms save banners (Prospects.jsx:731, Forms.jsx:351, Builder.jsx:574). No unsaved row marker and no offline bar anywhere. Dialog saves wait for the database (ScheduleSchool.jsx:14, Calendar.jsx:19) — the same pattern as Testing.
6. **Two blue primaries (§1.1):** Builder "Publish" (Builder.jsx:380) + "Save booking settings" (BookingSettings.jsx:105). On PC/tablet, Prospects "Save note" (ProspectPanel.jsx:359) + "Add prospect" (Prospects.jsx:726).
7. **Forms PC rows:** only the name opens the row, not the whole row (§8) — FormsList.jsx:81, no `::after` in forms.css. Column order is Status before the key info.
8. **Hover-only information (§2.5):**
   - DayPanel.jsx:142 ("Booked with {form}") and :124 (Testing rows)
   - TimeGrid.jsx:125 (time on short slots)
   - FormsList.jsx:27 (why Fill in is off)
   - FieldPalette.jsx:60 (why a field type is dimmed)
9. **Page addresses (v0.83):** the builder sub-page has no address or history step, so browser Back leaves Forms — Forms.jsx:74-100; pageAddress.js:17.
10. **Global search (§3.2):** Prospects has its own search; the top bar has none (TopBar.jsx:19-34).
11. **"Hide private details" (v0.506):** no file in this area reads the switch. The Prospects panel shows the phone and links the email (ProspectPanel.jsx:134, 311). The lead decides whether v0.506 applies here.
12. **Calendar Testing events (v0.239(1)) not built:** `loadTestingEvents` returns [] (src/lib/calendar/api.js:129-131). Testing chips in WeekView don't show the W/S letter (WeekView.jsx:114-121).
13. **Error wording (§1.4):**
    - a failed check-in shows the "Couldn't load the calendar…" text (Calendar.jsx:588)
    - a failed signature load says "It wasn't saved…" (ProspectPanel.jsx:426), and so does a failed open-times load (Dialogs.jsx:52)
    - "Try again" (FormsApp.jsx:396) and "Reload" (KioskLoadGuard.jsx:25) instead of Retry + ti-refresh
14. **Check-mark toasts:** Prospects and Forms toasts without Undo show ti-check (Prospects.jsx:217), including "That prospect no longer exists." (204). Schedule and Calendar toasts never show it.
15. **Validation timing (§8):** staff Fill in only checks on Next (FillInDialog.jsx:81-94); the rule says "validate as the user types".
16. **N key (§3.6):** Calendar's N opens Add event directly instead of the "+ Add" menu (Calendar.jsx:615-618).
17. **Colors outside the palette:** PhoneMonth.jsx:14-15 hard-codes #EF9F27 and #BA7517.

## Part D — Work listed in docs as not yet done

- **Calendar:** Testing events don't load yet (v0.239(1)). A "Testing" line goes into the Show menu once they do (v0.615). Camps and Black Belt must each add a Show line when they reach the Calendar (v0.613); none have.
- **Stale status files:**
  - STATUS-Calendar.md says v0.615 is "not committed, nothing live", but commit edd608c is on main and origin/main.
  - STATUS-Prospects.md says the no-show Board change 15b43db is "not deployed yet", but it is on origin/main.
  - Step tables S6/S7, C6/C7, P5/F6 are older than the "Deployed 2026-10-20" lines.
- **Forms emails:** launched without emails (v0.601). Later: a Cloudflare web address + Resend.
- **Done "as the system is used" (STATUS-Forms 2026-10-21):** the two-connection race test, the real form with the school's waiver wording, the kiosk on the real tablet.
- **Deferred to go-live:** Shrewsbury's real schedule (Schedule S5); one real closure and one real event (Calendar C5).
- **Open question for Jeffrey:** the school phone line under the address vs. under the school name (STATUS-Forms:120).
- **Kiosk:**
  - L5: a database status for "kiosk token refused" would need a future migration.
  - Tablet setup steps for go-live: TKD-Kiosk-Build-Plan.md:121-127.
- **Later options and notes:**
  - Calendar follow-ups option B (new function + migration) if prospects reach the thousands (v0.615).
  - A future history screen should also check the "before" school when an event moves school (STATUS-Calendar:37).
  - Rate-limit WAF rule once the school has its own domain (v0.410).
- **Main session:** run the full run.mjs once with 0014 and 0015 together (STATUS-Prospects:83).
- **Small leftovers:**
  - Forms design-review Lows left as they are: the tablet "+ Add field" menu opens over the rail; the staff phone ⋯ sheet (STATUS-Forms:85).
  - A later waiver-rule change on the live database should also check the rows already saved (STATUS-Forms:105).
