# Phase 1 inventory — Shell, sign-in, Home, account menu, Staff accounts, Settings and shared components (owner: Main session)
Scope: main at 1c42e8b, 2026-10-21. Written by the core inventory agent; checked afterwards by a separate checker agent.

Rulebook = docs/Dashboard Docs/TKD-Dashboard-Design-Guidelines.md ("line N" below = its line number).

### Part A — Screens, dialogs, menus and public pages

My area has no public pages. Kiosk and DatePicker reuse my files, but other branches own them.

| # | Name | Kind | File(s) | How you get there | Who | Rulebook rows | Approved mockup | Replaces |
|---|---|---|---|---|---|---|---|---|
| 1 | Setup needed | screen (developers) | src/screens/SetupNeeded.jsx; src/main.jsx:20-24 | .env.local missing, or secret key used | developers | not found | none | none |
| 2 | Preview banner ("…PIN: 2580") | banner | src/components/PreviewBanner.jsx; src/App.jsx:961 | preview build only | testers | not found | none | none |
| 3 | Sign in | screen | src/screens/SignIn.jsx; src/App.jsx:392-405 | signed out, new device, every 7 days | everyone | §5, v0.13, v0.16, v0.83(3) | docs/Dashboard Docs/TKD-Home-Mockups.html §1 | none |
| 4 | Sign-in notices (6 texts) | inline amber Notice | src/App.jsx:93-102; src/screens/SignIn.jsx:91 | after automatic sign-outs | everyone | v0.26, v0.28 | docs/Dashboard Docs/TKD-Account-Screens-Mockups.html:133 | none |
| 5 | Set your PIN (2 steps) | screen | src/screens/SetPinScreen.jsx | password sign-in with no PIN; menu "Set PIN" (src/App.jsx:997) | personal accounts | v0.26, v0.28, v0.75 | docs/Dashboard Docs/TKD-Account-Screens-Mockups.html §1 | none |
| 6 | Lock screen | screen | src/screens/LockScreen.jsx, src/components/PinEntry.jsx | idle (45 min; desk 2 h) or Lock now | accounts with a PIN | §5, v0.14, v0.16, v0.27, v0.29, v0.83(2) | docs/Dashboard Docs/TKD-Home-Mockups.html §4 | none |
| 7 | Kiosk PIN pad | screen variant | src/screens/LockScreen.jsx:112-142 (`kiosk` prop) ← src/screens/kiosk/KioskApp.jsx:188 | kiosk lock button | desk staff | v0.607, v0.608 (Forms owns) | "mockup 9" (src/screens/LockScreen.jsx:15) = docs/Prospects/TKD-Forms-Mockups.html §9 | none |
| 8 | Rail (PC 52px icons + label bubble; tablet 72px with labels) | nav | src/components/Rail.jsx, src/components/navItems.js; src/styles/app.css:507-634 | always | all | 1.3, 2.3, v0.4, v0.6, v0.54, v0.201, v0.229, v0.233-236 | docs/Dashboard Docs/TKD-Home-Mockups.html; docs/Dashboard Docs/TKD-Dashboard-Mockups.html §3 | none |
| 9 | Testing hover menu | menu | src/components/RailMenu.jsx | hover or keyboard focus on Testing; only when STAR_TESTING_ON (off on the live site) | all | v0.59, v0.177 | docs/Testing/Star Testing/TKD-StarTesting-Phase1-Chooser-Mockups.html §2 | none |
| 10 | Prospects count badge | badge | src/components/Rail.jsx:36-40; src/components/BottomBar.jsx:35-39; src/App.jsx:939-952 | automatic, refreshed every 2 min | all | v0.236, v0.244 | docs/Prospects/TKD-Prospects-Mockups.html rev 2 | none |
| 11 | Phone bottom bar | nav | src/components/BottomBar.jsx | phones under 640px | all | 1.3, v0.236, v0.714 | docs/Prospects/TKD-Prospects-Mockups.html rev 2 | none |
| 12 | "More" sheet | sheet | src/components/BottomBar.jsx:45-73 (RowMenu as a sheet) | tap More | all | v0.236, v0.714 | docs/Prospects/TKD-Prospects-Mockups.html | none |
| 13 | Top bar | bar | src/components/TopBar.jsx | always | all | §6, v0.12, v0.45 | docs/Dashboard Docs/TKD-Home-Mockups.html | none |
| 14 | Location switcher | control | src/components/LocationSwitcher.jsx | top bar | all | 3.3, v0.16 | docs/Dashboard Docs/TKD-Home-Mockups.html | none |
| 15 | "Private details hidden" chip | top-bar button | src/components/TopBar.jsx:23-28; src/styles/finance.css:901-1099 | shows while the switch is on; tap turns it off | anyone signed in | v0.215, v0.506, v0.508 | docs/Testing/Star Testing/TKD-StarTesting-Phase3-Gap-Mockups.html P3-G3 | Finance "Payments hidden" chip |
| 16 | Account menu (PC dropdown 248px; phone sheet) | menu | src/components/AccountMenu.jsx; src/styles/app.css:731-864 | initials button | all; Change PIN/password hidden for the shared desk; Admin group admins only | §6, v0.15, v0.26, v0.28, v0.70, v0.135, v0.506 | docs/Dashboard Docs/TKD-Home-Mockups.html §3; docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html §1; docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html S1; docs/Testing/Star Testing/TKD-StarTesting-Phase3-Gap-Mockups.html P3-G3 | none |
| 17 | This device (Worcester / Shrewsbury) | inline radio list | src/components/AccountMenu.jsx:285-319 | menu → This device | all | v0.26(2), 3.3 | described in words only (docs/Dashboard Docs/TKD-Home-Mockups.html:299) | none |
| 18 | Hide private details | menu switch | src/components/AccountMenu.jsx:321-334; src/lib/privateDetails.js | menu | anyone signed in | v0.215, v0.249-253, v0.506, v0.507 | docs/Testing/Star Testing/TKD-StarTesting-Phase3-Gap-Mockups.html P3-G3 | Finance "Hide payments" + Star's planned "Mat-side tablet" |
| 19 | Change PIN (3 steps) | dialog (phone: full page) | src/screens/ChangePinDialog.jsx + src/components/AccountDialog.jsx | menu | personal accounts | v0.28, v0.82 | docs/Dashboard Docs/TKD-Account-Screens-Mockups.html §2 | none |
| 20 | Change password | dialog | src/screens/ChangePasswordDialog.jsx + src/components/AccountDialog.jsx | menu | personal accounts | v0.28, v0.82 | docs/Dashboard Docs/TKD-Account-Screens-Mockups.html §3 | none |
| 21 | Toast | toast | src/components/Toast.jsx; src/App.jsx:207-238, 1193 | after saves in every section | all | §8, v0.29, v0.54 | Testing mockups (Undo look): docs/Testing/Color Belt Testing/TKD-Testing-Classes-Ranks-Mockups.html | none |
| 22 | Home | screen | src/screens/Home.jsx; src/styles/app.css:1054-1090 | rail Home; default page after sign-in | all | §9 Home, v0.10, v0.11, v0.30, v0.54 | docs/Dashboard Docs/TKD-Home-Mockups.html §2 | none |
| 23 | Close-the-day reminder lines (+ OK) | lines on Home | src/screens/finance/HomeReminders.jsx, src/screens/finance/reminderText.js (Finance owns) | on Home, from the set reminder time | today lines: whoever the database names; earlier-days line + OK: admins only | v0.202, v0.203, v0.811, v0.506 | docs/Finance/TKD-Finance-DailyReport-Mockups.html D10; docs/Finance/images/Finance-Q17-reminder-ok.png | none |
| 24 | Staff accounts | page `#staff-accounts` | src/screens/StaffAccounts.jsx; src/styles/staff.css | menu → Admin | admins | v0.70, v0.76, v0.83, v0.84 | docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html §2, §8 | supabase/SETUP.md SQL snippets (v0.70) |
| 25 | Staff row ⋯ menu | menu / phone sheet | src/screens/StaffAccounts.jsx:126-131, 227-237 | ⋯, row click or Enter | admins | v0.70, v0.76 | docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html §3 | none |
| 26 | Reset password (1 "Confirm it's you", 2 new password) | dialog | src/screens/staff/ResetPasswordDialog.jsx, src/screens/staff/ConfirmStep.jsx | ⋯ menu | admins | v0.71-74, v0.76, v0.80-81 | docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html §4-6 | SQL snippet |
| 27 | Reset PIN (2 steps) | dialog | src/screens/staff/ResetPinDialog.jsx | ⋯ menu | admins | v0.74, v0.75, v0.78 | docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html §7 | SQL snippet |
| 28 | Settings | page `#settings` | src/screens/Settings.jsx; src/styles/settings.css | menu → Admin | admins; staff see "Only admins can see Settings." | v0.135, v0.605 | docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html S1-S2 | addresses given in chat (v0.135) |
| 29 | Edit school ("Worcester school": address + phone) | dialog | src/screens/settings/SchoolDialog.jsx | row, Enter or pencil | admins | v0.135, v0.605, v0.57, v0.80-81 | docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html S3 + docs/Prospects/Forms-public-diff4-phone-settings.png | none |
| 30 | ErrorBanner / Notice | banner / inline | src/components/ErrorBanner.jsx, src/components/Notice.jsx | any failure | all | 3.5, §7, §8 | — | none |
| 31 | DatePicker (Star owns) | popover (phone: inline) | src/components/DatePicker.jsx, src/components/DatePicker.css | Star date fields only | staff + Star family form | v0.502, v0.503, v0.510 | docs/Testing/Star Testing/TKD-StarTesting-Phase2-Calendar-Mockups.html C1-C4; docs/Testing/Star Testing/TKD-StarTesting-Form-Mockups.html screen 4 | none |

**Who owns Settings → Schools.** The address part is Color Belt phase 2 (v0.135, migration 0005; docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md:69). The phone is from the new-students branch (v0.605, migration 0019; docs/Prospects/STATUS-Forms.md:118).

**Everything on Home (extra task 2)**

| Item | Owner | Where |
|---|---|---|
| Welcome header: logo 40px, "Good morning / afternoon / evening", "Thursday, October 15 · Worcester" ("Worcester and Shrewsbury" on Both). Uses the device clock. | Main | src/screens/Home.jsx:48-56; src/lib/dates.js:6-21 |
| "Today's drawer isn't closed yet." (on Both: "Shrewsbury's drawer isn't closed yet.") + "Close the day ›". The whole line is one button; it opens the Daily report and the Close the day dialog. | Finance | src/screens/finance/HomeReminders.jsx:118-129; src/App.jsx:875-882 |
| Admins: "1 earlier day wasn't closed: Mon, Oct 19." + "Open History ›" + a separate "OK". After OK it reads "1 new earlier day … (21 seen before)." | Finance | src/screens/finance/HomeReminders.jsx:142-212 |
| "Nothing on Home yet. Items appear here as sections are added." Hidden while reminder lines show or are still loading. | Main | src/screens/Home.jsx:67 |

- **Decided but not built:** Star's "Today" card (v0.154 / v0.155).
- **Decided to add nothing:** Testing phase 1 (v0.54); Color Belt private testing ("No Home card for now", docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md:121); Camps ("Home tile" deliberately not built, docs/Camps/TKD-Camps-Build-Plan.md:27).
- **Nothing found** for Schedule, Calendar, Forms, Prospects or Black Belt.

**Rail and bottom bar (extra task 4)** — src/components/navItems.js:34-43

- **Rail order:** Home `ti-home` · Testing `ti-certificate` · Camps `ti-tent` · Schedule `ti-clock` · Calendar `ti-calendar-month` · Forms `ti-clipboard-text` · Prospects `ti-address-book` (badge) · Finance `ti-report-money`.
  - With the Star switch on, Testing's hover menu lists Color belt testing (`ti-certificate`) and Star testing (`ti-star`).
  - Finance is removed everywhere while Hide private details is on.
- **Phone bar:** Home · Calendar · Prospects · More (`ti-menu-2`).
- **More sheet:** Testing, Camps, Schedule, Forms, Finance, then a Cancel row. More is highlighted while one of those is open.
- **Not in the nav:** Staff accounts and Settings are reached only from the account menu.
- **Black Belt** is not in the nav or the hover menu. It's a "Black Belt testing ›" link inside Testing (src/screens/Testing.jsx:55-60, 306-319).

### Part B — How my area does each job

**Shared components and who imports them (extra task 1)**

| Component | Imported by |
|---|---|
| Shell, Toast, PreviewBanner | src/App.jsx only |
| Rail, TopBar, BottomBar | src/components/Shell.jsx |
| RailMenu | src/components/Rail.jsx |
| AccountMenu, LocationSwitcher | src/components/TopBar.jsx |
| navItems | src/App.jsx (showFinanceInNav), src/components/Rail.jsx, src/components/BottomBar.jsx |
| AccountDialog | src/screens/ChangePinDialog.jsx, src/screens/ChangePasswordDialog.jsx |
| Avatar | src/components/AccountMenu.jsx, src/screens/LockScreen.jsx, src/screens/SetPinScreen.jsx, src/screens/staff/ConfirmStep.jsx |
| PinEntry | src/screens/LockScreen.jsx, src/screens/SetPinScreen.jsx, src/screens/ChangePinDialog.jsx; Keypad only: src/screens/staff/ResetPinDialog.jsx |
| Logo | src/screens/Home.jsx, src/screens/SignIn.jsx, src/screens/forms/ShareDialog.jsx, src/screens/testing/event/RegistrationLinkDialog.jsx, src/screens/testing/star/event/StarFlyer.jsx |
| Belt | Color Belt only: src/screens/testing/BeltPicker.jsx, src/screens/testing/RankRows.jsx, src/screens/testing/RankDialog.jsx, src/screens/testing/event/StudentDialog.jsx, src/screens/testing/private/PrivateDialog.jsx |
| DatePicker | Star only: src/screens/testing/star/events/StarEventDialog.jsx, src/screens/testing/star/candidates/StarPaymentDialogs.jsx, src/screens/testing/star/candidates/PrivateDialog.jsx, src/screens/testing/star/candidates/CandidateDialog.jsx; src/star-register/DobField.jsx |
| Dialog | Settings 1, Staff 2, Color Belt 16, Star 13 (including the StarFormDialog wrapper), Black Belt 18, Camps 6, Forms 5, Schedule 4, Calendar 3, Prospects 3, Finance 3 |
| RowMenu | src/components/BottomBar.jsx, src/screens/StaffAccounts.jsx; Color Belt 4, Star 3, Black Belt 5, Camps 3, Prospects 3, Calendar 2, Forms 2, Schedule 2, Finance 1 |
| IconButton | src/screens/Settings.jsx, src/screens/StaffAccounts.jsx, src/components/ErrorBanner.jsx; Color Belt 5, Star 4, Black Belt 7, Camps 6, Finance 2, Forms 1. placeTip only: src/screens/testing/BeltPicker.jsx, src/screens/testing/event/GradingTab.jsx, src/screens/testing/private/PrivateGradingPage.jsx, src/blackBelt/staff/parts/Grip.jsx |
| ErrorBanner | src/screens/Settings.jsx, src/screens/StaffAccounts.jsx; Color Belt 5, Star 6, Black Belt 11, Camps 4, Finance 3, Forms 2, Calendar 1, Schedule 1, Prospects 1 |
| Notice | about 85 files: nearly every dialog, the account screens, and the public src/forms/FormsApp.jsx |

**Places that built their own instead of using the shared one**
- **Logo:** the public pages each have their own `<img>` — src/forms/parts.jsx:14, src/register/parts.jsx:14, src/camp/parts.jsx:17, src/star-register/Header.jsx:13, src/blackBelt/form/parts.jsx:19 — plus src/screens/kiosk/KioskApp.jsx:153.
- **Belt:** the public form has a copy, src/register/BeltPicture.jsx:3.
- **Dialog:** src/blackBelt/staff/parts/InnerDialog.jsx is a copy without the history step; src/screens/camps/CampRoster.jsx:119-123 is its own `role=dialog` portal.
- **RowMenu:** src/screens/calendar/ShowMenu.jsx:8 is a copy; src/screens/testing/star/grading/PickerSheet.jsx is its own sheet.
- **IconButton:** the page-header ⋯ in src/screens/Calendar.jsx:625-634, src/screens/Schedule.jsx:105-113 and src/screens/Prospects.jsx:723-724 is a plain `.icon-button` with no tooltip.

**Shared pieces that live in section folders**
- src/screens/testing/events/ConfirmDeleteDialog.jsx is used by Color Belt and Camps.
- src/screens/testing/DeleteDialog.jsx is used by Color Belt and Star.
- Black Belt uses src/screens/finance/usePaymentsHidden.js.
- Dialog, RowMenu and ErrorBanner take their words from src/screens/testing/text.js (src/components/Dialog.jsx:41, src/components/RowMenu.jsx:24, src/components/ErrorBanner.jsx:16).

**Hide private details (extra task 3)**

| Where | What it hides or does |
|---|---|
| Account menu row (src/components/AccountMenu.jsx:321-334) | Anyone can flip it; it changes at once and the menu stays open. Saved per device under the old key `tkd.device.hidePayments` (src/lib/privateDetails.js:35). |
| Top-bar chip (src/components/TopBar.jsx:23-28) | "Private details hidden" (icon only on phones); tapping it turns the switch off. |
| App / nav (src/App.jsx:918-928, 956-957) | Finance leaves the rail and More; any `#finance…` address goes to Home. |
| Home (src/screens/Home.jsx:59) | Reminder lines keep their text but lose the link. |
| Color Belt (src/screens/testing/events/EventsTab.jsx:102, src/screens/testing/event/EventPage.jsx:193, src/screens/testing/private/PrivateTestingTab.jsx:128, plus dialogs) | Money only (v0.412): one count card, no payment columns or Mark paid, "Payment details are hidden on this tablet." |
| Star (src/screens/testing/star/event/StarEventPage.jsx:130 → src/screens/testing/star/candidates/CandidatesTab.jsx, CandidateRows.jsx, CandidateDialog.jsx, CandidateHistory.jsx, StarCompareDialog.jsx, PrivateDialog.jsx) | Date of birth and email show "Hidden on this tablet"; payment columns and cards hidden. |
| Black Belt (old `usePaymentsHidden`: src/blackBelt/staff/cycle/CyclePage.jsx:114-117, src/blackBelt/staff/candidates/CandidatesTab.jsx:81, src/blackBelt/staff/candidates/CandidateDialog.jsx:480-481, src/blackBelt/staff/receipt/ReceiptDialog.jsx:53-121) | Date of birth and email show "Hidden on this device"; Add candidate blocked; no receipt. |
| Not used at all | Camps, Prospects, Calendar, Forms, Schedule, Staff accounts, Settings |

**Job rows**

| Job | Where | How it works | Exact words | Icons | Component |
|---|---|---|---|---|---|
| J1 | Staff accounts | `.clist` list, max 880px wide. Row: name · email (gray, cut off with …) · one tag · ⋯. Your own row says "(you)" and has no ⋯. Rows are 40px with a mouse, 56px on touch. Phone: name above email. The row whose menu or dialog is open gets a blue tint. ↑ ↓ move between rows. | "Admin" / "Staff" / "Shared", "(you)" | ti-dots | src/components/IconButton.jsx, src/components/RowMenu.jsx, src/lib/useRowArrowNav.js; src/screens/StaffAccounts.jsx:161-225 |
| J1 | Settings | `.clist` list in a 720px page. Row: name (144px column) · address + "Phone: …" · pencil. A missing address shows an amber line. Rows 40px, 48px on touch; stacked on phones. | "No address yet. Family pages show only the school name.", "No phone yet" | ti-edit, ti-alert-triangle | src/components/IconButton.jsx; src/screens/Settings.jsx:166-210 |
| J2 | Staff | Clicking the row or pressing Enter opens its ⋯ menu; there is no detail view (v0.76 exception). | screen-reader hint "Opens Reset password and Reset PIN." | — | src/screens/StaffAccounts.jsx:103-106, 195 |
| J2 | Settings | Row click, Enter or the pencil opens the dialog. | "Edit Worcester school address" | ti-edit | src/screens/Settings.jsx:141-147, 197-205 |
| J3 | Staff, Settings | None; no page-header button on purpose (src/screens/StaffAccounts.jsx:8). | — | — | — |
| J7 | Staff row | RowMenu: a 200px dropdown under ⋯ (flips upward near the bottom). Phone: a sheet with the name, "email · Shared front desk" and a Cancel row. Esc or Tab puts focus back on ⋯. | "Reset password", "Reset PIN", "More actions for {name}" | ti-password, ti-key | src/components/RowMenu.jsx |
| J7 | Phone More | RowMenu, always as a sheet. | "More", "Cancel" | ti-menu-2 | src/components/BottomBar.jsx:60-73 |
| J7 | Account menu | Its own menu, not RowMenu. Phone: sheet with a dimmed background and grab handle; swiping down more than 60px closes it. Tab, Esc, a click outside or Back close it. | "Lock now", "Change PIN" / "Set PIN", "Change password", "This device", "Hide private details", "Admin", "Staff accounts", "Settings", "Sign out" | ti-lock, ti-key, ti-password, ti-map-pin, ti-check, ti-currency-dollar-off, ti-user-cog, ti-settings, ti-logout | src/components/AccountMenu.jsx |
| J8 | Top bar | Radio group; changing school clears the toast and goes through the leave guard. This device offers Worcester / Shrewsbury only (no Both) and also moves the switcher. | "Worcester", "Shrewsbury", "Both" | ti-map-pin | src/components/LocationSwitcher.jsx; src/App.jsx:584-598, 987-994 |
| J8 | Staff, Settings | The switcher is shown but ignored. | — | — | src/screens/StaffAccounts.jsx:14; src/screens/Settings.jsx:16 |
| J8 | Home | On Both: one drawer line per school, one combined earlier-days line. | — | — | src/screens/finance/HomeReminders.jsx:121-134 |
| J8 | Search / filter / sort | None; the top bar has no search. | — | — | src/components/TopBar.jsx:2-4 |
| J10 | — | No confirm dialogs in my area. Reset password shows a warning line instead; Sign out has no confirm. | "{name} will be signed out on every device. Save the new password before you continue — it won't be shown again." | — | src/screens/staff/text.js:58-61 |
| J11 | All sections | One toast for the whole app: bottom-right (phones: bottom-center), 5 s, pauses on hover or focus, a new toast replaces the old one. It is cleared when the section or school changes, the screen locks, or an account dialog opens. | "PIN set", "PIN changed", "Password changed" (with check icon); "Password reset for {name}. Signed out on {n} devices.", "PIN reset for {name}. Works on every device now.", "School saved" (no icon) | ti-check, ti-arrow-back-up | src/components/Toast.jsx; src/App.jsx:133-137, 559-589 |
| J12 | Load failure | ErrorBanner with Retry and no Dismiss. Settings also shows it above a kept, older list. | "Couldn't load staff accounts. Check the connection." vs "Couldn't load the schools. Check the connection, then retry." | ti-alert-triangle, ti-refresh | src/components/ErrorBanner.jsx |
| J12 | Dialog save failure | Notice in `.tdialog-note`: under the buttons on PC/tablet, above the full-width button on phones. | "Couldn't reset the password. Nothing was changed. Try again."; "Couldn't save. Check the connection, then try again."; "Someone else changed this just now. Your change wasn't saved. Cancel, then open it again to see the latest." | ti-alert-triangle | src/components/Notice.jsx |
| J12 | Account screens | Error under the field, or above the buttons; Sign in has a single slot; Lock screen shows it above the dots. | "That PIN didn't match. 3 tries left before your password is needed." | ti-alert-triangle | src/components/Notice.jsx |
| J12 | Locked on the server | Settings locks the screen (src/screens/Settings.jsx:48). Staff accounts shows the "Only admins…" line instead, because App passes it no onNoAccess (src/App.jsx:1141-1148). | — | — | — |
| J12 | Offline | No offline bar. Home reminders quietly keep their last answer; the lock message is retried every 30 s. | — | — | src/screens/finance/HomeReminders.jsx:60-61; src/App.jsx:533-557 |
| J13 | Home | Centered gray line, no action, no loading skeleton. | (as above) | — | src/screens/Home.jsx:67 |
| J13 | Staff, Settings | Gray skeleton rows (3 for Staff, 2 for Settings) and hidden "Loading…" text. Staff decides "admin only" from the database's answer; Settings from `profile.role`. | "Loading staff accounts" / "Loading Settings"; "Only admins can see …" | — | `.tskeleton` (src/styles/testing.css) |
| J16 | Settings | One part, "Schools". Dialog fields: Street address, City, State (made uppercase as you type), ZIP code, "Phone (optional)". Checked as you type; Save is gray when invalid; Save with no changes just closes. | "Details for the whole school. Admins only.", "Leave all four empty to show just the school name.", "Save" / "Saving…" | ti-settings, ti-check | src/components/Dialog.jsx; src/screens/settings/SchoolDialog.jsx |
| J16 | Account menu | Per-device settings: This device (one tap) and Hide private details (instant switch). | — | ti-map-pin, ti-currency-dollar-off | src/components/AccountMenu.jsx |
| J16 | Note | Other sections keep their settings inside the section: Finance → Settings tab, Star Rubrics, Calendar Event types, Prospects statuses, Black Belt Rubric. | — | — | src/lib/pageAddress.js:21-24 |
| J17 | Shared DatePicker | Only Star uses it. Every other date field is the browser's `<input type="date">`: src/screens/testing/events/EventDialog.jsx:306, src/screens/testing/event/PaymentDialogs.jsx:204, src/screens/testing/private/DayTimeFields.jsx:57, src/screens/camps/PaymentDialogs.jsx:249, src/screens/camps/sections/TimesSection.jsx:45, src/screens/finance/DayReport.jsx:507, src/screens/finance/ExportDialog.jsx:113, src/screens/calendar/EventDialog.jsx:188, src/screens/calendar/ClosureDialog.jsx:144, src/screens/schedule/PlanDialog.jsx:114, src/screens/prospects/Dialogs.jsx:98, src/screens/prospects/ProspectPanel.jsx:259, src/screens/forms/FormFields.jsx:122, src/blackBelt/staff/parts/DateField.jsx:17. v0.502 accepted that "Color Belt would still differ". | "Choose…" | ti-chevron-down / ti-chevron-up | src/components/DatePicker.jsx |
| J22 | Staff, Settings | Pages opened from the account menu: no rail highlight, tabs, back link or header button; `.ptitle` 20px. The gray line under the title uses a different class and size on each page: `.sa-sub` 13px (src/styles/staff.css:31), `.st-sub` 12px (src/styles/settings.css:18), Testing's `.psub` 12px. | "Reset a password or PIN when someone forgets it." | — | — |
| J22 | Home | Welcome header only; no page title or actions. | — | — | src/screens/Home.jsx:48-56 |
| J22 | Sign in / Lock / Set PIN | Centered card outside the dashboard frame; no switcher. | — | ti-lock | `.center-screen` |
| J22 | Browser history | Each page is a history step; each dialog adds one; Back closes the account menu first; Back does nothing while locked. Tab titles read "{Section} · U.S. Taekwondo Center". | — | — | src/App.jsx:104-125, 752-852 |
| J24 | src/components/Dialog.jsx (Reset password/PIN, Edit school) | Esc, backdrop click, ← and browser Back all ask to close. If something was typed, the amber note shows (phones add "Discard changes"). On a phone, ← on step 2 goes back to step 1 and keeps what was typed. | "Unsaved changes. Save or cancel first." | ti-arrow-left | src/screens/staff/ResetPasswordDialog.jsx:71-82; src/screens/Settings.jsx:95-100 |
| J24 | src/components/AccountDialog.jsx (Change PIN / password) | Esc and browser Back cancel at once and lose what was typed; a backdrop click does nothing; no unsaved note. | — | ti-arrow-left | src/components/AccountDialog.jsx:53-83, 131-135 |
| J24 | Screen locks with a dialog open | Staff closes the menu and dialog, typing lost (src/screens/StaffAccounts.jsx:65-70). Settings hides the dialog and brings it back with the typing (src/screens/Settings.jsx:58-63). Account dialogs close (src/App.jsx:443). | — | — | — |
| J24 | Leaving a page | `guarded()` asks before rail, bottom bar, switcher, Staff accounts, Settings or Sign out while a Testing page has unsaved grading. | — | — | src/App.jsx:666-677, 985-1001 |
| J24 | Focus after a dialog | The shared src/lib/quietFocus.js (no focus ring after a tap) is used only by Star src/screens/testing/star/RubricsTab.jsx:188, and its CSS exists only in Star (src/screens/testing/star/star.css:699). | — | — | — |
| J23 | — | Not found: changes are logged in the database, but there is no history view. | — | — | — |

### Part C — Rulebook mismatches noticed in passing

- **Icon not in the map:** `ti-currency-dollar-off` (src/components/AccountMenu.jsx:331, src/components/TopBar.jsx:25) is missing from §2.4. Rule at line 193: new icons go in the map before use. docs/Finance/TKD-Finance-Status.md:102 already lists this as to-do.
- **`ti-check` used as a "chosen" mark** in This device (src/components/AccountMenu.jsx:314). §2.4 line 116 says save/done only. src/screens/calendar/ShowMenu.jsx:21 does the same.
- **Account dialogs have no unsaved-changes guard** (src/components/AccountDialog.jsx:62-64, 78-83). This goes against §6 / v0.46 (line 303) and v0.83(4) (line 482). v0.82 only exempts where their messages sit. A backdrop click also behaves differently from src/components/Dialog.jsx:197-199.
- **Settings ignores the location switcher** (src/screens/Settings.jsx:16) with no recorded exception to rule 3.3. Staff accounts has one (v0.76).
- **Top-bar search missing.** Rule 3.2 (line 213) calls for it once a section has something to search. Prospects (src/screens/Prospects.jsx:735) and Camps (src/screens/camps/CampRoster.jsx:511) now have their own search boxes.
- **Offline bar missing.** Rule 3.5 (line 232): no match anywhere in `src`; only Star grading has its own (src/screens/testing/star/grading/useStarGradingSaves.js:407).
- **Shortcuts can't be turned off.** Rule 3.6 (line 235) says Settings can do it; Settings has no such switch.
- **Section heading size.** §7 (line 339) says 16px. Settings "Schools" is 13px (src/styles/settings.css:24-28); the approved mockup draws 14px (docs/Dashboard Docs/TKD-Settings-Schools-Mockups.html:215).
- **Hidden-value wording differs.** v0.507 wants the same words everywhere ("Hidden on this tablet"), but Black Belt says "Hidden on this device" (src/blackBelt/staff/text.js:607).
- **Switch scope.** v0.506 (line 673) says it hides date of birth, email and payments on every screen. Camps payment amounts (src/screens/camps/text.js:514) and Prospects parent email (src/screens/prospects/ProspectPanel.jsx:134) don't follow it.
- **Header ⋯ buttons.** Calendar, Schedule and Prospects use 20px icons with no tooltip (src/screens/Calendar.jsx:625-634 and the others above). Rules 1.4 and 4 require the tooltip; §2.2 says 16px icons in buttons.
- **Stale rulebook text:**
  - Rule 1.3 (line 51) says the phone bar is "4 + More"; v0.236 and the code use 3 + More.
  - §9 (lines 386-393) has no Schedule, Calendar, Forms or Prospects rows.
  - 10b "Not built yet | Staff accounts, Settings" (line 433) isn't marked superseded.
  - v0.508 lists "320px cuts off Both" as open (line 675), but src/styles/finance.css:1087-1099 already fixes it.
- **Stale docs.** docs/README.md lines 56, 61 and 65-68 still say these screens are "later" or "not approved to build"; docs/Dashboard Docs/TKD-Dashboard-Handoff.md:91 still says Staff accounts and Settings are to be designed.
- **This device "saves and closes"** (v0.26(2), line 749). The code closes only the school list; the menu stays open (src/components/AccountMenu.jsx:193-197). The rule's intent is ambiguous.
- **Small drift:**
  - "Wait a minute" (src/screens/ChangePinDialog.jsx:30) vs "Wait a few minutes" (src/screens/staff/text.js:42) for the same rate limit.
  - Unavailable buttons: native `disabled` (src/screens/SignIn.jsx:94, src/screens/ChangePinDialog.jsx:162) vs aria-disabled + gray (v0.57; src/screens/staff/ConfirmStep.jsx:84-88).
- **Shared styles living in section stylesheets** (ownership, not a rule breach):
  - `.nav-badge` in src/styles/prospects.css:1326.
  - The chip, menu switch and Home lines in src/styles/finance.css (901 / 726 / 815).
  - `.menu-group-label` in src/styles/staff.css:15.
  - Dialog, menu and banner styles in src/styles/testing.css.

### Part D — Listed in docs as not yet on main / pending

- **Staff accounts:** add, disable and edit name/email/role are still to come. They wait for personal logins (v0.70, v0.84; 10b line 424; docs/Dashboard Docs/TKD-Staff-Accounts-Build-Plan.md:226).
- **Settings:**
  - Keyboard shortcuts on/off (§3.6, §6 line 301).
  - Moving Classes and ranks into a school-wide Settings is planned but not decided (docs/Testing/Color Belt Testing/TKD-ColorBelt-Status.md:94; docs/README.md:63).
- **Home:** Star's "Today" card is Phase 7 of docs/Testing/Star Testing/TKD-StarTesting-Remaining-Build-Plan.md (lines 62-68, touches src/screens/Home.jsx). Its amber proposals are still open.
- **Nav:**
  - Black Belt moves into the Testing chooser, hover menu and `#testing/black-belt` at step C2, waiting for Star's chooser (src/screens/Testing.jsx:55-58; v0.917). That touches src/components/navItems.js and src/lib/pageAddress.js.
  - The Star switch `VITE_STAR_TESTING` goes on at Star go-live (docs/Testing/Star Testing/TKD-StarTesting-Remaining-Build-Plan.md:79-86).
- **No plan found:** top-bar search, notifications (`ti-bell`), the offline bar.
- **Icon map:** add `ti-currency-dollar-off` (docs/Finance/TKD-Finance-Status.md:102).
- **Interim rules:** the shared desk account gives way to personal logins once the school domain exists (§5 line 263; docs/Dashboard Docs/TKD-Dashboard-Handoff.md:90). Roles question 10.5 is still open.
- **Before daily use (docs/Dashboard Docs/TKD-Dashboard-Handoff.md:85-87):** upgrade Supabase to Pro, add the Grandmaster as a second admin, set This device on every school device. The last one matters for Camps payments (v0.708).
- **Known issue:** Start preview.bat says PIN 1234; the real preview PIN is 2580 (CLAUDE.md; src/components/PreviewBanner.jsx:7 is correct).
