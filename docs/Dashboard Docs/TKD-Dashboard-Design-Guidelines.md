# TKD Dashboard — Design Guidelines

**School:** Jae H. Jeong's U.S. Taekwondo Center (U.S.T.C.) — Worcester and Shrewsbury, MA
**Version:** 0.73 (draft) · **Last updated:** 2026-10-17
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
- **Show only what's needed now.** Secondary details live behind a `⋯` (more) menu, an expandable row, or the detail view — never crammed onto the main view.
- **One visible button per action per screen.** The same action never appears as two visible buttons on one screen. Keyboard shortcuts don't count. (The empty-state button replaces the page-header add button on that screen rather than duplicating it.)

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
- Columns dropped on smaller screens must still be reachable (tap row → detail view).

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
| Testing (rail icon; decided v0.39) — also marks **Color belt testing** on the Testing choice page and menu (v0.59) | `ti-certificate` |
| Star testing (Testing choice page and menu; decided v0.59) | `ti-star` |
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
| Go to a page (rows on a choice page; decided v0.59) | `ti-chevron-right` |
| Drag to reorder (grip handle; decided v0.43) | `ti-grip-vertical` |
| Move up / move down (decided v0.43) | `ti-arrow-up` / `ti-arrow-down` |
| Search | `ti-search` |
| Filter | `ti-filter` |
| Sort | `ti-arrows-sort` |
| Print | `ti-printer` |
| Copy (to clipboard, e.g. Copy link; decided v0.72) | `ti-copy` |
| Registration link / QR code (decided v0.72) | `ti-qrcode` |
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
| `N` | Add new — triggers the page-header add button on the current screen (e.g. "Add class"), once one is shown |
| `Esc` | Close dialog / cancel (unsaved changes keep the dialog open — see 6) |
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
- **List views and the mat-side tablet never show** date of birth, home address, medical notes, or billing details. Those appear only in the detail view on staff devices.
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
│    │ [Search… /] [📍 Worcester|Shrewsbury|Both] 🔔  (JB)│  ← Top bar (48px)
│ I  ├──────────────────────────────────────────────────┤
│ C  │ [Metric] [Metric] [Metric] [Metric]               │  ← Summary strip (optional)
│ O  │                                                   │
│ N  │ ┌───────────────────────────────────────────────┐ │
│    │ │ Main content: list / table / other             │ │  ← Main area
│ R  │ │                                               │ │
│ A  │ └───────────────────────────────────────────────┘ │
│ I  │              ┌──────────────────┐                 │
│ L  │              │   Detail view    │                 │  ← Centered dialog over dimmed list
│    │              └──────────────────┘                 │
└────┴──────────────────────────────────────────────────┘
```

The diagram shows the full top bar. On day one only the location switcher and the account menu (initials circle) appear (decided v0.12).

- **Icon rail (left):** starts empty. Each section's icon is added when the section is added; order is set by Jeffrey. No placeholder or "coming soon" icons.
- **Top bar (48px):** location switcher and account menu always; search and notifications once a section needs them (see below). **Add-new buttons are not in the top bar** (decided v0.45) — see Page header.
- **Only working controls are shown (decided v0.12).** A top-bar control appears only once a section gives it something to do. Day one (Home only): **location switcher + account menu**. Search and notifications (`ti-bell`) each appear when the first section that needs them is added.
- **Page header add button (decided v0.45):** the add-new action for a screen is a **labeled primary button in the page header**, to the right of the page title (e.g. "+ Add class" with `ti-plus`; "+ Add event" on the Events tab). It says exactly what it adds. On PC the `N` key triggers it. This replaces the earlier plan for a single ＋ in the top bar.
- **Account menu (decided v0.15)** — opens from the signed-in person's initials circle, top-right:
  - Everyone: name + email, **Lock now**, **Change PIN**, **Change password**, **This device: [location]** (`ti-map-pin`; sets the per-device default location from 3.3), **Sign out**.
  - Admins only, under an "Admin" label: **Staff accounts** (add, disable, edit email, reset password or PIN) and **Settings** (incl. keyboard shortcuts on/off).
- **Summary strip:** up to 4 small metric cards. Only on section home screens, not on every page.
- **Detail view (decided v0.46, replaces the slide-in panel):** opening or editing a record opens a **centered dialog** (12px corners) over the dimmed list, with Save + Cancel (or Close when view-only); on phones it's a full screen with a back arrow (`ti-arrow-left`). It shows every field, including columns dropped on smaller screens. **Unsaved changes:** if someone has typed changes and presses Esc, clicks outside the dialog or uses the back arrow, the dialog stays open with an amber note "Unsaved changes. Save or cancel first." — nothing typed is silently lost. Elsewhere in this document, "detail panel" means this detail view. (May be revisited for large records such as a student profile.)

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
- Click anywhere on a row (outside the action icons) to open the detail view.
- Sortable column headers; a filter icon above the table, not a filter sidebar.

### Status tags
- Small pill, **12px text**, tinted background with matching dark text.
- Max **one tag per row**. When several apply, show the highest priority: **Warning/Error > Success > Neutral**. All statuses are listed in the detail view.

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
- **Success/Undo toasts:** bottom-right, auto-dismiss after 5 seconds. **Phones: bottom-center, above the bottom bar** (decided v0.29). **The 5-second timer pauses while the pointer is over the toast or keyboard focus is on its Undo button** (decided v0.54, WCAG timing).
- **Error banners:** stay until fixed or dismissed, always include Retry where it applies. Never auto-close.
- No pop-up dialogs for success messages.

---

## 9. Dashboard sections

Sections are added only when Jeffrey says so (rule P7). When one is added, it's recorded here.

| Section | Purpose | Added | Status |
|---------|---------|-------|--------|
| Color Belt testing *(designing)* | **Decided v0.32: full merge, rebuilt from scratch and improved.** Testing becomes a real dashboard section (rail icon, top bar, location switcher, lock/PIN, Admin/Staff). Every screen, the database tables and the rules are rebuilt from scratch to this rulebook, using the old system (`Testing\Color Belt Prototype`, Notion "Color Belt Testing System - Design", Supabase "USTC Color Belt Staging") as the feature reference only — no code or SQL is copied as-is. The old system keeps running untouched through the October testing events (10/29, 10/30); afterwards its data is moved and the staging project is retired. Inventory: `TKD-ColorBelt-Inventory.md`. | 2026-10-15 | Designing (inventory done 2026-10-16) |
| Star testing *(designing)* | Testing for the stars between Dan ranks (1st Dan up to 4 stars, 2nd up to 3, 3rd up to 5). Lives **inside Testing** next to Color belt testing (v0.58). Joint event for both schools; works on Both. Rebuilt from scratch to this rulebook; the old prototype (`Testing\Star Testing`, never used) is the feature reference only. Inventory: `TKD-StarTesting-Inventory.md`. | 2026-10-16 | Designing |
| Home | Shows the most important info staff need, quickly — "today at a glance" style (decided v0.10). **Starts empty.** Nothing goes on Home until a section exists to feed it; each new section decides what (if anything) it adds to Home when that section is designed. **Header (decided v0.11):** school logo, time-of-day greeting ("Good evening"), today's date, and active location; stays permanently. **While empty:** one gray line under the header — "Nothing on Home yet. Items appear here as sections are added." — removed once real items exist. | 2026-10-15 | **Built and live** (v0.30). Mockups `TKD-Home-Mockups.html` approved 2026-10-15; deployed 2026-10-16. |

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
| Code repository (decided v0.19) | Private **GitHub** repository on a **school-owned** GitHub account (`shrewsburyustc/tkd-dashboard`); Jeffrey pushes as his personal account `jberg412-jb`, added as a collaborator. The school owns the code. Used from both the school laptop and Jeffrey's home PC. |
| **Live (v0.30)** | **Deployed 2026-10-16** (Jeffrey's OK): `https://tkd-dashboard.pages.dev` — Cloudflare Pages project `tkd-dashboard` on the school Cloudflare account, auto-deploys every push to `main` of `shrewsburyustc/tkd-dashboard`. Build: `npm run build` → `dist`; env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable), `NODE_VERSION=24`. Security headers in `public/_headers`. Supabase Site URL set to the live address. Jeffrey pushes as his personal GitHub `jberg412-jb` (collaborator on the school repo). |
| Web address (decided v0.20) | Start on the free Cloudflare Pages address (`*.pages.dev`). When the school's planned new domain exists, add `dashboard.<new-domain>` as a custom domain (no rebuild; old address can run alongside for a transition period). |
| Account emails (decided v0.20) | Supabase, GitHub, and Cloudflare use the current school email for now. When the new domain has email: add the new address as a second Owner on each service, then remove the old one (never zero owners). On GitHub this works only if the school account is a GitHub **organization**; if it's a plain user account, add the new email, make it primary, and remove the old one instead. **Confirmed:** the school GitHub (`shrewsburyustc`) is a **user account**, so use the change-email route. Optional: create a free GitHub organization from it and add Jeffrey's personal GitHub as co-owner (no shared password). |
| Staff login emails | Admins must be able to edit a staff member's email in Staff accounts (password and PIN unchanged) — required feature when Staff accounts is designed. |
| First admin account (decided v0.23) | Created in the **Supabase dashboard** (Authentication → Users → Add user), then the staff table's `role` set to `admin`. No setup screen or script. Jeffrey is the first dashboard admin; the grandmaster is added as a **second admin** immediately after, so nobody is ever locked out. Dashboard admin is separate from the Supabase organization Owner (the school account). |
| Supabase access (recommended) | Invite Jeffrey's personal email to the school Supabase org as **Administrator** from the Team tab, so he has his own login instead of sharing the school password. The school account stays Owner. **Check first:** the 2-free-project limit counts every org where a person is Owner or Administrator — if Jeffrey's personal Supabase account already has active free projects, the invite may hit that limit. |
| Frontend (decided v0.25) | **React + Vite**, plain JavaScript (no TypeScript), plain CSS, Tabler icons. Code lives in `C:\Users\shrew\projects\tkd-dashboard` (outside OneDrive). |
| Status (v0.25 — superseded by the "Live (v0.30)" row) | **Home built locally** (build OK given 2026-10-15): sign-in, Home, shell, location switcher, account menu (who-line, Lock now, This device, Sign out), lock screen with PIN, 45-min idle lock, 7-day password rule, preview mode. Database migration `0001` + PIN test suite pass. Independent security and design reviews done; fixes applied. **Not deployed** — needs a separate OK (P2). |
| **Server-side lock — DONE (v0.29)** | Migration `0002` is live (2026-10-16). The database refuses data to a locked, PIN-locked, signed-out, magic-link/recovery, or 8-day-old session. **Rule for every future table:** RLS on; policies `to authenticated` using `(select public.has_data_access())` plus the table's own rule; `is_admin()` is never a data gate on its own — always pair it with `has_data_access()`; explicit grants, nothing to `anon`; views `with (security_invoker = true)`; security-definer functions that return data check `has_data_access()` first. |
| Account screens (approved v0.28) | Mockups `TKD-Account-Screens-Mockups.html` approved 2026-10-16: **Set your PIN** (required after the first password sign-in and after an admin reset; two steps, choose + confirm), **Change PIN** (asks for your password first, then choose + confirm), **Change password** (current, new, confirm). Dialog on PC/tablet with a Cancel button (no X); full screen with back arrow on phone. Success = 5-second toast, no Undo (typing twice is the confirmation). |
| PIN and password rules (v0.28) | PIN: exactly 4 digits; refused if all the same digit or a straight run (e.g. 1111, 1234, 4321) — "That PIN is too easy to guess. Choose another." Changing a PIN needs your password first. Password: minimum 12 characters (Supabase setting); the app re-checks the current password before changing it; changing it signs out the account's other devices. |
| Shared desk account (v0.28) | Flagged as a **shared account**: its menu hides Change PIN and Change password. Only the admin changes the desk PIN/password (via Supabase until the Staff accounts screen exists). The desk sets its PIN once, at its first sign-in. |
| Not built yet | Staff accounts, Settings — designed when personal logins arrive (school domain + employee emails). Until then accounts are managed in Supabase. |
| Public registration path (decided v0.33) | Families register with no login through a **Cloudflare Pages Function** in the dashboard's own Cloudflare project (e.g. `/register/...`). It validates input, rate-limits and runs a spam check, then calls **one** database function ("save registration") using a **restricted database login that can do nothing else**. Nothing is granted to `anon`; the `service_role`/secret key is not used. The restricted login's password is stored only as a Cloudflare secret. Rejected: Supabase Edge Function (needs the full-power secret key, second deploy target) and browser-direct `anon` grant (breaks the no-anon rule, no real rate limit). Spam-check method decided later. |
| Testing and locations (decided v0.34) | **Each testing event belongs to exactly one school** (Worcester or Shrewsbury), set when it's created. The Testing section shows only the selected school's events, registrations, payments and results — the schools' testing is kept completely separate so staff can't confuse or accidentally change the other school's event. To work on the other school's testing, staff switch the location switcher to that school. No "your school" field on the family form (the event's family link already belongs to one school). **Both (decided v0.35):** blocked in Testing — the page shows no data, only "Testing is kept separate for each school. Choose a school to see its testing." with Worcester / Shrewsbury buttons that switch the whole dashboard. This is a recorded exception to rule 3.3 (may be revisited later). |
| Classes, ranks and prices (decided v0.36) | **Each school has its own separate set** of Classes, ranks (belt order, next rank) and prices (early / testing-day / private), with full control at each school — prices can differ. The settings screen follows the location switcher like the rest of Testing (blocked on Both). Both schools start from a copy of the current list (7 Classes, 42 ranks). Each event copies its prices when created and can adjust them for that event; later list changes never alter existing events. |
| Color Belt build phases (decided v0.37) | **Many small phases, quality over speed.** Each phase goes design → approve → build → use → refine and is complete before the next starts; going back to change an earlier phase's decisions is expected and allowed. Order: (1) Classes and ranks, (2) Testing events + family registration form (+ calendar), (3) Registrations and payments, (4) Testing roster, (5) Private testing (finished properly). The old system keeps running for real testing until the new one fully replaces it (after phase 4); its data is moved and the staging project retired then. No deadline. |
| Testing section layout (decided v0.38) | Testing has **tabs at the top of the page**: "Events" and "Classes and ranks" (later phases add more, e.g. Private testing). Classes and ranks lives inside Testing — not in dashboard Settings and not as its own rail icon. If a future Students section needs ranks, they can be moved to their own section then (design change, not a data change). |
| Testing roles: Classes and ranks (decided v0.40) | **Admin edits, Staff view only.** Staff (including the shared desk account) can open the tab and read every Class, rank and price; a line reads "View only. Ask an admin to make changes." and no edit controls are shown. Enforced in the database (write policies/functions require `is_admin() and has_data_access()`), not just hidden in the screen. First part of open decision 10.5. |
| Classes and ranks: deleting (decided v0.41) | Deleting a rank or a class is **permanent**: ⋯ → "Delete rank" / "Delete class" (red, `ti-trash`) → confirmation dialog naming exactly what happens (e.g. "Delete High Green? Green will test for Blue. This can't be undone."; for a class: "Delete Teen/Adult and its 18 ranks? This can't be undone."). No Undo, no Removed/Restore group. Existing events are unaffected (they keep their own copy). If the deleted rank was another class's final award, that class's final award becomes "Not set" (amber reminder) and the confirmation says so. The deletion is still written to the change log (who, when, what). Follows rule 1.4 (not reversible → confirmation). |
| Classes and ranks: final award (decided v0.42) | The **final award** (the rank students receive after passing a class's last rank, e.g. Group A → Blue) is a **class setting**: a dropdown of this school's ranks in "Edit class" (and optional in "Add class"), defaulting to the first rank of the next class. The last rank's panel shows it read-only ("Blue — final award, set in the class settings"). Adding, reordering or deleting ranks never loses it — whichever rank is last tests for it. If it's not set or its rank was deleted, the last rank shows an amber reminder ("Final award not set — choose one in Edit class"); it never blocks anything. |
| Classes and ranks: reordering (decided v0.43) | **Instant with Undo.** PC: drag a rank (or class) by its grip handle (`ti-grip-vertical`); saves on drop with a 5-second "Rank order saved · Undo" toast. Every device: ⋯ menu → Move up / Move down (`ti-arrow-up` / `ti-arrow-down`) — the touch and keyboard method. "Testing for" updates automatically from the new order. Ranks can't be moved between classes. A failed save marks the row amber with an error banner + Retry (rule 3.5). **Changed v0.63: drag works on every device (mouse or finger) — see the v0.63 row.** |
| Classes and ranks: adding a rank (decided v0.44) | "Add rank" adds the rank at the end of its class and opens with the **three prices and the sparring gear setting copied from the class's current last rank** (hint: "Copied from Red. Change if needed."). Save stays unavailable until a name is entered. Every rank keeps its own prices (no class-level prices for now; can be added later if changing a whole class's prices becomes a chore). |
| Classes and ranks: copying between schools (decided v0.47) | **Not built for now.** Both schools start from a copy of today's list (v0.36); after that, new classes are added by hand at each school. A "Copy from the other school" feature can be added later if the double work becomes a problem. |
| Phase 1 design approved (v0.49) | Mockups `TKD-Testing-Classes-Ranks-Mockups.html` (9 screens: list, edit rank, add rank, add class, edit class, reorder + failed save, delete, staff view-only, Both blocked) **approved 2026-10-16**, including the 12 small details listed in the file (Final award tag; staff View button on touch; phone 16px padding; unsortable rank headers; near-black toasts; amber "Not saved" tag; one tag per phone row; gray Save while unavailable; red Delete in confirmations; prices side by side on PC/tablet; dropdown opens at top; class grip left of chevron). Design only — building needs its own plan and OK. |
| Testing tabs before phase 2 (decided v0.50) | Until the Events tab is built (phase 2), the Testing tab bar shows **only "Classes and ranks"**. Phase 2 adds "Events" to its left. No placeholder tab (rule P7). Small change from the approved phase 1 mockup. |
| Final award dropdown (decided v0.51) | Built as a **custom dropdown exactly as approved**: opens at the top ("Not set", then Little Tiger…), class names as group headings, current choice blue-tinted, scroll bar as the cue; same look on every device (phone shows the same list, not the phone's own picker). Must follow the standard accessible listbox pattern: keyboard arrows/Home/End/Enter/Esc, type a letter to jump, screen-reader roles and labels, focus returns to the field. The design review checks keyboard and screen-reader use explicitly. |
| Arrow-key row navigation (decided v0.52) | Rule 3.6 is built starting with Classes and ranks (PC): ↑ ↓ move a visible focus outline from row to row (crossing into the next open class), Enter opens the row's dialog, Tab still moves between page areas; off while typing in a field. Every later list reuses the same pattern. |
| Classes and ranks: empty states (decided v0.53) | **Empty school:** admin sees "No classes yet at Shrewsbury." with "+ Add class" in the page header; staff see "No classes yet at Shrewsbury. An admin adds them." and no button (rule 8). **First rank in an empty class:** price fields start empty with the hint "Enter the three prices for this class's first rank."; Save stays unavailable until the name and all three prices are filled. Later ranks copy from the last rank as usual (v0.44). |
| Rail order and Home (decided v0.54) | Rail / bottom-bar order: **Home, then Testing**. Testing adds **nothing to Home in phase 1** (Home keeps its empty line); upcoming testing events are the likely first Home item, decided in phase 2. |
| Phase 1 build plan approved (v0.55) | Build plan `TKD-Testing-Phase1-Build-Plan.md` (migration 0003 with 8 admin-only database functions, change log, PGlite + production tests, seed, screens, preview data) approved 2026-10-16 with answers v0.50–v0.54. Seed export: **Claude runs one read-only query** on the old project (class/rank names, order, prices, sparring flag only — no student data); Jeffrey reviews the printed table before anything is written. Every write to production (migration, seed) and every push needs its own OK. |
| Phone: discarding unsaved changes (decided v0.56) | On phones (full-screen dialogs have only the back arrow + Save), tapping back with unsaved changes keeps the dialog open with the amber note "Unsaved changes. Save or cancel first." **plus a "Discard changes" link inside the note** that closes without saving. The phone's own Back gesture behaves like the back arrow. Applies to every full-screen dialog from Testing onward (account dialogs to be aligned later with Jeffrey's OK). |
| Save button state (decided v0.57) | In edit dialogs, **Save is blue whenever the form is valid**, including when nothing has changed yet; Save on an unchanged form just closes the dialog (no save, no toast). Save is gray only while it can't be used (e.g. no name yet, or a field has an error). Dashboard-wide. |
| Star testing (decided v0.58) | **Star testing is added to the Testing section** (Jeffrey, 2026-10-16; rule P7). Clicking Testing lets staff **choose which testing to view: Color belt testing or Star testing** (how the choice looks is still to be decided, with visuals). Star testing events are **joint — both schools test together in one room**, so Star testing **works on Both** (all candidates, each showing their school); Worcester / Shrewsbury filter the candidates of the same event. The one-school rule and the Both block (v0.34, v0.35) and per-school prices (v0.36) apply to **Color belt testing only**. **Star rubrics and prices are the same for both schools** and must be changeable later from a screen (never hard-coded). Feature reference: the old prototype in `Testing\Star Testing` (inventory `TKD-StarTesting-Inventory.md`). Design only — nothing built. |
| Testing chooser (decided v0.59) | Hybrid of a choice page and a hover menu. **Click/tap the Testing icon** (every device) → the **Testing choice page**: one row per testing type (Color belt testing `ti-certificate`, Star testing `ti-star`, each with `ti-chevron-right`), each row showing its next event ("Next: Nov 14 · both schools") once that testing has events — no filler line before then. **Hover (mouse devices only, CSS `hover: hover`)** → after 150ms a dark menu opens beside the icon in place of the plain label bubble: "Testing" heading, then the testing types; the current one is highlighted; clicking a name goes straight there. The menu closes ~300ms after the pointer leaves both icon and menu. **Keyboard:** focus on the icon opens the menu, ↓ moves into it, Enter on the icon opens the choice page, Esc closes. Touch devices never see the menu (a tap always opens the choice page). Inside a testing type, a **"← Testing"** back link (`ti-arrow-left`) sits above the page title on every device. **Rule for later sections:** any rail section with sub-pages uses this same pattern. The chooser, menu and back link appear only once a second testing type is built (no placeholder, rule P7 / v0.50) — Color belt phase 1 ships unchanged. Recorded exception to 2.3 (the Testing label grows into a menu). |
| Star testing pages (decided v0.60) | **Star testing home** has two tabs: **Events** (every star testing event, upcoming and past: name, date, candidate count, one status tag; "+ Add event" is the page-header button, rule v0.45) and **Rubrics and prices** (the shared rubrics, grade scale, assistant-class table and fees; editable later, roles to be decided). **Clicking an event** opens that event's page with a "← Star testing" back link, the event name as the page title, a one-line summary (date · schools · candidate count) and tabs in testing-day order: **Candidates** (roster, payments, school) · **Grading** · **Results** (scores, make-ups, printouts, emails). What each tab contains is decided one at a time. Private star testing is added later as a row/tab without changing this structure. Pattern may be reused for Color belt events (phase 2). |
| Star testing order of work (decided v0.61) | **Design every Star testing screen first, then build in phases** (design runs while Color Belt is being built, so only one build runs at a time). Build phases: (1) Rubrics and prices, (2) Events + public registration form, (3) Candidates and payments, (4) Grading incl. paper sheet, (5) Results, printouts and email, (6) Private star testing. The public-form path (v0.33) is built once — most likely in Color Belt phase 2 — and reused. The Star testing database is planned once from the approved designs. Earlier decisions may still be changed (as v0.37). No deadline. |
| Star testing: rubric and price changes (decided v0.61) | **Each event keeps its own copy** of the rubrics, grade scale, assistant-class table, star limits and prices, taken when the event is created. Changes on the Rubrics and prices tab affect only events created afterwards; finished results and recorded payments never change. Same rule as Color Belt prices (v0.36). An "Update to current rubric" button can be added later if needed. |
| Star testing roles: Rubrics and prices (decided v0.61) | **Admin edits, Staff view only** (incl. the shared desk account): staff see every rubric, table and fee with "View only. Ask an admin to make changes." and no edit controls. Enforced in the database (writes require `is_admin() and has_data_access()`), same as v0.40. |
| Star testing: what admins can change (decided v0.61) | **Everything, with live totals.** Per Dan: add, rename, re-credit, reorder (drag by `ti-grip-vertical` on every device, v0.63; Move up/down in `ti-dots` everywhere) and delete categories; pass mark; star limit. School-wide: grade values (A+ 4.5 … D 0), assistant-class table (age split and thresholds), fees (standard / same day / private per Dan). Total credits and max score update live while editing. Exactly one category per Dan is calculated "from class count" (Assistant Instructor) — it can be renamed/re-credited but not deleted while it is the only one. Deleting a category needs a confirmation (rule 1.4); existing events keep their own copy (v0.61). **The 70-credit total is shown, not required:** a save that leaves a Dan at another total is allowed, with an amber note ("1st Dan total will be 75 credits (usually 70). Max becomes 337.5; pass mark stays 245."); the amber reminder stays on that Dan until it totals 70 again. |
| Final award "None" + Deputy + Teen/Adult prices (decided v0.62) | The final-award dropdown has three kinds of choice: **Not set** (nobody chose yet → amber reminder), **None — last rank doesn't promote** (on purpose; the last rank's "Testing for" shows a gray "No new rank" tag, no reminder), or a rank. **Deputy** is practice for Dan testing (a separate testing system, built later), not a promotion: Group D and Teen/Adult are seeded with final award **None**, and Deputy keeps its $10 / $10 / $10 practice price. **Teen/Adult matches the kids' classes one to one:** the seed corrects Teen/Adult High Green's private price from $95 to **$85** as a listed, approved adjustment (the old-system export stays an exact record). This is a **one-time match**: afterwards Teen/Adult prices are edited on their own like every other class (no automatic link). |
| Drag to reorder on every device (decided v0.63, dashboard-wide; changes v0.43) | **Reordering by drag works on PC, tablet and phone** (mouse or finger), for every reorderable list (Classes and ranks, Star testing categories, and later lists). **Only the grip handle (`ti-grip-vertical`) starts a drag**; touching anywhere else on a row scrolls the page. The grip is a 16px icon with a 44×44px touch area at the left of the row, never overlapping the row actions. Dragging near the top or bottom edge auto-scrolls the list. Saves on drop with the 5-second "… order saved · Undo" toast; a failed save follows rule 3.5. **Move up / Move down in ⋯ stays on every device** (keyboard and accessibility route). Staff (view-only) never see grips. Affects the Color Belt phase 1 build: its drag must handle touch (pointer events on the grip with `touch-action: none` on the grip only), not mouse only. |
| Belt graphics (decided v0.64) | Classes and ranks shows a **small belt graphic** for every rank: **beside the rank's name and beside its "Testing for" name** (phone: "[belt] Yellow → [belt] Orange"), so the belt change is visible at a glance; names always stay (meaning never by color alone). Patterns: **solid** (White, Yellow, Orange, Green, Blue, Purple, Red, Brown; LT White is plain white); **middle stripe** — Little Tiger = white with the color stripe in the middle; "High" belts = color with a white middle stripe; Bo Dan = black with white middle stripe; Deputy = black with yellow middle stripe; **half and half** — Red / Black = top half red, bottom half black; **end stripes** — Bo Dan - 1/2/3 Big Stripe = Bo Dan plus 1/2/3 yellow bars near the end. Standard belt colors. **Recorded exception to the red rule (7):** belt graphics show the real belt color, including red; they are pictures of belts, not UI signals. Admins set the pattern when creating or editing a rank (how the picker works: next decision). |
| Belt picker (decided v0.65) | Add rank / Edit rank get a **Belt** section built from parts: **pattern** (Solid · Middle stripe · Half and half), **belt color** (top half for Half and half), **second color** (middle stripe or bottom half; hidden for Solid), **end stripes** 0–3 (for Big Stripe belts; color defaults to yellow), and a **live preview** with the rank's name. Colors come from a fixed set of standard belt colors, each with its name shown (never color alone). A new rank starts as a copy of the class's last rank's belt (like prices, v0.44); an empty class starts as plain white. Admin only (v0.40). Mockups to be approved before building. |
| Star testing phase 1 design approved (v0.66) | Mockups `docs/Testing/Star Testing/TKD-StarTesting-Rubrics-Mockups.html` (**Rubrics and prices** tab, 12 screens: admin view, edit / add / reorder (+ failed save) / delete a category, Dan not at 70, Edit Dan settings, edit grade values, edit assistant-class table, edit fees, staff view-only, toast) **approved 2026-10-17** after a screen-by-screen pass, with all 20 listed details. Notable: a gray line "Same for both schools. Events keep the rubric and prices they were created with."; Grade scale, Assistant-class table and Fees always open below the collapsible Dan blocks; Dan line has a direct edit icon (Edit Dan settings: pass mark, highest star, live progressions/max preview); category names unique within a Dan; new categories always judged; Assistant Instructor's delete shown grayed out with the reason; **grade values must go down in order** ("A must be higher than B+.") and **assistant-class minimums must go down in order per column** ("A must need fewer classes than A+."), Save gray until fixed; assistant-class D row read-only "under 10" following C; fees whole dollars; drag by the grip on every device (v0.63). **Age for the assistant-class scale counts on the testing day** (from date of birth; no date of birth → 13 and up column). Design only — building needs its own plan and OK (after all Star screens are designed, v0.61). |
| Star testing: registration open / closed (decided v0.67) | Each Star testing event has a **Registration** switch (**Open / Closed**) in Add event / Edit event, **plus an optional closing date** ("Close automatically at the end of [date]", 11:59 PM Massachusetts time). **New events start Closed**, so the family link never works before staff are ready. The date box starts **ticked, set to 7 days before the testing date**; unticked, the switch alone decides. The date must be on or before the testing date ("The closing date must be on or before the testing date."). When the date passes, registration closes by itself and the change log records it ("Closed automatically at the end of Feb 6"); the date **never reopens** anything — opening is always by hand. **Reopening after the date has passed removes the date** (toast: "Registration open. The automatic closing date was removed. · Undo"). Quick route: the event's `ti-dots` menu has **Close registration / Open registration**, instant with a 5-second Undo toast (rule 1.4). The website checks the date whenever a family opens the link (nothing runs overnight). **Recorded exception to rule 8:** the closing date is shown openly, not under "More details", because it is on by default. Rejected: switch only (relies on someone remembering to close) and automatic open + close dates (exceptions mean editing dates). Status-tag wording, who may open/close, and what a closed link shows are decided separately. Question file: `docs/Testing/Star Testing/TKD-StarTesting-Events-Questions.html`. |
| Star testing roles: Events (decided v0.68) | **Admins** add and edit Star testing events (name, date, closing date) and open or close registration at any time. **Staff** (incl. the shared desk account) see the Events list and open any event; no "+ Add event", no Edit icon. Their `ti-dots` menu has **Close registration** (any time, instant with Undo) and **Open registration only while the closing date has not passed** (or no date is set). After the date, "Open registration" is shown grayed out with the reason under it: "The closing date has passed. Ask an admin to reopen." Gray line for staff: "Staff can open or close registration from ⋯ until the closing date. Ask an admin to add or change events." So an admin's deadline is never undone at the desk; a late family after the deadline needs an admin. **Enforced in the database** (the open/close function checks role and date in Massachusetts time; add/edit require `is_admin() and has_data_access()`), as v0.40 / v0.61. Deleting events (later question) and what staff can do inside an event (Candidates, Grading, Results) are decided separately. Rejected: admin only; staff reopen any time (would remove the admin's date); staff add and edit (shared desk log shows only "Staff"). |
| Star testing: event fields (decided v0.69) | A Star testing event holds **Event name**, **Testing date**, **Start time** and **Where** (a choice: Worcester school or Shrewsbury school), then **Registration** (v0.67), then a collapsed **More details** at the bottom with an optional **Note for families** (shown on the registration form). Start time and Where are **required** (Save gray until filled) and **start as a copy of the last event's values**. Hint under Where: "Where testing takes place. Candidates from both schools take part." Where is information only: it never changes which candidates belong to the event or what the location switcher shows (Star events work on Both, v0.58). **No limit on candidates per Dan** (the prototype's 100 is dropped; can be added later). Not included: end time, separate start times per Dan (use the note), street address (the Calendar could take addresses from a school setting later). Edited by admins only (v0.68). Where these details appear (form, printouts, results email, Testing page line, Calendar) is decided with each screen. |
| Star testing: event status tags (decided v0.70) | The Events list shows one tag per event (rule 8), worked out from the dates and the Registration switch only: **Not open yet** (gray; saved, never opened) → **Open until Nov 7** / **Registration open** (green; with / without a closing date) → **Registration closed** (gray; was open, now closed) → **Testing today** (gray, on purpose: it is neither a good state nor a problem) → **Finished** (gray, from the day after the testing date). Grading and results progress are **not** shown on the list; they live inside the event. From the testing date on, the date tags always win over the registration tags. **Registration closes by itself at the end of the testing day** (11:59 PM Massachusetts time), even when no closing date is ticked (addition to v0.67), logged like the automatic close. Rejected: a full life cycle with "5 not graded" / "Graded" after testing, and "In 4 weeks / Today / Past". |
| Star testing: upcoming and past events (decided v0.71) | The Events tab has an **Upcoming / Past** switch above the list, each side with its count ("Upcoming 2 · Past 2"). It opens on **Upcoming** (soonest testing date first); **Past** shows finished events, most recent first. An event moves to Past the day after its testing date (when its tag becomes Finished, v0.70); on testing day it stays in Upcoming. Column headers still re-sort the current side (rule 8). **The switch's selected side is drawn gray** (surface background, text color), not blue, so the page stays within 5 blue elements (rule 1.2); on touch each side has a 44px tap area, like the location switcher. Rejected: one list with Upcoming / Past headings; one list newest first; Past collapsed under a heading. |
| Star testing: registration link and QR code (decided v0.72) | Each event has **one registration link** (families choose their Dan on the form) with a **QR code** of it. The **event page header** has one outline button **Registration link** (`ti-qrcode`) opposite the title; it opens a dialog (full screen on phones) with the QR code, the link and **Copy link** (`ti-copy`, toast "Link copied"). The event's `ti-dots` menu on the Events list also has **Copy registration link** as a shortcut. The event page summary reads e.g. "Sat, Feb 13, 2027 · 10:00 AM at Shrewsbury school · both schools · 0 candidates" (v0.60's date · schools · count, plus start time and Where from v0.69). **Still to confirm with the full mockups:** a random code at the end of the link; the old `pages.dev` address keeping working after the domain move (v0.20) so printed QR codes never break; staff seeing and copying the link; a **Print flyer** button and its contents. The exact link address is set when the shared registration path (v0.33) is built. Rejected: a link strip above the event tabs; link and QR code only in the ⋯ menu. |
| Star testing: deleting an event (decided v0.73) | **Admins only** (follows v0.68), from the event's `ti-dots` menu on the Events list: **Delete event** (red, `ti-trash`) works on **any** event, with or without candidates. It is **permanent**, so it asks for confirmation naming exactly what goes (rule 1.4, as v0.41): e.g. "Delete Fall 2026 Star Testing? Its 23 candidates and their registrations, payments and grades are deleted too. This can't be undone." Buttons: **Keep event** and red **Delete event**. No Undo. The deletion is still written to the change log. **No cancelled state:** a testing that is called off is deleted or left as it is (v0.70 tags and v0.71 Past rules unchanged). Rejected: Cancel event (keeps the record, gray Cancelled tag) with Delete only while empty; Delete only while empty with no Cancel. Risk accepted (flagged): deleting an event with candidates removes its payment and grade records. |
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
| 0.30 | 2026-10-16 | Deployed (Jeffrey's OK): tkd-dashboard.pages.dev via GitHub → Cloudflare Pages auto-deploy; security headers added; Supabase Site URL updated. |
| 0.31 | 2026-10-16 | Housekeeping: Home row and 10b status rows updated to "live"; GitHub access wording corrected (collaborator). Handoff document `TKD-Dashboard-Handoff.md` added for the next chat. |
| 0.32 | 2026-10-16 | Color Belt testing: decided full merge into the dashboard, rebuilt from scratch and improved (old system is the feature reference only; it runs until after the 10/29–10/30 October testing, then is retired). Inventory `TKD-ColorBelt-Inventory.md` added. |
| 0.33 | 2026-10-16 | Color Belt public registration path decided: Cloudflare Pages Function in the dashboard project + one restricted database login limited to "save registration"; nothing to anon, no service_role key (10b). |
| 0.34 | 2026-10-16 | Color Belt: each testing event belongs to one school; Testing shows only the selected school's events, kept fully separate; switch schools to see the other's (10b). |
| 0.35 | 2026-10-16 | Color Belt: Testing is blocked when the switcher is on Both (choose-a-school message + two buttons); exception to rule 3.3, can be revisited. |
| 0.36 | 2026-10-16 | Color Belt: each school has its own Classes, ranks and prices (full control per school; follows the switcher); both start from the current list (10b). |
| 0.37 | 2026-10-16 | Color Belt build split into 5 small phases (Classes and ranks → events + family form → registrations and payments → roster → private testing); quality over speed; old system runs until phase 4 replaces it (10b). |
| 0.38 | 2026-10-16 | Color Belt: Testing uses top tabs (Events, Classes and ranks); Classes and ranks lives inside Testing (10b). |
| 0.39 | 2026-10-16 | Testing rail icon: `ti-certificate` added to the icon map (2.4); label "Testing". |
| 0.40 | 2026-10-16 | Testing roles: Classes and ranks — Admin edits, Staff view only, enforced in the database (part of 10.5). |
| 0.41 | 2026-10-16 | Classes and ranks: deleting a rank or class is permanent with a confirmation (red, `ti-trash`); no Undo/Restore; existing events unaffected; logged (10b). |
| 0.42 | 2026-10-16 | Classes and ranks: final award is a class-level dropdown in Edit class; read-only on the last rank; amber reminder when missing (10b). |
| 0.43 | 2026-10-16 | Classes and ranks: reorder instantly with Undo (drag on PC, Move up/down in ⋯ everywhere). Icons added: `ti-grip-vertical`, `ti-arrow-up`, `ti-arrow-down` (2.4, 10b). |
| 0.44 | 2026-10-16 | Classes and ranks: Add rank copies prices + sparring gear from the class's last rank (10b). |
| 0.45 | 2026-10-16 | Dashboard-wide: add-new is a labeled primary button in the page header (e.g. "+ Add class"), not a ＋ in the top bar; `N` triggers it (1.1, 3.6, 6 updated). |
| 0.46 | 2026-10-16 | Dashboard-wide: records open and are edited in a centered dialog (phone: full screen), replacing the slide-in detail panel; unsaved-changes guard (6). |
| 0.47 | 2026-10-16 | Classes and ranks: no copy-between-schools feature for now (10b). |
| 0.48 | 2026-10-16 | Housekeeping: leftover "detail panel" wording (1.1, 1.3, 3.6 Esc, 5, 6 diagram, 8) updated to the v0.46 centered-dialog detail view. |
| 0.49 | 2026-10-16 | Color Belt phase 1 (Classes and ranks) mockups approved, incl. 12 small details (10b). Build not yet approved. |
| 0.50 | 2026-10-16 | Testing shows only the "Classes and ranks" tab until Events is built in phase 2 (10b). |
| 0.51 | 2026-10-16 | Final award dropdown: custom list exactly as approved (opens at top), with full keyboard + screen-reader support (10b). |
| 0.52 | 2026-10-16 | Arrow-key row navigation (3.6) built from phase 1 onward; shared pattern for all lists (10b). |
| 0.53 | 2026-10-16 | Classes and ranks: empty-school states (admin/staff) and empty price fields for a new class's first rank (10b). |
| 0.54 | 2026-10-16 | Rail order Home → Testing; nothing on Home from Testing in phase 1; Undo toast timer pauses on hover/focus (8, 10b). |
| 0.55 | 2026-10-16 | Phase 1 build plan approved; Claude runs the read-only export from the old project (10b). |
| 0.56 | 2026-10-16 | Phone full-screen dialogs: "Discard changes" link inside the unsaved-changes note; system Back = back arrow (10b). |
| 0.57 | 2026-10-16 | Save is blue whenever the form is valid; unchanged Save just closes; gray only when unusable (10b). |
| 0.58 | 2026-10-16 | Star testing added inside Testing: choose Color belt or Star testing; Star testing is joint (works on Both); star rubrics/prices shared by both schools and editable later; v0.34–v0.36 apply to Color belt only (9, 10b). |
| 0.59 | 2026-10-16 | Testing chooser: click → choice page, mouse hover → menu, back link inside each testing type; appears only once Star testing is built. Icons added: `ti-star`, `ti-chevron-right` (2.4, 10b). |
| 0.60 | 2026-10-16 | Star testing pages: home tabs Events + Rubrics and prices; each event opens its own page with Candidates, Grading, Results tabs (10b). Master copy of all docs is now the repo `docs/` folder. |
| 0.61 | 2026-10-16 | Star testing: design all screens first, then build in 6 phases; reuse the shared public-form path; each event keeps its own copy of rubrics and prices from creation; Rubrics and prices: admin edits, staff view only; everything changeable with live totals, 70-credit total shown not required (10b). |
| 0.62 | 2026-10-16 | Color Belt: final award gains "None — last rank doesn't promote" (gray "No new rank" tag); Deputy = Dan-testing practice (Group D, Teen/Adult → None); Teen/Adult High Green private $95 → $85 in the seed (10b). Housekeeping: repaired the garbled 0.29 / 0.32 changelog lines. |
| 0.63 | 2026-10-16 | Drag to reorder works on every device (grip only; Move up/down kept); changes v0.43 dashboard-wide, incl. Color Belt phase 1 (10b). |
| 0.64 | 2026-10-17 | Color Belt: belt graphics beside rank and "Testing for" names; patterns defined (solid, middle stripe, half and half, end stripes); belt colors are an exception to the red rule (10b). |
| 0.65 | 2026-10-17 | Color Belt: belt picker in the rank dialog (pattern + colors + end stripes + live preview; copies the last rank's belt) (10b). |
| 0.66 | 2026-10-17 | Star testing phase 1 (Rubrics and prices) mockups approved with all details; age for the assistant-class scale counts on the testing day; grade values and assistant-class minimums must go down in order (10b). |
| 0.67 | 2026-10-17 | Star testing Events: Registration switch (Open / Closed, new events start Closed) plus optional automatic closing date (default 7 days before testing; never reopens; reopening removes the date); ⋯ Close / Open registration with Undo (10b). |
| 0.68 | 2026-10-17 | Star testing Events roles: admins add/edit events and open or close registration; staff can close any time and reopen only before the closing date (10b). |
| 0.69 | 2026-10-17 | Star testing event fields: name, date, start time, Where (Worcester / Shrewsbury school; both required, copied from the last event), Registration, optional note for families under More details; no per-Dan candidate limit (10b). |
| 0.70 | 2026-10-17 | Star testing event tags: Not open yet → Open until … / Registration open → Registration closed → Testing today → Finished (no grading on the list); registration closes by itself at the end of the testing day (10b). |
| 0.71 | 2026-10-17 | Star testing Events tab: Upcoming / Past switch with counts, opens on Upcoming (soonest first), Past most recent first; selected side gray to respect the blue limit (10b). |
| 0.72 | 2026-10-17 | Star testing: Registration link button on the event page (QR code, link, Copy link) plus Copy registration link in ⋯; icons `ti-copy` and `ti-qrcode` added to the map (2.4, 10b). |
| 0.73 | 2026-10-17 | Star testing: admins can delete any event (permanent, confirmation names candidates, payments and grades); no cancelled state (10b). |
