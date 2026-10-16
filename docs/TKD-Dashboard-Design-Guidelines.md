# TKD Dashboard — Design Guidelines

**School:** Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.) — Worcester and Shrewsbury, MA
**Version:** 0.29 (draft) · **Last updated:** 2026-10-15
**Status:** Design outline only. Nothing in this document authorizes building or deploying.

> **How to use this file:** Upload it at the start of any chat about the dashboard. Every screen, component, or feature built for the dashboard must follow the rules below. If a request conflicts with a rule, flag the conflict before building. Rules marked **(provisional)** depend on an open decision in section 10.

---

## 0. Process rules (apply to all work)

| ID | Rule |
|----|------|
| P1 | **Show before build.** Every new screen or component is first presented as a visual mockup plus a plain explanation of what it does and how staff use it. |
| P2 | **No deployment without explicit OK.** Nothing gets published, pushed, or deployed until Jeffrey says "OK" for that specific item. Approval of one item does not carry over to others. |
| P3 | **Options come with visuals.** When there's a design choice, each option is shown visually, one decision at a time, with a full description of its trade-offs. |
| P4 | **Update this document.** Any decision that changes a rule gets written here, with the version number bumped and a line added to the changelog (section 11). |
| P5 | **Staff are non-technical.** A new staff member must complete check-in, open a profile, and find a student with no help after a 2-minute walkthrough. Test this with a real staff member before sign-off. |
| P6 | **All three devices, equal priority.** PC, tablet, and phone are all first-class. Every mockup is shown at all three sizes before approval, and a screen is only approved when it works on all three. |
| P7 | **Build one section at a time.** The dashboard starts from scratch as a minimal shell (navigation, top bar, location switcher). **No sections are planned in advance — a section is added only when Jeffrey says so.** Sections are added and improved one at a time — design, approve, build, use, refine — never several at once. The shell only shows sections that actually exist; empty future sections are not shown as placeholders. |

---

## 1. Core rule — Simple, clean, responsive, easy to use

### 1.1 Simple
- **One job per screen.** Each screen has one primary purpose (e.g. "take attendance"), stated in its page title.
- **Max one primary action per view.** Only one filled (colored) button per screen; everything else is a quiet icon or outline.
- **Show only what's needed now.** Secondary details live behind a `⋯` (more) menu, an expandable row, or the detail panel — never crammed onto the main view.
- **One visible button per action per screen.** The same action never appears as two visible buttons on one screen. Keyboard shortcuts don't count. (The empty-state button replaces the top-bar ＋ on that screen rather than duplicating it.)

### 1.2 Clean
- **Background:** white. **Accent:** school blue — **no more than 5 blue elements visible per screen** (active nav item, primary button, links, selected states). Status tags don't count. Red is not an accent; it appears only on delete/remove actions (section 7).
- **Flat design.** No gradients, heavy shadows, glow, or decorative textures.
- **Thin borders** (1px, light gray) separate content instead of heavy boxes.
- **Whitespace is structure.** Group related items with spacing, not with extra lines or boxes.
- **Consistent alignment.** Everything snaps to the spacing grid (section 7).

### 1.3 Responsive
**Decision (v0.3): optimize equally for PC, tablet, and phone — no primary device.**
- **Same features everywhere.** Every task can be done on every device. Only the layout changes (columns, row height, navigation position) — never what staff can do.
- **Same content order everywhere.** The most important info (name, status, main action) is always first, so it survives the smallest screen.

Layout is based on **screen width**. Touch behavior is based on **input type**, not width (see 2.5) — an iPad in landscape is desktop-width but still a touchscreen.

| Screen | Width | Navigation | Layout |
|--------|-------|------------|--------|
| Desktop (front desk PC) | ≥ 1024px | Left icon rail (52px), labels on hover | Multi-column; tables full width |
| Tablet (mat-side check-in) | 640–1023px | Left icon rail, **labels always shown under icons** (rail widens to 72px) | Two columns max; tables drop low-priority columns |
| Phone | < 640px | Bottom bar with labels always shown. Up to 5 sections fit; once there are more, the bar shows 4 + **More** | Single column; table rows become stacked cards |

- No horizontal scrolling on any screen size.
- Columns dropped on smaller screens must still be reachable (tap row → detail panel).

### 1.4 Easy to use
- Plain-language labels: "Check in", not "Register attendance event".
- Every icon has a **tooltip on hover and on keyboard focus** (desktop) and a **visible text label** on touch screens and wherever there is room (see 2.3).
- **Undo vs. confirm** — one rule, used everywhere:

| Type of action | Behavior | Examples |
|----------------|----------|----------|
| Reversible | Happens instantly, toast with **Undo** for 5 seconds. **No confirmation.** | Check in/out, edit a field, change status, remove from a class/roster, archive a student |
| Not reversible | **Confirmation dialog** naming exactly what will happen. No Undo. | Permanent delete, bulk actions on 5+ records, any message/email sent to families |

- Errors say what happened and what to do: "That email is already in use. Try another."

---

## 2. Core rule — Small controls, clear icons, save space

### 2.1 No large buttons
- **Standard control height: 32px.** Compact controls: 28px. Nothing **visually** taller than 36px. (This cap is visual size only — it never limits tap area; see 2.5.)
- **No full-width buttons** on desktop or tablet. (Exception: the single submit button on a phone form.)
- Row actions are **icon buttons** (28×28px visual, icon 16px) aligned right in the row.
- **On-screen PIN keypad (decided v0.16):** keys are drawn 36px tall (at the cap); the 8px gaps between keys give each a full 44px tap area without overlap. Touch buttons and the location switcher are drawn 36px tall; fields 32px (36px on phones).

### 2.2 Icon set
- **One icon library only: Tabler Icons, outline style.** Never mix icon libraries or filled/outline styles.
- Icon size: **16px** inside rows and buttons, **18–20px** in the navigation rail. Never larger than 24px.
- Icons inherit text color; the active nav icon uses a **blue tint** (decided v0.6).

### 2.3 Icon rules
- **Icon test:** before an icon is used without a text label, 3 out of 3 staff must name its meaning correctly without help. If any staff member guesses wrong, it gets a visible text label.
- **Same icon = same meaning everywhere.** Use the master map below; never reuse an icon for a different action, and never use two icons for one meaning.
- **Navigation labels (decided v0.4):** on mouse devices the rail is **icon-only by default**. Hovering an icon shows a clear label:
  - Dark, high-contrast label bubble (13px text) directly to the right of the icon, pointing at it.
  - Appears within **150ms** of hover and disappears when the pointer leaves — no slow fade.
  - Hovered icon gets a light gray highlight; the current section keeps its blue tint.
  - The same label appears on **keyboard focus**, and matches the icon's `aria-label` word for word.
  - On touch screens (no hover), labels stay visible under the icons as defined in 1.3.

### 2.4 Master icon map

**Navigation**

Section icons are added to this table only when that section is added (rule P7).

| Meaning | Tabler icon |
|---------|-------------|
| Home | `ti-home` |
| More (phone bottom bar, once needed) | `ti-menu-2` |

**Actions**

| Meaning | Tabler icon |
|---------|-------------|
| Save / done | `ti-check` — used **only** for save/done |
| Add new | `ti-plus` |
| Edit | `ti-edit` |
| Delete | `ti-trash` |
| Undo | `ti-arrow-back-up` |
| Close / cancel | `ti-x` |
| Back | `ti-arrow-left` |
| More actions | `ti-dots` |
| Expand / collapse | `ti-chevron-down` / `ti-chevron-up` |
| Search | `ti-search` |
| Filter | `ti-filter` |
| Sort | `ti-arrows-sort` |
| Print | `ti-printer` |
| Export | `ti-download` |
| Retry | `ti-refresh` |
| Notifications | `ti-bell` |
| Lock now / locked state | `ti-lock` |
| Sign out | `ti-logout` |
| Change PIN | `ti-key` |
| Change password | `ti-password` |

**Objects**

| Meaning | Tabler icon |
|---------|-------------|
| Single student / profile | `ti-user` |
| Location (Worcester / Shrewsbury) | `ti-map-pin` |
| Unsaved / error | `ti-alert-triangle` |
| Staff accounts (admin) | `ti-user-cog` — not `ti-users`, which is kept free |
| Settings (admin) | `ti-settings` |

New icons get added to this map **before** they're used.

### 2.5 Touch screens (input-based, not width-based)
Detect touch with the CSS `pointer: coarse` media query (it's true when the main input is a finger, regardless of screen size).
- Icons stay visually small, but every tap area is **at least 44×44px** (invisible padding around the icon).
- List rows are **at least 44px tall** on touch screens (36–40px with a mouse).
- Row actions on touch screens: max **2 visible** + `⋯`, so tap areas don't overlap.
- No hover-only information — anything shown on hover must also be visible or tappable.

---

## 3. Core rule — Built for speed

### 3.1 Fewer steps
- **Any common task in ≤ 3 clicks/taps** from where the user lands. Each section defines its common tasks when it's added.
- **Inline actions.** Check-in, quick edits, and status changes happen directly in the list row — no separate page.
- **Smart defaults.** Today's date, the current class, and the device's location are pre-selected.
- **No unnecessary confirmations.** Follow the Undo-vs-confirm table in 1.4.

### 3.2 Find anything fast
- **Global search bar** in the top bar on every screen **once at least one section has something to search** (decided v0.12). Searches across every section that exists.
- Results appear as you type (after 2 characters), no Enter needed.

### 3.3 Location switcher
- A **Worcester | Shrewsbury | Both** toggle sits in the top bar on every screen and filters everything on the page. The active location is always visible.
- **Default location is stored per device**, not per user — the Shrewsbury tablet always opens on Shrewsbury, no matter who signs in on it.
- **Both** is for combined views (e.g. a joint event where both schools share the room). Every record shows its school when Both is on.
- **Exception (decided v0.16):** the sign-in and lock screens have no location switcher — they show no school data.
- In **Both** mode, check-in requires picking a specific class (which belongs to one location) — no location-less check-ins.

### 3.4 Speed targets
Measured on the **front-desk PC over the school's Wi-Fi**:
- Pages show content (or a gray placeholder skeleton) within **1 second**.
- Search results within **0.5 seconds** of typing.
- Lists over 50 rows load in pages or as you scroll — never all 317+ students at once.

### 3.5 Saving and failures
- Saves happen in the background; the screen never freezes waiting on the server.
- **A failed save is never silent.** The row is marked unsaved (`ti-alert-triangle`, amber) and an error banner stays on screen with **Retry** until it succeeds or is dismissed. Error messages **never auto-close**.
- **Offline:** a visible "Offline — changes will sync when reconnected" bar appears. Check-ins made offline are queued and sent when the connection returns; nothing is discarded.

### 3.6 Keyboard shortcuts (desktop)
Shortcuts only work when the cursor is **not** in a text field, and can be turned off in Settings.

| Key | Action |
|-----|--------|
| `/` | Focus search (once search is shown) |
| `N` | Add new (context-aware, once add-new is shown) |
| `Esc` | Close panel / cancel |
| `↑ ↓` + `Enter` | Move through and open list rows |

---

## 4. Accessibility

Target: **WCAG 2.1 AA** (the standard accessibility checklist for websites).
- Every icon-only button has an `aria-label` (the hidden text name a screen reader announces), matching its tooltip.
- **Visible focus ring** (2px, school blue) on whichever control the keyboard has selected. Never removed.
- Text contrast at least **4.5:1** against its background; icons and **control borders** at least **3:1** (decided v0.26). Control borders = anything you click or type into: text fields, location switcher, PIN dots, keypad keys, secondary buttons. Plain divider lines between areas are decorative and exempt.
- Meaning is **never shown by color alone** — status tags and errors always have text.
- Everything works with keyboard only (Tab, Enter, Esc, arrows).
- Minimum text size 12px (section 7).

---

## 5. Privacy and access (interim, until decision 10.5)

Most records belong to minors, and mat-side screens can be seen by parents.
- **List views and the mat-side tablet never show** date of birth, home address, medical notes, or billing details. Those appear only in the detail panel on staff devices.
- **Login (decided v0.13):** every person has their **own login (email + password)** on every device. No shared staff login. This is what lets the change log record real names.
- **Interim exception (decided v0.27):** one **shared front-desk account** — `shrewsburyustc@gmail.com`, display name "Staff", role **Staff** (not admin) — used by whoever is at the main desk. Desk actions log as "Staff". Replace with personal logins once the school has its own domain and employee emails.
- **Two account levels (decided v0.15):** **Admin** (can manage staff accounts and settings) and **Staff**. What each level can see/edit inside sections is still open (10.5).
- **Devices auto-lock after 45 minutes idle** (decided v0.14 — staff move between class and the office; 10 minutes was too often).
- **Idle time is per account (decided v0.27).** Default 45 minutes. The shared front-desk account is set to **2 hours**, because the desk is always staffed and no student or parent is ever behind it.
- **Unlock (decided v0.14):** the lock screen stays on the signed-in person ("Locked — Jeffrey") and unlocks with that person's **own 4-digit unlock PIN**. The PIN only reopens your own already-signed-in screen; it is not a login. "Not you? Sign out" lets someone else sign in.
  - Full email + password is still required to sign in on a new device, after signing out, and every 7 days.
  - 5 wrong PINs in a row → PIN is disabled for that session and the full password is required.
- **Forgotten password (decided v0.16):** no self-service "reset password" link. The sign-in screen says "Forgot password? Ask an admin to reset it." Admins reset it from Staff accounts.
- **Every change is logged** with who made it and when (visible in the record's history).

---

## 6. Layout framework

```
┌────┬──────────────────────────────────────────────────┐
│    │ [Search… /] [📍 Worcester|Shrewsbury|Both] 🔔 ＋ (JB)│  ← Top bar (48px)
│ I  ├──────────────────────────────────────────────────┤
│ C  │ [Metric] [Metric] [Metric] [Metric]               │  ← Summary strip (optional)
│ O  │                                                   │
│ N  │ ┌───────────────────────────────────────────────┐ │
│    │ │ Main content: list / table / other             │ │  ← Main area
│ R  │ │                                               │ │
│ A  │ └───────────────────────────────────────────────┘ │
│ I  │                                  ┌──────────────┐ │
│ L  │                                  │ Detail panel │ │  ← Slides in from right
│    │                                  └──────────────┘ │
└────┴──────────────────────────────────────────────────┘
```

The diagram shows the full top bar. On day one only the location switcher and the account menu (initials circle) appear (decided v0.12).

- **Icon rail (left):** starts empty. Each section's icon is added when the section is added; order is set by Jeffrey. No placeholder or "coming soon" icons.
- **Top bar (48px):** location switcher and account menu always; search, notifications, and add-new once a section needs them (see below).
- **Only working controls are shown (decided v0.12).** A top-bar control appears only once a section gives it something to do. Day one (Home only): **location switcher + account menu**. Search, notifications (`ti-bell`), and add new (`ti-plus`) each appear when the first section that needs them is added.
- **Account menu (decided v0.15)** — opens from the signed-in person's initials circle, top-right:
  - Everyone: name + email, **Lock now**, **Change PIN**, **Change password**, **This device: [location]** (`ti-map-pin`; sets the per-device default location from 3.3), **Sign out**.
  - Admins only, under an "Admin" label: **Staff accounts** (add, disable, edit email, reset password or PIN) and **Settings** (incl. keyboard shortcuts on/off).
- **Summary strip:** up to 4 small metric cards. Only on section home screens, not on every page.
- **Detail panel:** opening a record slides a panel in from the right so the list stays visible. On phones it becomes a full screen with a back arrow (`ti-arrow-left`).

---

## 7. Color, typography, spacing

### Color

| Role | Color | Hex | Use |
|------|-------|-----|-----|
| Background | White | `#FFFFFF` | Page and panels |
| Surface | Light gray | `#F7F7F5` | Metric cards, table headers |
| Border | Hairline gray | `#E5E5E2` | Dividers between areas (decorative) |
| Control border | Medium gray | `#8F8F8A` | Outlines of fields, switcher, PIN dots, keypad keys, secondary buttons — 3.25:1 on white (decided v0.26) |
| Text | Near black | `#1F1F1F` | Body text |
| Text secondary | Gray | `#6B6B6B` | Labels, hints |
| Brand red | School red | `#FD0000` | School logo only — never used for UI controls or status (measured from logo) |
| Brand blue | School blue | `#003595` | **Primary button** (decided v0.5), links, selected states, focus ring, location switcher (measured from logo, decided v0.7; 10.8:1 contrast on white) |
| Blue hover | Darker navy | `#002A77` | Primary button hover/pressed |
| Blue tint | Pale navy | `#E6EBF4` with `#003595` icon/text | Current section on the rail, selected rows, location switcher active option |
| Success | Green | `#3B6D11` on `#EAF3DE` | "Test-ready", "Paid", "Checked in" |
| Warning | Amber | `#633806` on `#FAEEDA` | "Absent 2+ weeks", "Payment pending", unsaved |
| Delete / remove | Red | `#A32D2D` on `#FCEBEB` | **Deleting or removing only:** delete and remove buttons (including remove from class/roster), their confirmations, trash and remove icons on hover |
| Error | Amber | `#633806` on `#FAEEDA` | Failed saves, form errors, offline bar (shares the warning color, always with `ti-alert-triangle` + text) |

Brand hex codes were measured directly from the school logo file (`Logos/Logo.png`).

Rules:
- Blue (accent) and red (delete/remove) are never used as large filled backgrounds.
- **Primary buttons are blue** (decided v0.5).
- **Red means delete or remove — nothing else** (decided v0.5, confirmed v0.6). If staff see red, something is about to be deleted or removed. This applies even to reversible removals that offer Undo. No red for errors, alerts, branding in the UI, or status tags.
- Status tag priority (section 8) becomes **Warning/Error > Success > Neutral**.
- Dark mode: not required for v1.

### Typography
- **Font:** one sans-serif family (system font stack or Inter). No decorative fonts.
- **Sizes:** page title 20px · section heading 16px · body 14px · table/row text 13px · labels, captions, and tags 12px. **Minimum 12px anywhere.**
- **Weights:** regular (400) and medium (500) only.
- **Case:** sentence case everywhere ("Add student", not "Add Student" or "ADD STUDENT").

### Spacing and shape
- **Spacing grid:** 4px base. Use 4 / 8 / 12 / 16 / 24 / 32px only.
- **Corners:** 8px on controls and cards, 6px on tags. **Exception (v0.29):** dialogs use 12px, as in the approved account-screen mockups.

---

## 8. Component rules

### Lists and tables (the most-used component)
- **Dense rows:** 36–40px with a mouse, 44px+ on touch, with a 1px divider — no card-per-row.
- Columns ordered by importance: **Name → key info → status → actions**.
- Row actions are icon buttons on the right: max **3 visible** with a mouse, **2** on touch, the rest under `⋯`.
- Click anywhere on a row (outside the action icons) to open the detail panel.
- Sortable column headers; a filter icon above the table, not a filter sidebar.

### Status tags
- Small pill, **12px text**, tinted background with matching dark text.
- Max **one tag per row**. When several apply, show the highest priority: **Warning/Error > Success > Neutral**. All statuses are listed in the detail panel.

### Forms
- Labels above fields. Field height 32px (36px on phones).
- Only ask what's required; optional fields are collapsed under "More details".
- Validate as the user types; errors appear under the field.

### Metric cards
- Small icon + label on top, number below. Max 4 in a row.
- Clicking a card opens the filtered list behind it (e.g. a "18" count opens the list of those 18 records).

### Empty states
- One line explaining the space + one action, e.g. "No classes scheduled today" + `＋ Add class`.
- Exception: if there is genuinely no action available (e.g. the empty Home), the line appears alone — no dummy button.

### Toasts and errors
- **Success/Undo toasts:** bottom-right, auto-dismiss after 5 seconds. **Phones: bottom-center, above the bottom bar** (decided v0.29).
- **Error banners:** stay until fixed or dismissed, always include Retry where it applies. Never auto-close.
- No pop-up dialogs for success messages.

---

## 9. Dashboard sections

Sections are added only when Jeffrey says so (rule P7). When one is added, it's recorded here.

| Section | Purpose | Added | Status |
|---------|---------|-------|--------|
| Color Belt testing *(next — not designed yet)* | Jeffrey's stated first section after Home: the existing Color Belt project (school Supabase org, "Color Belt Staging") is merged into the dashboard; its separate Supabase project is then retired. Designed only after Home is built (P7). | 2026-10-15 | Planned — not designed |
| Home | Shows the most important info staff need, quickly — "today at a glance" style (decided v0.10). **Starts empty.** Nothing goes on Home until a section exists to feed it; each new section decides what (if anything) it adds to Home when that section is designed. **Header (decided v0.11):** school logo, time-of-day greeting ("Good evening"), today's date, and active location; stays permanently. **While empty:** one gray line under the header — "Nothing on Home yet. Items appear here as sections are added." — removed once real items exist. | 2026-10-15 | **Mockups approved 2026-10-15** (`TKD-Home-Mockups.html`: sign-in, empty Home, account menu, lock screen at PC/tablet/phone). **Not approved to build** — needs a separate OK (P2). |

---

## 10. Open decisions

To be decided one at a time, each with visual options (rule P3):

1. ~~Brand colors~~ — **Decided v0.7:** logo blue `#003595` for all UI blue; logo red `#FD0000` for the logo only.
2. ~~Primary device priority~~ — **Decided v0.3:** PC, tablet, and phone optimized equally (rules P6 and 1.3).
3. ~~Home screen metrics~~ — removed v0.9 (no sections are planned in advance).
4. ~~Navigation labels~~ — **Decided v0.4:** icon-only rail, clear label on hover/focus (rule 2.3).
5. **Roles and access** — *Login part decided v0.13:* personal login (email + password) for each person. *Decided v0.15:* two levels, Admin (manages staff accounts and settings) and Staff. **Still open:** what each level can see/edit inside each section. (Section 5 is the interim rule.)
6. ~~Primary button color~~ — **Decided v0.5:** blue for primary actions; red reserved for delete/remove only (confirmed v0.6).
7. ~~Current-section marker on the rail~~ — **Decided v0.6:** blue tint.
8. ~~Unlock after auto-lock~~ — **Decided v0.14:** personal 4-digit unlock PIN; idle lock at 45 minutes.

---

## 10b. Build plan (decisions so far)

| Item | Decision |
|------|----------|
| Platform (decided v0.17) | **Supabase** (Postgres database + built-in Auth) for data and logins; screens served from **Cloudflare Pages**. Chosen for the long term: row-level security for the future parent app, maintained login security, Postgres for billing/reporting. Cost once live: Pro is $25/month per organization plus compute for each project (~$10/month each; the plan's $10 credit covers one). With Color Belt staging also in the org: **≈ $35/month**, or ≈ $25/month if that project is paused or removed. **Plan:** Color Belt is merged into the dashboard and its separate project retired → ≈ $25/month long-term. |
| PIN unlock | Custom-built on top of Supabase Auth (Supabase has no PIN feature). |
| Account ownership (decided v0.18) | The dashboard goes in the **school's existing Supabase organization** (school-owned, not personal). Build and test on the free plan; upgrade to Pro only when staff use it daily. Jeffrey may pay at first; billing switches to the school by swapping the card on the organization. |
| Checks (2026-10-15) | Supabase org "U.S Taekwondo Center" (school email): **Free plan, 1 existing project** (Color Belt staging) — dashboard becomes the 2nd and last free project; a 3rd needs Pro. School GitHub account **created**. Owner role on the Supabase org **confirmed**. All pre-build checks done. |
| Code repository (decided v0.19) | Private **GitHub** repository on a **school-owned** GitHub account/organization; Jeffrey is an admin. The school owns the code. Used from both the school laptop and Jeffrey's home PC. |
| Web address (decided v0.20) | Start on the free Cloudflare Pages address (`*.pages.dev`). When the school's planned new domain exists, add `dashboard.<new-domain>` as a custom domain (no rebuild; old address can run alongside for a transition period). |
| Account emails (decided v0.20) | Supabase, GitHub, and Cloudflare use the current school email for now. When the new domain has email: add the new address as a second Owner on each service, then remove the old one (never zero owners). On GitHub this works only if the school account is a GitHub **organization**; if it's a plain user account, add the new email, make it primary, and remove the old one instead. **Confirmed:** the school GitHub (`shrewsburyustc`) is a **user account**, so use the change-email route. Optional: create a free GitHub organization from it and add Jeffrey's personal GitHub as co-owner (no shared password). |
| Staff login emails | Admins must be able to edit a staff member's email in Staff accounts (password and PIN unchanged) — required feature when Staff accounts is designed. |
| First admin account (decided v0.23) | Created in the **Supabase dashboard** (Authentication → Users → Add user), then the staff table's `role` set to `admin`. No setup screen or script. Jeffrey is the first dashboard admin; the grandmaster is added as a **second admin** immediately after, so nobody is ever locked out. Dashboard admin is separate from the Supabase organization Owner (the school account). |
| Supabase access (recommended) | Invite Jeffrey's personal email to the school Supabase org as **Administrator** from the Team tab, so he has his own login instead of sharing the school password. The school account stays Owner. **Check first:** the 2-free-project limit counts every org where a person is Owner or Administrator — if Jeffrey's personal Supabase account already has active free projects, the invite may hit that limit. |
| Frontend (decided v0.25) | **React + Vite**, plain JavaScript (no TypeScript), plain CSS, Tabler icons. Code lives in `C:\Users\shrew\projects\tkd-dashboard` (outside OneDrive). |
| Status (v0.25) | **Home built locally** (build OK given 2026-10-15): sign-in, Home, shell, location switcher, account menu (who-line, Lock now, This device, Sign out), lock screen with PIN, 45-min idle lock, 7-day password rule, preview mode. Database migration `0001` + PIN test suite pass. Independent security and design reviews done; fixes applied. **Not deployed** — needs a separate OK (P2). |
| **Server-side lock — DONE (v0.29)** | Migration `0002` is live (2026-10-16). The database refuses data to a locked, PIN-locked, signed-out, magic-link/recovery, or 8-day-old session. **Rule for every future table:** RLS on; policies `to authenticated` using `(select public.has_data_access())` plus the table's own rule; `is_admin()` is never a data gate on its own — always pair it with `has_data_access()`; explicit grants, nothing to `anon`; views `with (security_invoker = true)`; security-definer functions that return data check `has_data_access()` first. |
| Account screens (approved v0.28) | Mockups `TKD-Account-Screens-Mockups.html` approved 2026-10-16: **Set your PIN** (required after the first password sign-in and after an admin reset; two steps, choose + confirm), **Change PIN** (asks for your password first, then choose + confirm), **Change password** (current, new, confirm). Dialog on PC/tablet with a Cancel button (no X); full screen with back arrow on phone. Success = 5-second toast, no Undo (typing twice is the confirmation). |
| PIN and password rules (v0.28) | PIN: exactly 4 digits; refused if all the same digit or a straight run (e.g. 1111, 1234, 4321) — "That PIN is too easy to guess. Choose another." Changing a PIN needs your password first. Password: minimum 12 characters (Supabase setting); the app re-checks the current password before changing it; changing it signs out the account's other devices. |
| Shared desk account (v0.28) | Flagged as a **shared account**: its menu hides Change PIN and Change password. Only the admin changes the desk PIN/password (via Supabase until the Staff accounts screen exists). The desk sets its PIN once, at its first sign-in. |
| Not built yet | Staff accounts, Settings — designed when personal logins arrive (school domain + employee emails). Until then accounts are managed in Supabase. |
| Approved 2026-10-16 (v0.26) | (1) **No PIN set:** when the 45-minute lock (or Lock now) happens to someone without a PIN, there is no lock screen — they are signed out to the sign-in screen with an amber note "Signed out after 45 minutes idle. Set a PIN to unlock faster." (2) **This device:** clicking it expands a Worcester / Shrewsbury choice inside the account menu; one click saves and closes (reversible, so no Save step). Sets the device's default school only; the top switcher still offers Both. (3) **Borders:** control borders use `#8F8F8A` (3:1); dividers stay `#E5E5E2`. Items (1) and (3) are coded with the Set PIN build. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1 | 2026-10-15 | Initial draft: process rules, 3 core rules expanded, layout, color, type, components, scope, open decisions. |
| 0.2 | 2026-10-15 | Independent review fixes: single Undo-vs-confirm rule; touch rules by input type (44px targets); failed-save and offline rules; phone nav defined; icon map split into nav/actions/objects with one meaning per icon; new accessibility (WCAG 2.1 AA) and interim privacy sections; shortcuts disabled while typing; tag size 12px with priority order; per-device default location; primary button set to blue (provisional); testable icon, accent, and speed rules. |
| 0.3 | 2026-10-15 | Decision 10.2 resolved: PC, tablet, and phone optimized equally. Added rule P6 (every mockup shown at all three sizes) and same-features-everywhere rule in 1.3. |
| 0.4 | 2026-10-15 | Decision 10.4 resolved: icon-only rail by default, clear dark label bubble on hover (150ms) and keyboard focus; touch screens keep visible labels. |
| 0.5 | 2026-10-15 | Decision 10.6 resolved: blue primary buttons; red reserved for delete only. Errors moved to amber; school red limited to the logo. New open decision 10.7 (current-section marker color). |
| 0.6 | 2026-10-15 | Decision 10.7 resolved: current section marked with blue tint. Red color-coding confirmed for any delete or remove action (including reversible removals). |
| 0.7 | 2026-10-15 | Decision 10.1 resolved: brand blue set to exact logo navy `#003595` (hover `#002A77`, tint `#E6EBF4`); logo red `#FD0000` recorded for logo use only. Placeholders removed. |
| 0.8 | 2026-10-15 | Added rule P7: build from scratch one section at a time, starting with a minimal shell; scope table is long-term vision only. Home-screen metrics deferred. |
| 0.9 | 2026-10-15 | Removed all pre-planned sections (scope table, nav order, phone bar items, section icons, section-specific examples). Sections are added only when Jeffrey says so. |
| 0.10 | 2026-10-15 | Home added as the first section (brainstorming). Style: "today at a glance" — most important info, quickly. Starts empty; content is added only as other sections are built. `ti-home` added to the icon map. |
| 0.11 | 2026-10-15 | Home empty state decided: welcome header (logo, greeting, date, active location) plus one-line message. Empty-state rule gains a no-action exception. |
| 0.12 | 2026-10-15 | Top bar shows only controls that work. Day one: location switcher + account menu; search, notifications, and add new appear with the first section that needs them. |
| 0.13 | 2026-10-15 | Login decided: personal email + password for each person (part of 10.5; roles still open). Auto-lock unlock method opened as decision 10.8. |
| 0.14 | 2026-10-15 | Decision 10.8 resolved: idle auto-lock changed from 10 to 45 minutes; unlock with a personal 4-digit PIN (password required on new device, after sign-out, every 7 days, or after 5 wrong PINs). |
| 0.15 | 2026-10-15 | Account menu decided (personal + admin). Two account levels: Admin and Staff (part of 10.5). Icons added: `ti-lock`, `ti-logout`, `ti-key`, `ti-password`, `ti-user-cog`, `ti-settings`. Independent review fixes: removed leftover shared-login wording (3.3), top bar line and layout diagram updated, shortcuts `/` and `N` apply only once their controls exist, `ti-map-pin` assigned to "This device". |
| 0.16 | 2026-10-15 | Home mockups approved (design only). Exceptions recorded: PIN keypad keys 36px with 44px tap area; touch control sizes clarified; no location switcher on sign-in/lock screens; no self-service password reset link (admins reset); `ti-lock` also marks the locked state. |
| 0.17 | 2026-10-15 | Build planning started. Platform decided: Supabase (Postgres + Auth) with screens on Cloudflare Pages. New section 10b. |
| 0.18 | 2026-10-15 | Account ownership decided: school's existing Supabase organization; free plan until live; billing handed over later by card swap. |
| 0.19 | 2026-10-15 | Code repository decided: private GitHub repo on a school-owned account; Jeffrey admin. |
| 0.20 | 2026-10-15 | Web address decided: free pages.dev now, school's new domain later. Account emails move to the new domain later via add-owner-then-remove. Staff accounts must support editing email. |
| 0.21 | 2026-10-15 | Pre-build checks recorded: Supabase org on Free with 1 project (room for the dashboard); school GitHub account created; Owner role still to confirm. |
| 0.22 | 2026-10-15 | Owner role on the school Supabase org confirmed; pre-build checks complete. |
| 0.23 | 2026-10-15 | First admin decided: created in the Supabase dashboard, role set to admin; grandmaster as second admin. Build plan complete — awaiting build OK. Independent review fixes: Pro cost corrected to ≈ $35/month with two projects; free-project limit note on the Administrator invite; GitHub org-vs-user note; Staff accounts includes edit email; leftover 2.1 and 10.6 wording fixed. Dashboard admin kept separate from Supabase org Owner. |
| 0.24 | 2026-10-15 | School GitHub confirmed as user account `shrewsburyustc` (optional: convert to org). Color Belt testing named as the next section after Home; its Supabase project merges into the dashboard and is retired (≈ $25/month long-term). |
| 0.25 | 2026-10-16 | Frontend decided: React + Vite. Home built locally and independently reviewed (security + design); not deployed. Hard gate recorded: server-side lock (migration 0002) before any data section. Three items awaiting approval listed in 10b. |
| 0.26 | 2026-10-16 | Approved: no-PIN users are signed out instead of locked; "This device" inline choice in the menu; control borders darkened to `#8F8F8A` (rule 4 vs section 7 conflict resolved). |
| 0.27 | 2026-10-16 | Supabase project `tkd-dashboard` created and migration 0001 applied + verified. Shared front-desk account (role Staff) added as an interim exception to personal logins. Idle lock time made per-account: 45 min default, 2 hours for the desk account. |
| 0.28 | 2026-10-16 | Account screens approved (Set PIN required; Change PIN; Change password). Shared desk account can't change its own PIN/password — admin only. PIN weak-pattern rule and password rules recorded. Staff accounts and Settings deferred until personal logins. Admin account "Main Admin" (jberg412@gmail.com) created. |
| 0.29 | 2026-10-16 | Account screens built and independently reviewed (security + design; fixes applied). Migration 0002 live: server-side lock, per-account idle time, shared-account flag, set_my_pin, staff read rule pairs is_admin with has_data_access. Phone toasts bottom-center; dialogs 12px corners. Still local only — not deployed. |
