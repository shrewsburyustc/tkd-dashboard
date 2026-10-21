# Contract 0016-B2 — Black Belt testing, phase B2: candidates and payments (preview build)

**Status: DRAFT for review** (written 2026-10-20, Black Belt worktree session, branch `black-belt`). Not approved. Next: security review + design review of this contract → Jeffrey's OK (rulebook row 0.912) → build.

The single source of truth for the **B2 builders** (B data layer + preview store, C candidates screens, R receipt; §0). B2 builds the cycle page's **Candidates** tab with payments (plan §8 step 5, mockups Candidates 1–9) on top of the finished B1 (CP2 OK'd, rulebook v0.911). It is built and checked **in preview mode only** (fake database). Nothing is pushed, deployed or applied to Supabase. Grading, results and make-ups (B3+) are out. If something here is impossible or contradicts the sources below, **stop and report it** — do not improvise. Undecided points are in §7, each with a working default the builder uses.

| Source (in this order of authority) | |
|---|---|
| This contract | wins for B2 |
| `supabase/migrations/0016_black_belt.sql` (sections 10c–10d, 13, 15g–15s, 16c–16f) | exact names, arguments, check order and answers; where it differs from CONTRACT-0016 or a mockup, **the SQL wins** (differences in §7.3) |
| `CONTRACT-0016.md` §2.8–§2.10, §4.4 (Finance's columns: **don't reshape**), §5.2–§5.6, §6.3–§6.4, §7 | rules and statuses |
| `CONTRACT-0016-B1.md` and the B1 code as built (`src/lib/blackBelt/**`, `src/blackBelt/staff/**`, `src/lib/mockClient.js`) | B2 extends it: same names, patterns, comment style |
| Rulebook: Black Belt rows v0.204–v0.224, v0.900–v0.911 (v0.210 roles, v0.212, v0.218, v0.219, v0.220, v0.224, v0.903, v0.904, v0.906–v0.908 S1–S20); v0.215 (Hide payments switch); v0.301–v0.303 icon map (**`ti-cash` = cash only**); Star rows v0.110–v0.120, v0.152, v0.166 (patterns the mockups copy); §1–§8, §5 privacy | v0.911 |
| Approved mockups `docs/Testing/Black Belt Testing/TKD-BlackBelt-Candidates-Mockups.html` (Candidates 1–9, every amber proposal approved, v0.900); status file §3b and its end notes | wording and layout |
| Handoff `TKD-Dashboard-Handoff.md` §6 | non-negotiable |
| Patterns: Star on branch `star-testing` (read with `git show star-testing:<path>`, never checked out): `src/screens/testing/star/candidates/*` (CandidatesTab, CandidateRows, CandidateDialog, StarCompareDialog, StarPaymentDialogs, SignatureDialog); Color Belt `src/screens/testing/event/*` (RosterRows, CompareDialog, PaymentDialogs, GradingSheet print); Finance `src/screens/finance/PrintPage.jsx` (print portal + `@media print`), `usePaymentsHidden.js` | copied, not imported across sections (except the read-only list in §0) |

**Working copy:** the Black Belt worktree, branch `black-belt`. `git merge main` before starting and before any shared-file edit. Don't touch Supabase, Cloudflare, git remotes, other worktrees, the main folder, `supabase/` (another agent is editing `supabase/tests/pglite/run.mjs`) or `functions/`. Don't commit; the orchestrator commits.
**Audience:** Jeffrey is learning IT. Every new file starts with a header comment (what + why); plain-English comments on non-obvious lines; readable over clever. **CRLF line endings** like the neighbouring files (check before and after).

**Words used here (one line each):**
- *Roster*: the list of a cycle's candidates on the Candidates tab.
- *Item*: one thing a candidate owes: `p1` … `p12` (a payment of their plan) or `kukkiwon` (the certificate fee).
- *Live row*: a payment, refund or returned-check row that no undo (reversal) points at.
- *Allocation*: working out which items a payment paid (rule S1).
- *Append-only*: payment rows are only ever added — a correction is a new row, never a change or a deletion.
- *Hide payments switch*: the device setting in the account menu (v0.215, live) — the "mat-side tablet setting" of the mockups.

---

## 0. File ownership (no two builders edit the same file)

| Builder | Owns (new unless marked) | Must not edit |
|---|---|---|
| **B — data layer + preview store** | **B1 files changed:** `src/lib/blackBelt/api.js` (new functions §1), `rules.js` (money rules §1.4), `money.js` (payment amounts §1.5), `mockBlackBelt.js` (handlers §2), `checks.mjs` (§5) · **shared:** `src/lib/mockClient.js` (new console helpers only, §2.4) | screens, styles, `functions/`, `supabase/`, the family form |
| **C — candidates screens** | new `src/blackBelt/staff/candidates/**` (`CandidatesTab.jsx`, `RosterRows.jsx`, `SummaryCards.jsx`, `DuplicateBox.jsx`, `CompareDialog.jsx`, `CandidateDialog.jsx` (detail + Edit details), `ItemChecklist.jsx`, `RecordPaymentDialog.jsx`, `EditPaymentDialog.jsx`, `UndoPaymentDialog.jsx`, `RefundDialog.jsx`, `ReturnedDialog.jsx`, `ChangePlanDialog.jsx`, `AddCandidateDialog.jsx`, `RemoveDialog.jsx`, `SignatureDialog.jsx`, `useCandidateActions.js`) · **B1 files changed:** `cycle/CyclePage.jsx` (header button, tab content, staff line), `BlackBeltTesting.jsx` (passes `location`, `onLocationChange`), `text.js`, `blackBelt.css` · **shared:** `src/screens/Testing.jsx` (pass `location` and `onLocationChange` to `BlackBeltTesting` — one prop line) | `src/lib/blackBelt/**`, `receipt/**`, form files |
| **R — receipt** | new `src/blackBelt/staff/receipt/**` (`ReceiptDialog.jsx` (the preview), `ReceiptPage.jsx` (the printed page, portal), `receipt.css` (incl. `@media print`), `text.js` (receipt words)) | everything else |
| Orchestrator | this contract, rulebook (row 0.912, icon-map rows §3.11), status file, commits | |

**Order:** B first (its exported names in §1 are the interface; C and R may start against them at once). C and R in parallel. C opens R's dialog through one prop interface (§4.1).
**Read-only imports allowed (in addition to B1's list):** `src/screens/finance/usePaymentsHidden.js` (the Hide payments switch), `src/components/*`, `src/blackBelt/staff/parts/*` (B1's DateField, SelectField, Choice, ConfirmDialog, InnerDialog), `src/lib/useShortcutN.js`, `useRowArrowNav.js`, `src/screens/testing/events/useLiveLoad.js`.
**B returns codes, never words; C and R own all wording.** Wording not in the mockups is marked "(not in the mockups)" in `text.js` and listed for CP2 (as B1).
**Shared files touched in B2 (listed in every summary):** `src/lib/mockClient.js` (B), `src/screens/Testing.jsx` (C); orchestrator: the rulebook. **Not changed:** `qr.js`, `startingPoint.js`, `publicApi.preview.js`, `src/blackBelt/form/**`, `functions/**`, `App.jsx`, `vite.config.js`. The family form and public Function need nothing for B2 (form registrations already land in the same preview store and show on the roster).

---

## 1. Data layer (Builder B) — additions to `src/lib/blackBelt/api.js`

### 1.1 Rules (as B1 §1.1, plus)
- Same `callRpc` pattern: camelCase object argument, always `{status, …}`, **never throws**; unknown status or wrong shape → `{status: 'error', error}`. Every call is a normal POST (`bb_cycle_roster` runs the purge; never `{ get: true }`).
- `BB_STATUSES` gains **`withdrawn`** and **`refund_too_large`** (the latter carries `paidCents`).
- Money is whole cents; JSON numbers from `bigint` sums are read as numbers (safe below 2^53). Dates `'YYYY-MM-DD'`; timestamps ISO text; `registeredOn` = `todayInSchoolTime(Date.parse(registeredAt))` (the school date, never `.slice(0,10)` of a UTC time).
- **Privacy:** only `loadCandidate` returns DOB, email, signer name; only `loadSignature` returns a signature. No other function, shape, cache or log carries them. The data layer never writes them to storage or the console.

### 1.2 Functions (S = staff and admins, A = admins only — the database enforces it)

| JS function | Calls (exact 0016 arguments) | Role | Returns (ok) | Other statuses |
|---|---|---|---|---|
| `loadRoster({cycleId})` | `bb_cycle_roster(p_cycle_id)` | S | `{status, state: CycleState, rows: RosterRow[]}` (SQL order: Dan, Shrewsbury then Worcester, last, first) | `not_found`, `invalid`, `no_access`, `error` |
| `loadCandidate({candidateId})` | `bb_candidate_detail(p_candidate_id)` | S | `{status, candidate: CandidateDetail, waiver: WaiverState\|null, needsParentSignature, payments: PaymentLine[], money: Money}` | `not_found`, `invalid`, `no_access`, `error` |
| `loadSignature({candidateId})` | `bb_view_signature(p_candidate_id)` | A | `{status, signature: dataUrl\|null, signerName, signedAt, removedAt}` | `not_allowed`, `not_found`, `invalid`, `no_access`, `error` |
| `loadReceipt({candidateId})` | `bb_receipt(p_candidate_id)` **and** `locations` (`code, name, phone`) at the same time | S | `{status, receipt: Receipt}` (§1.3; `schools[].phone` from `locations`, null when empty — OP-21 of B1) | `not_found`, `invalid`, `no_access`, `error` |
| `addCandidate({cycleId, first, last, dateOfBirth, email, locationCode, dan, planId, kukkiwon, paperWaiver})` | `bb_add_candidate(p_cycle_id, p_first, p_last, p_date_of_birth, p_email, p_location_code, p_dan, p_cycle_plan_id, p_kukkiwon, p_paper_waiver)` | S | `{status, id, reference, version}` | `finished`, `invalid`, `not_found`, `no_access`, `error` |
| `updateCandidate({candidateId, expectedVersion, first, last, dateOfBirth, email, locationCode, dan})` | `bb_update_candidate(p_candidate_id, p_expected_version, p_first, p_last, p_date_of_birth, p_email, p_location_code, p_dan)` — a purged candidate sends `dateOfBirth: null, email: null` | S; Dan change after a payment A | `{status, version, needsParentSignature}` | `not_allowed`, `stale`, `invalid`, `not_found`, `no_access`, `error` |
| `changePlan({candidateId, expectedVersion, planId, kukkiwon})` | `bb_change_plan(p_candidate_id, p_expected_version, p_cycle_plan_id, p_kukkiwon)` | S before a payment; A after | `{status, version, money}` | `withdrawn`, `not_allowed`, `stale`, `invalid`, `not_found`, `no_access`, `error` |
| `resolveDuplicate({keepId, keepVersion, otherId, otherVersion, keepBoth})` | `bb_resolve_duplicate(p_keep_id, p_keep_version, p_other_id, p_other_version, p_keep_both)` | S | `{status, keepVersion, otherVersion}` | `withdrawn`, `stale`, `invalid`, `not_found`, `no_access`, `error` |
| `withdrawCandidate({candidateId, expectedVersion})` | `bb_withdraw_candidate(p_candidate_id, p_expected_version)` | A | `{status, version}` | `withdrawn`, `stale`, `not_found`, `invalid`, `not_allowed`, `no_access`, `error` |
| `restoreCandidate({candidateId, expectedVersion})` | `bb_restore_candidate(p_candidate_id, p_expected_version)` | A, or S for their own "keep one" < 10 s | `{status, version}` | `stale` (not withdrawn / version), `not_allowed`, `not_found`, `invalid`, `no_access`, `error` |
| `deleteCandidate({candidateId, expectedVersion})` | `bb_delete_candidate(p_candidate_id, p_expected_version)` | A | `{status}` | `has_payments`, `stale`, `not_found`, `invalid`, `not_allowed`, `no_access`, `error` |
| `recordPaperWaiver({candidateId, expectedVersion})` | `bb_record_paper_waiver(p_candidate_id, p_expected_version)` | S | `{status, version, needsParentSignature}` | `finished`, `invalid` (purged), `stale`, `not_found`, `no_access`, `error` |
| `recordPayment({candidateId, expectedVersion, amountCents, method, forItems, note})` | `bb_record_payment(p_candidate_id, p_expected_version, p_amount_cents, p_method, p_for_items, p_note)` (`note` trimmed, `''` → null) | S | `{status, paymentId, version, money}` | `withdrawn`, `invalid`, `stale`, `not_found`, `no_access`, `error` |
| `undoPayment({paymentId})` | `bb_undo_payment(p_payment_id)` — works on a payment, refund or returned row | S own row < 10 s; else A | `{status, version, money}` | `not_allowed`, `invalid` (a reversal; a payment with a live returned mark; the net floor), `stale` (already undone), `not_found`, `no_access`, `error` |
| `editPayment({paymentId, amountCents, method, forItems, note, reason})` | `bb_edit_payment(p_payment_id, p_amount_cents, p_method, p_for_items, p_note, p_reason)` | A | `{status, paymentId (the new row), version, money}` | `withdrawn`, `invalid` (not a payment; an active refund; an item not in the plan), `stale` (undone, edited away or returned), `not_found`, `not_allowed`, `no_access`, `error` |
| `recordRefund({candidateId, expectedVersion, amountCents, method, note})` | `bb_record_refund(p_candidate_id, p_expected_version, p_amount_cents, p_method, p_note)` | A | `{status, paymentId, version, money}` | `refund_too_large` (+ `paidCents`), `invalid`, `stale`, `not_found`, `not_allowed`, `no_access`, `error` |
| `markCheckReturned({paymentId, note})` | `bb_mark_check_returned(p_payment_id, p_note)` | A | `{status, paymentId (the returned row), version, money}` | `invalid` (not a check payment), `stale` (undone / edited away / marked once already), `not_found`, `not_allowed`, `no_access`, `error` |

Undo, edit and mark-returned take **no expected version** (the SQL has none); a second click is caught as `stale` by "already reversed / returned".

### 1.3 Shapes (camelCase of the SQL answers)
- **Money** (SQL 10d): `{items?: [{item, label, dueOn, amountCents, paidCents, remainingCents}], totalDueCents, paidCents, balanceCents, overpaidCents, tag: 'paid_in_full'|'next'|'late'|'not_paid', nextOn, nextCents, lateSince, lateCents, lateKukkiwonOnly}` — `items` only from the detail and the write answers; the roster's money has no items. `nextOn/nextCents` only for `next`, `late*` only for `late` (null otherwise).
- **RosterRow**: `{id, firstName, lastName, locationCode, dan, planId, planName, kukkiwon, source: 'form'|'desk', reference, registeredAt, registeredOn, status: 'active'|'withdrawn', withdrawnReason: 'withdrawn'|'duplicate_copy'|null, duplicateState: 'none'|'possible'|'kept_both', duplicateOf, version, hasPaymentRows, money}`. **No** DOB, email, waiver data, withdrawn date/by or login id.
- **CandidateDetail**: every key of the SQL `candidate` object in camelCase: `id, cycleId, firstName, lastName, dateOfBirth, emailForResults, personalRemovedAt, locationCode, dan, cyclePlanId, kukkiwon, kukkiwonAddedOn, source, reference, registeredAt, registeredOn, status, withdrawnReason, withdrawnAt, withdrawnByName, duplicateState, duplicateOf, version, createdAt, updatedAt, createdByName, updatedByName, ageOnFirstDay, under18OnFirstDay, plan: {name, paymentsCount}` (DOB, email, age null once the purge day has passed).
- **WaiverState**: `{how: 'drawn'|'paper', versionName, signedAt, signerName, signedAsMinor, tickedByName, signatureOnFile, removedAt}`.
- **PaymentLine** (live rows only, oldest first): `{id, kind: 'payment'|'refund'|'returned', amountCents (refund/returned negative), method, paidOn, forItems, note, reason, recordedAt, recordedByName, reversesPaymentId, returned}` (`returned` = a payment whose check is marked returned).
- **Receipt**: `{candidate: {firstName, lastName, dan, reference, locationCode}, cycleName, planName, kukkiwon, lines: [{paidOn, forItems, kind, method, amountCents, returned}], money: {totalDueCents, paidCents, balanceCents, nextOn, nextCents}, schools: [{code, name, address: {street, city, state, zip}|null, phone}], printedOn, printedByName}` (Worcester first). No DOB, email, notes, reasons, "recorded by".

### 1.4 `rules.js` additions (pure; used by the screens, the preview store and `checks.mjs`)
- `ITEM_PATTERN` (`^(p([1-9]|1[0-2])|kukkiwon)$`), `METHODS = ['cash','check','card']`, `PAYMENT_MAX_CENTS = 500000`, `NOTE_MAX = 600`.
- `candidateItems({planPayments: [{paymentNo, dueOn}], amounts: [cents…] (this Dan), kukkiwon, kukkiwonAddedOn, kukkiwonFee, registeredOn})` → `[{item, label, dueOn, amountCents}]` = **SQL 10c exactly** (S4 floors; Kukkiwon = later of p1's date and `kukkiwonAddedOn`; order by date then p1, kukkiwon, p2 …). `label` is the code-only SQL label ("Payment 1", "Kukkiwon certificate") so store answers match the SQL.
- `candidateMoney({items, lines, today})` → **Money** = **SQL 10d exactly**, where `lines` are the live rows `{id, kind, amountCents, forItems, recordedAt, returned}` (the detail's list works as is: Σ of live rows = Σ of every row, because each reversal cancels its target). Steps: (1) live payments not returned, oldest `recordedAt` first (ties by id): first to their `forItems` in item order (an item the plan no longer has is skipped), then earliest unpaid, rest = overpaid; (2) refunds off overpaid first, then off items from the latest backwards; (3) `paidCents` = Σ lines; balance = total − paid; tag rules incl. "not_paid only when there is **no live payment row at all**" (a returned check's payment still counts as a live row → Late, not Not paid).
- `liveLines(rows)` — store rows (all kinds, incl. reversals) → the live lines above (shared by the store and the checks).
- `hasLivePayment(lines)` (the staff/admin split for Change plan and a Dan change, CONTRACT-0016 §6 "has a payment").
- `dueNowItems(money, today)` (remaining > 0 and `dueOn ≤ today`), `nextItems(money)` (the earliest unpaid date's items), `defaultTicks(money, today)` (due-now items, else next items, else none), `sumRemaining(money, codes)`.
- `rosterCards(rows, {school})` → `{paidInFull, onSchedule, late, notPaid, duplicatesLeftOut}`: active rows of the shown school(s), **possible duplicates left out**, withdrawn left out; `paid_in_full` (also overpaid) / `next` / `late` / `not_paid`.
- `rosterFilter(rows, {school, card, search})`, `duplicatePairs(rows)` (each `possible` row with its partner, once), `searchMatches(row, text)` (first, last, "first last", reference; case and spaces ignored).
- `pairReturnedLines(lines)` → for each `returned` receipt line, the earliest unpaired `returned: true` payment line of the same amount (its `forItems`), so the receipt can say "Payment 2 · check returned" (bb_receipt has no row ids; §7.3).
- `predictMoney(...)` is just `candidateItems` + `candidateMoney` with a changed plan / Kukkiwon or an extra returned line — used by Change plan's "New total …" line and Mark check returned's sentence.

### 1.5 `money.js` additions (payment amounts: any cents, $0.01–$5,000)
- `parseAmount(text)` → `{cents}` or `{problem: 'empty'|'notNumber'|'tooManyDecimals'|'tooLow'|'tooHigh'}` ("290", "$290.50", "1,350" ok; "290.505" `tooManyDecimals`; "0" `tooLow`; > 5000 `tooHigh`; minus sign `notNumber`). Prices (`parsePrice`) stay as B1.
- `formatCents(cents)` → "$290", "$290.50", "$2,700", negatives "−$290" (U+2212, as drawn). `amountInputText(cents)` → "290" / "290.50".

---

## 2. Preview store (Builder B) — additions to `mockBlackBelt.js`

### 2.1 Handlers (one per SQL function, the **same check order and statuses** as 0016 §15–§16)
Add to `RPC_ARGS` (types: B1's plus new **`date`** (`YYYY-MM-DD` text, else `22007`) and **`text[]`** (an array of strings or null, else `22P02`) in `toDbType`): `bb_cycle_roster`, `bb_candidate_detail`, `bb_view_signature`, `bb_receipt`, `bb_add_candidate`, `bb_update_candidate`, `bb_change_plan`, `bb_resolve_duplicate`, `bb_withdraw_candidate`, `bb_restore_candidate`, `bb_delete_candidate`, `bb_record_paper_waiver`, `bb_record_payment`, `bb_undo_payment`, `bb_edit_payment`, `bb_record_refund`, `bb_mark_check_returned`. `ADMIN_ONLY` += withdraw, delete, edit payment, refund, mark returned, view signature (role checked right after access, as their SQL). `BB_WRITE_RPC_NAMES` += the 13 writes (so `failNextSave` covers them). `VOLATILE` += `bb_cycle_roster`. `RESTRICTED` keeps every internal helper.

Exactly as the SQL (builders re-read each function before writing its handler):
- **Add candidate:** access → input (`nameOk` both names, DOB not null / not after today / not before 1900, `emailIsValid(trim)`, a `locations` code, Dan 1–4, plan id, Kukkiwon not null, **`p_paper_waiver` true**) → `invalid` · cycle missing → `not_found` · `past` → `finished` (works while registration is closed) · plan not of this cycle → `invalid` · no current waiver → `invalid` · write: candidate (`source 'desk'`, `BB-` + `ref_counter`, normalized names, `kukkiwon_added_on` = today when chosen, duplicate flag + recheck the match), **paper** waiver row (current version, `signed_as_minor` = under 18 on the first day, `ticked_by_name` = actor, `signed_at` now) → purge.
- **Edit details:** `(DOB null) ≠ (email null)` → `invalid`; lock; version → `stale`; purged ≠ (DOB null) → `invalid`; Dan changed + `hasLivePayment` + not admin → `not_allowed`; write with **version + 1 on purpose** only when something changed; names/DOB changed → recheck duplicates (self, its new partner, anyone pointing at it); answer `needs_parent_signature` (under 18 on the current first day and the newest waiver `signed_as_minor` false).
- **Change plan:** nulls → `invalid` · `not_found` · `stale` · `withdrawn` · purged → `invalid` · plan of another cycle → `invalid` · has a live payment and not admin → `not_allowed` · write (`kukkiwon_added_on`: removed → null, kept → unchanged, newly chosen → today; unchanged → no write, no bump) · answer money.
- **Resolve duplicate / withdraw / restore / delete / paper waiver:** as SQL 15j–15n (restore: role rule after the version; "not withdrawn" → `stale`; delete: **any** `bb_payments` row, even undone → `has_payments`; delete cascades its waivers; withdraw/delete/keep-one recheck whoever pointed at it; paper waiver: purged → `invalid`, `past` → `finished`, bumps the version).
- **Record payment:** input (1–500 000; method; `for_items` 1–13, no null, no repeat, each `ITEM_PATTERN`; note ≤ 600 after normalizing) → lock → `stale` → `withdrawn` → every item in the candidate's **current** items (`kukkiwon` only when chosen) else `invalid` → insert `payment` (`paid_on` today, `location_code` = the candidate's school now, `cycle_name` = the cycle's name now, `recorded_at` now, `recorded_by` = `ctx.userId`, `recorded_by_name` = actor) → bump the candidate → purge → answer money.
- **Undo:** `not_found` → role (own row: `recorded_by === ctx.userId` and `recorded_at` within **10 s** of the store clock; else admin) → `not_allowed` → a reversal → `invalid` → already reversed → `stale` → a payment with a live returned mark → `invalid` → net floor (`net − amount < 0` for a positive row) → `invalid` → insert the **reversal** (−amount, **same method**, school and cycle name copied, `paid_on` today) → bump → money. Works on withdrawn candidates.
- **Edit payment:** admin → input (as record + reason required) → `not_found` → not a payment → `invalid` → reversed or live-returned → `stale` → `withdrawn` → an active refund → `invalid` → items → `invalid` → insert the reversal (`paid_on` today, reason) **and** the new payment (`paid_on` = **the old row's**, its school and cycle name, reason), **both with the same `recorded_at`** and `recorded_by` = the admin → bump → money.
- **Refund:** admin → input → lock → `stale` → `amount > net` (Σ all rows) → `{status:'refund_too_large', paid_cents}` → insert `refund` (−amount, today, method as chosen, school + cycle name of the **latest live non-returned payment**, else the candidate's own) → bump → money. Allowed on withdrawn candidates.
- **Mark check returned:** admin → note → `not_found` → not a `check` `payment` → `invalid` → reversed, or **any** returned row ever (even undone) → `stale` → insert **`returned`** (−amount, `method 'check'`, `paid_on` today, school + cycle name copied, the note, `reverses_payment_id` → the check) → bump → money. **Never** written as a `reversal` (Finance v0.809).
- **Guard (every insert into `bb_payments`, as `bb_payments_guard`):** one function `insertPayment(db, row)` that throws a check-violation (→ `invalid`) on: cycle ≠ candidate's cycle; repeated item; a reversal not exactly undoing one payment/refund/returned row of the same candidate (amount, method, school, cycle name); reversing a payment with a live returned mark; a returned row not marking a live check payment of the same candidate dated today; the **net floor** (`amount < 0 and net + amount < 0 and kind ≠ 'returned'`); a second reversal of one row or a second returned of one check (the two partial unique indexes → `stale`). **No code path updates or removes a `bb_payments` row**; `cascadeDeleteCycle` and delete candidate refuse (`has_payments`) before touching one.
- **Roster / detail / signature / receipt:** answers exactly SQL 16c–16f (keys, order, `money − items` on the roster; the detail's purge-day masking: DOB, email, age and signer name null once `purgeDueOn ≤ today` even before the purge ran; the receipt's `printed_by_name` = actor, `schools` with `testing_location_address` shape). The roster runs the purge **after** building its rows, as the SQL.

### 2.2 Purge — visible effects (already in B1; B2 makes them show)
After the purge (keep-years set + `setToday` past the purge day): the roster still lists the candidate; the detail shows DOB / email as "Deleted after the keeping time" and the waiver line "signature and signer's name deleted on [date] after the keeping time"; Edit details keeps DOB / email empty and read-only; Change plan, paper waiver and resolve duplicate answer `invalid`; payments, withdraw, restore, delete keep working.

### 2.3 Samples
- `bbSample()` (B1) unchanged.
- **`bbSampleRoster()`** — the mockups' Candidates 1 data for **Mon, Apr 26, 2027** (prints "Sample loaded — run __tkdPreview.setToday('2027-04-26') and reload."): B1's Spring 2027 + Fall 2027 with registration closed by date, and these 9 candidates (recorded by "Staff" unless said):

| Candidate | Dan · school · plan | Registered | Payments recorded | Shows on Apr 26 |
|---|---|---|---|---|
| Alex Kim (DOB 2012-03-04, signed by Jordan Kim as parent, form) | 1 · Shrewsbury · 3 payments + Kukkiwon | Mar 10 | Mar 27: check $390 {p1,kukkiwon}; check $290 {p2} "post-dated Apr 24"; check $290 {p3} "post-dated May 29" | Paid in full $0 |
| Mia Chen | 1 · Worcester · 3 payments | Mar 4 | Mar 20: card $870 {p1,p2,p3} | Paid in full $0 |
| Rina Patel | 1 · Worcester · In full | Mar 26 | — | Not paid $870 |
| Ava Brooks | 2 · Shrewsbury · 3 payments | Mar 12 | Mar 27 cash $330 {p1}; Apr 24 cash $330 {p2} | Next $330 by May 29 · $330 |
| Sam Lee | 2 · Worcester · 3 payments | Mar 8 | Mar 27 check $330 {p1} | Late · $330 since Apr 24 · $660 |
| Noah Silva ×2 (same DOB, possible duplicate) | 2 · Worcester · 3 payments / 3 payments + Kukkiwon | Mar 25 (twice) | — | Possible duplicate · $990 / $1,100 |
| Bao Nguyen | 3 · Shrewsbury · 3 payments + Kukkiwon | Mar 1 | Mar 27 check $640 {p1,kukkiwon} | Late · $500 since Apr 24 · $1,000 |
| Leo Garcia | 4 · Shrewsbury · 2 payments | Mar 15 | Mar 27 check $1,350 {p1} | Next $1,350 by May 29 · $1,350 |

  Cards on Both: 2 · 2 · 2 · 1, plus 2 duplicate rows left out (as drawn).
- **`bbSampleEdge()`** — `bbSampleRoster()` plus Candidates 9's rows and the cases the mockups don't draw: Lily Tran (1 · Shrewsbury · 3 payments + Kukkiwon; $390 {p1,kukkiwon} + $290 {p2} → Next $290 by May 29), Grace Owens (1 · Worcester · In full; Mar 20 check $920 "check written for $920" → Paid in full · ⚠ $50 overpaid, −$50), Omar Haddad (2 · Shrewsbury · 3 payments + Kukkiwon; $330 {p1}, {p2}, {p3} → Late · $110 Kukkiwon since Mar 27), a withdrawn candidate with one payment (Removed group), an under-18 with an adult-signed waiver (needs a parent's signature), and a desk candidate with a paper waiver.
- Both samples also fill the preview schools' street and phone **only if empty** (Worcester 1141 Main St, (508) 767-1717; Shrewsbury 370 Boston Turnpike, (508) 792-5534 — the mockup's sample data) through mockClient, which owns both stores.

### 2.4 Console helpers (shared `mockClient.js` — add only these; header comment updated)
| Helper | Does |
|---|---|
| `bbSampleRoster()`, `bbSampleEdge()` | §2.3 |
| `bbExpireUndo()` | moves the newest payment row's `recorded_at` 11 s back, so the staff Undo answers `not_allowed` |
| `bbAddDuplicate()` | adds a form registration with the same names and DOB as the first active candidate of the newest cycle (shows the duplicate box) |
| `failNextSave('blackBelt')`, `simulateOtherAdminEdit()` | existing; now cover the B2 writes, and `simulateOtherAdminEdit` also bumps every candidate's version (open dialogs get `stale`) |
| `setRole`, `setToday`, `setTestingDelay`, `resetBlackBelt` | existing, unchanged |

### 2.5 Store safety and production
As B1 §2.4–§2.5: `storage.js` only, damaged store → seed, schema `bb-1` unchanged (B2 adds no table), preview code only behind `isPreview`, absent from `dist/`. The store holds made-up people only.

---

## 3. Candidates screens (Builder C) — Candidates 1–7, 9 exactly as approved

### 3.1 Everywhere
- Rulebook §1–§8 and B1 §3 "Everywhere" apply: one primary button per view; dialogs 12px corners (PC/tablet centered, phones full screen with ←); unsaved-changes guard (v0.46/v0.56); toasts bottom-right (phones bottom-center), **5 s**, pause on hover/focus, Undo where listed; error banners stay with Retry; touch rows ≥ 44px, tap areas 44×44, ≤ 2 visible row actions on touch + ⋯; fields 32px (36px phones, 16px text); no sideways scroll at 320. Icons Tabler outline only (§3.11).
- **Reload** (`useLiveLoad`, as B1): the roster on open, location change, unlock, tab visible, after every own write, and quietly every 15 s while visible and unlocked — never touching open dialogs or typed text; no request while locked. An open detail re-reads its candidate after each own write.
- **Roles** (v0.210, mockup screen 2 table): the screen hides what a role can't do and grays what it can't do *yet* with the reason; the database decides. Staff: roster, cards, filters, search, Add candidate, Edit details, Record payment (+ 5-second Undo), Change plan before a payment, resolve duplicates, Print receipt, DOB and email in the detail. Admins also: Edit / Undo payment after the toast, Record refund, Mark check returned, Change plan or a Dan after a payment, Remove (Withdraw / Delete permanently / Restore), View signature.
- **Location switcher** (v0.118, approved "follow the location switcher"): on Worcester or Shrewsbury the roster and the cards show that school only, with the line "Showing Worcester candidates only · Show both schools" (the link calls `onLocationChange('Both')`); Both shows everyone. The duplicate box counts the shown rows.
- **Hide payments switch on** (v0.215, `usePaymentsHidden()`; the approved "mat-side tablet setting"): no cards, no Payments / Balance columns or pills, no Record payment, no payment items in any ⋯, no Print receipt, no Change plan amounts; the detail's Payments section reads "Payments are hidden on this device." and DOB / email read "Hidden on this device" (rule 5; §7 OP-B7). Add candidate grayed "Add new candidates at the desk." (§7 OP-B7).
- **Privacy:** no DOB, email or signature in the roster, cards, search, toasts, page title, address or console. The detail's data lives only while the dialog is open. The signature is shown only as `<img src>` in View signature and dropped on close.

### 3.2 Candidates 1 · the Candidates tab (CyclePage + `CandidatesTab.jsx`)
- **Header** (v0.45, v0.119): "← Black Belt testing", cycle name, the summary line (B1), **+ Add candidate** (primary, `ti-plus`; **N** on PC when no dialog is open) and the cycle's ⋯ (B1). Phones: the button under the summary. Only the **Candidates** tab label shows (Grading and Results come with B3/B4, P7). B1's preview-only "built in the next step" line goes.
- **Staff line** (screen 2, approved "only once registration has closed"): staff only, when they can't reopen (B1 `canOpen` false, not past): gray line under the tabs "Registration closed on Sat, Mar 27. Ask an admin to reopen it."
- **Duplicate box** (Star v0.114): amber, above the cards: "1 possible duplicate · Noah Silva (2nd Dan) is registered twice" + **Review** (opens Compare, §3.8); several pairs: one line per pair (§7 OP-B11).
- **Summary cards** (v0.219, §8 metric-card style): Paid in full (`ti-check`) · Paying on schedule (`ti-clock`) · Late (`ti-alert-triangle`) · Not paid (**not `ti-cash`**, §3.11) with `rosterCards` counts; gray line under them while duplicates are left out: "The 2 possible duplicate rows aren't counted in the cards until they're resolved." Clicking a card filters the list and shows "Showing late only · Show all" (pressed card highlighted; again = all). Phones: no cards; **pills** "Late 2" · "Not paid 1" (same filter) and "2 possible duplicates aren't counted until resolved."
- **Search** "Search candidates" (`ti-search`): names and reference, as you type.
- **PC columns** (1280): caption "9 candidates · Dan, then school, then last name"; Candidate ("Registered Mar 10" gray beside the name) · Dan · School · Plan (name + " · Kukkiwon") · Payments (one tag) · Balance · **Record payment** (secondary, rows with balance > 0) · ⋯. **Tablet** (820 touch): Candidate with "1st Dan · Shrewsbury" under it · Plan · Payments · Balance · ⋯ (Record payment in ⋯). **Phone**: name; "1st Dan · Shrewsbury · 3 payments · Kukkiwon"; tag + balance; ⋯; no row button.
- **Payments tag** (one per row, §8): `paid_in_full` green "Paid in full" (overpaid: amber "Paid in full · ⚠ $50 overpaid" and balance "−$50" amber) · `next` gray "Next $390 by Mar 27" · `late` amber "Late · $330 since Apr 24" (Kukkiwon only: "Late · $110 Kukkiwon since Mar 27") · `not_paid` red "Not paid" · `possible` duplicate: amber "⚠ Possible duplicate" (outranks the money tag; opens Compare). Balance = `balanceCents` (`formatCents`).
- **Order**: the SQL's (Dan, Shrewsbury, Worcester, last, first). **Removed** group at the bottom (Star v0.113): withdrawn rows with gray "Removed" (or "Duplicate copy") and their balance, collapsed by default with "Removed (2)" toggle (§7 OP-B10).
- **Row ⋯** (in this order, only what the role may do): Record payment (`ti-plus`; tablet/phone only) · Edit details (`ti-edit`) · Change plan or Kukkiwon (`ti-switch-horizontal`; staff after a payment grayed "$330 is already paid. Ask an admin.") · Record refund · $50 overpaid (`ti-receipt-refund`, admins, overpaid rows) · Print receipt (`ti-printer`) · Remove candidate (`ti-user-minus`, admins, §3.9). Removed rows: Restore (`ti-arrow-back-up`, admins) · Record refund (admins, paid > 0) · Print receipt · Delete permanently (admins). Row click / Enter (outside buttons) → detail. ↑ ↓ Enter through rows (`useRowArrowNav`).
- **States**: loading skeleton rows (< 1 s); load error banner + Retry; empty "No candidates yet. Families register with the cycle's links, or add one here." (not in the mockups); search with no match "No candidates match "[text]"." (not in the mockups).

### 3.3 Candidates 3 · Candidate detail (`CandidateDialog.jsx`)
- Opens from a row: PC/tablet centered dialog, phone full screen with ← and ⋯ in the header. **Read-only summary** (Star v0.112). Title = name; under it the tag (as the roster) and "Spring 2027 · 1st Dan · Shrewsbury".
- **Candidate**: Name · Date of birth "Mar 4, 2012 (15 on Apr 3, 2027)" · Email for results · School · Testing for. **Registration**: Registered "Wed, Mar 10, 2027 · family form (Shrewsbury link)" / "· at the desk" · Reference · Waiver: drawn "Signed by Jordan Kim (parent) · Mar 10 · version 2027-1 · on file" (adult: "Signed by Alex Kim · …") + **View signature** (admins, §3.10); paper "Signed on paper · Apr 26 · version 2027-1 · ticked by Staff"; purged "Signed on Mar 10, 2027 · version 2027-1 · signature and signer's name deleted on [date] after the keeping time". Withdrawn: "Removed [date] by [name]" (or "Duplicate copy").
- **Needs a parent's signature** (`needsParentSignature`, CONTRACT-0016 OI-2; not in the mockups, shown at CP2): amber box "[First] is under 18 on Apr 3, but the waiver was signed as an adult. Have a parent or guardian sign the paper waiver." + tick **Waiver signed on paper** → `recordPaperWaiver` → toast "Paper waiver recorded" (no Undo: rows are never removed).
- **Payments**: Plan "3 payments · $290 each, due Mar 27, Apr 24, May 29" (unequal "$400 + $470, due …"; one payment "In full · $870, due Mar 27"; dates = the candidate's item dates, S4) · Kukkiwon certificate "Yes · $100, due with payment 1" (added late: "Yes · $110, due Apr 26") / "No" · table **Date · For · How · Amount · Note · Recorded by** (+ ⋯ admins): For = items joined "Payment 1 + Kukkiwon" (one payment of a 1-payment plan: the plan name "In full"); a returned check's line keeps its row with note "· returned" and gray strike; its `returned` line "Apr 26 · Payment 2 · Returned check · −$290 · [note] · [recorder]" (For from `reversesPaymentId`'s line); refund "Refund · Cash · −$50". Phones: one two-line block per line ("Payment 2 $290" / "Mar 27 · Check · post-dated Apr 24 · by Staff"). Totals: Total due · Paid · Balance · Next due ("Paid in full" / "$290 by Apr 24" / "$290 · late since Apr 24" / not paid "$870 · was due Mar 27", from the items).
- **Buttons**: Close · Print receipt (`ti-printer`) · **Record payment** (primary, `ti-plus`; stays on paid-in-full candidates; hidden on withdrawn ones) · ⋯ Edit details · Change plan or Kukkiwon · Remove candidate (admins) / Restore (admins, withdrawn). Phone: Record payment + Print receipt at the bottom.
- **Payment line ⋯ (admins only)**: payment → Edit payment (`ti-edit`) · Undo payment (`ti-arrow-back-up`) · Record refund (`ti-receipt-refund`) · Mark check returned (`ti-ban`, check payments only). Grayed with the reason when the client can tell: an active refund → Edit "A refund is recorded. Undo the refund first."; a live returned mark → Edit / Undo "Undo the returned-check mark first."; a returned (live) line → Undo returned mark (`ti-arrow-back-up`); a refund line → Undo refund.
- **Edit details** (Star v0.112, same dialog turns into fields): First name, Last name (belt hint), Date of birth (B1 `DateField`, max today), Email for results, School, Testing for 1st–4th Dan; Save + Cancel (Cancel back to the summary). Staff with a live payment: Dan disabled with "A payment is recorded. Ask an admin to change the Dan." Admin changing the Dan with a payment: amber "$330 is already paid. Recorded payments stay as they are; the balance is worked out again." Purged: DOB and email read-only "Deleted after the keeping time". Errors amber under fields (form's wording). Save → toast "Changes saved" (no Undo, Save/Cancel pattern); `needsParentSignature` true in the answer → the amber box appears.

### 3.4 Candidates 4 · Record payment (`RecordPaymentDialog.jsx`, `ItemChecklist.jsx`)
- Title "Record payment"; subtitle "Alex Kim · 1st Dan · Shrewsbury · 3 payments + Kukkiwon".
- Line: "Owes $970 · due today: $390 (payment 1 $290 + Kukkiwon $100)" (items due today); with an earlier due date "Owes $660 · due now: $330 (payment 2 $330)"; nothing due yet "Owes $580 · next: $290 by Apr 24"; nothing owed "Paid in full. A payment here is counted as overpaid." (not in the mockups).
- **For (tick one or more)**: the unpaid items "Payment 1 · due Mar 27 · $290" (remaining amount). Pre-ticked = `defaultTicks`. Paid-in-full candidates: every item listed "(paid)", nothing ticked. **Amount** fills with the sum of the ticked items' remaining (each tick change refills it until the person types in Amount; then it stays) — editable, any cents. **Method** Cash · Check · Card (none chosen at first, §7 OP-B5). **Note (optional)** placeholder "e.g. post-dated Apr 24". Hint "Counts as paid today, Sat, Mar 27, like every check handed in today."
- Buttons PC/tablet: Cancel · **Save and record another** · **Save** (primary, `ti-check`); phone: Save, Save and record another (full width).
- Errors (on Save; not in the mockups): "Tick what this payment is for." · "Enter an amount, like 290 or 290.50." · "Use at most two decimals." · "The amount must be more than $0." · "One payment can be at most $5,000." · "Choose cash, check or card." · note "Use 600 characters or fewer."
- **Save** → `recordPayment` → close → toast "Payment recorded · $390 · Alex Kim · Undo" (Undo = `undoPayment(paymentId)`; after 10 s the database says `not_allowed` → toast "Too late to undo here. Ask an admin." (not in the mockups)). **Save and record another** → same toast, the dialog stays with the answer's money: the next unpaid item ticked, Amount = its remaining, the method kept, the note cleared, the candidate's new version used.
- `withdrawn` → "[Name] was withdrawn, so no payment can be recorded." · `stale` → "Someone else changed [Name] just now. Close and open them again to see the change." · `invalid` → "That didn't save. Check the fields and try again." · `error` → banner + Retry (dialog stays).

### 3.5 Candidates 5 · Admin payment actions
- **Edit payment** (`EditPaymentDialog.jsx`): "Alex Kim · Payment 2 · recorded Mar 27 by Staff"; **For** = the same checklist, pre-ticked with the row's items (§7 OP-B4); Amount, Method, Note prefilled; **Reason for the change** (required, placeholder "e.g. typed the wrong amount", error "Enter a reason for the change."); hint "The date (Mar 27) stays. The old and new values go in the change log." (§7.3: the new row's recorder is the editing admin). Save → toast "Payment changed · Undo" (Undo = `editPayment` back to the old values with reason "Undo of the change just made" — not in the mockups).
- **Undo payment** → §7 OP-B1 (working default: a short confirmation, then toast "Payment 2 undone · $290 · Alex Kim" without Undo). Statuses: `invalid` after a returned mark "Undo the returned-check mark first."; net floor "Undoing this would take the paid total below zero. Undo the refund first."; `stale` "This payment was already undone or changed."
- **Record refund** (`RefundDialog.jsx`): "Grace Owens · In full · paid $920 of $870", amber "Overpaid $50" when overpaid; Amount (default = overpaid amount, else empty), Method Cash · Check · Card, Note; hint "Fees are non-refundable. Record a refund only when money is handed back, for example an overpayment. It can't be more than $920 (what's been paid). It counts today." Client refuses above `paidCents`; `refund_too_large` → "A refund can't be more than $X (what's been paid)." Primary **Record refund** (`ti-check`). Toast "Refund recorded · $50 · Grace Owens · Undo" (Undo = `undoPayment(refund id)`).
- **Mark check returned** (`ReturnedDialog.jsx`): "Alex Kim · Payment 2 · $290 check recorded Mar 27"; sentence "The check stays in the history, marked returned. $290 goes back on Alex Kim's balance." + the predicted tag from `predictMoney` ("Payment 2 was due Apr 24, so the roster will show Late · $290 since Apr 24." / "…will show Next $290 by May 29." / "…Not paid."); Note (optional); primary **Mark returned** (`ti-ban`). Toast "Check marked returned · $290 · Alex Kim · Undo" (Undo = `undoPayment(returned row id)`). `stale` → "This check was already marked returned once. To mark it again, undo the payment and record it again." (§7.3).

### 3.6 Candidates 6 · Change plan or Kukkiwon (`ChangePlanDialog.jsx`)
- "Rina Patel · 1st Dan · Worcester"; **Plan** radio cards in the cycle's plan order (`position`), each "In full · Current · 1 payment · due Mar 27 · $870" / "3 payments · 3 × $290 · Mar 27, Apr 24, May 29 · $870" (amounts for the candidate's Dan; unequal "$400 + $470"); **Kukkiwon Dan certificate** No, thanks · Yes, add it · $100; line "New total $870 · 3 × $290, due Mar 27, Apr 24, May 29 · nothing paid yet" — or with payments "New total $1,100 · paid $330 · balance $770 · due now: $440 (Kukkiwon $110 + payment 2 $330)" (from `predictMoney`, Kukkiwon newly added = today).
- Staff after a live payment: the ⋯ item grayed "$330 is already paid. Ask an admin." (roster: `money.paidCents > 0`; detail: `hasLivePayment`; the database decides — `not_allowed` → "A payment is recorded. Ask an admin."). Admin after a payment: amber "$330 is already paid. Recorded payments stay as they are; the balance is worked out again."
- Save (blue only when something changed) → toast "Plan changed · Rina Patel · Undo" (Undo = `changePlan` back to the old plan and Kukkiwon with the new version; §7 OP-B9). `withdrawn` → "[Name] was withdrawn, so the plan can't change."; purged `invalid` → "This candidate's personal details were deleted after the keeping time, so the plan can't change."

### 3.7 Candidates 7 · Add candidate (`AddCandidateDialog.jsx`)
- Opens straight away from the header (no New / Make-up menu). Subtitle "Spring 2027 · for walk-ins and late families." + when closed "Registration closed on Sat, Mar 27; staff can still add here." (phone: first sentence only).
- Fields in the form's order: **School** (Worcester / Shrewsbury; starts on the device's school, empty on Both) · First name · Last name (hint "Spell it exactly as it should be printed on the black belt and certificate.") · Date of birth (`DateField`; hint "18 on the first testing day, so they sign for themself." / "Under 18 on the first testing day, so a parent or guardian signs the paper waiver.") · Testing for 1st–4th Dan · Kukkiwon Dan certificate No, thanks · Yes, add it · $[fee] · **How they'll pay** (plan cards as §3.6, before a Dan: "Amounts show once you choose a Dan.") · total line "Total $1,100 · $440 with payment 1 (includes Kukkiwon $110), then $330 and $330" — passed due dates count as today (S4) · Email for results · tick **Waiver signed on paper** (hint "The signed paper goes in the testing folder.").
- Add without the tick: amber "Tick this once the family has signed the paper waiver." Other errors: the form's wording (B1 Form 4) + "Choose the school." + "Choose how they'll pay." (not in the mockups).
- **Add candidate** (primary, `ti-check`) → `addCandidate` → toast "Ethan Park added · BB-5107" (admins: "· Undo" = `deleteCandidate`; staff: no Undo, §7 OP-B2); the row appears in Dan order. `finished` → "This cycle is finished, so candidates can't be added." A same-name + same-DOB match → the duplicate box appears (silent at save, as the SQL).

### 3.8 Possible duplicates (`DuplicateBox.jsx`, `CompareDialog.jsx`; Star v0.114, approved via screen 1)
Review (or the row tag) opens a side-by-side compare (PC/tablet two columns; phone stacked): Registered (date and time), Reference, Source, Date of birth, Email, Dan, School, Plan + Kukkiwon, Paid; differences highlighted. Data = `loadCandidate` for each side (DOB/email hidden with the Hide payments switch). Under each column **Keep this one**; bottom **Not the same person — keep both** and Close. Keep this one → `resolveDuplicate(keepBoth false)` → toast "Kept one Noah Silva · the other is under Removed · Undo" (Undo = `restoreCandidate(other)`, works for staff within 10 s). Keep both → toast "Both kept" (no Undo). `withdrawn` / `stale` → "These registrations changed just now. Close and open them again." (all not in the mockups).

### 3.9 Remove (`RemoveDialog.jsx`; v0.113, approved "Remove = Star's Withdraw / Delete permanently")
Remove candidate (admins) opens a small dialog: "Remove Alex Kim?" with two choices — **Withdraw** ("Kept under Removed, with their payments; can be restored.") → `withdrawCandidate` at once → toast "Alex Kim withdrawn · Undo" (Undo = `restoreCandidate`); **Delete permanently** (red, `ti-trash`) — grayed while `hasPaymentRows` with "Alex Kim has payment records, so they can't be deleted. Withdraw them instead." (v0.904 wording; also the answer to `has_payments`); otherwise a confirmation "Delete Alex Kim permanently? Their registration and signed waiver are deleted from Spring 2027. This can't be undone." / Keep candidate · **Delete permanently** (red) → toast "Alex Kim deleted" (no Undo).

### 3.10 View signature (`SignatureDialog.jsx`, admins)
From the waiver line: `loadSignature` → the picture (`<img alt="Signature of Jordan Kim">`, white background), "Signed by Jordan Kim · Mar 10, 2027". Paper only: "Signed on paper. There is no signature picture." Purged: "The signature and signer's name were deleted on [date] after the keeping time." Close. Not logged (S20).

### 3.11 Icons (orchestrator adds the rows to the icon map before the build, rule "added before used")
| Use | Icon | Note |
|---|---|---|
| Record payment (detail button, row ⋯) | **`ti-plus`** (proposed in place of the mockups' `ti-cash`, v0.303) | already "Add new"; the mockups' detail button already uses it — **for Jeffrey at CP2** |
| Not paid card | **`ti-circle-x`** (proposed in place of `ti-cash`) | new map row — **for Jeffrey at CP2** |
| Paid in full / Paying on schedule / Late cards | `ti-check` / `ti-clock` / `ti-alert-triangle` | as drawn (Star's cards do the same); the map's "`ti-check` only save/done" and `ti-clock` = Schedule rail are flagged at CP2 |
| Change plan or Kukkiwon | `ti-switch-horizontal` | new row |
| Record refund | `ti-receipt-refund` | new row (Star v0.508 on its branch) |
| Mark check returned | `ti-ban` | new row |
| Withdraw / Remove candidate | `ti-user-minus` | new row (named by v0.113) |
| Edit, Undo, Delete, Print, Search, Back, More, Save | `ti-edit`, `ti-arrow-back-up`, `ti-trash`, `ti-printer`, `ti-search`, `ti-arrow-left`, `ti-dots`, `ti-check` | existing |

### 3.12 Sizes the design review checks
1280×800 mouse, 820×1180 touch, 390×844 touch, 320 wide — every screen above, admin and staff where they differ, Hide payments on and off, Both and one school; with `bbSampleRoster()` (Apr 26) and `bbSampleEdge()`.

---

## 4. Receipt (Builder R) — Candidates 8

### 4.1 Interface (C opens it)
`<ReceiptDialog candidateId cycle={CycleDetail} isPhone onClose showToast />` — opened from the detail's Print receipt or the row ⋯. R calls `loadReceipt` itself. Not available while Hide payments is on (C hides the buttons).

### 4.2 Preview and print
- **Preview**: PC/tablet dialog "Receipt" / "Alex Kim · Spring 2027"; phone full screen "← Receipt"; the page drawn at reading size; **Print or save as PDF** (primary, `ti-printer`) + Close. Print → `ReceiptPage` into a portal + `window.print()` + removed after (Finance `PrintPage` pattern); `@media print` in `receipt.css` hides everything else. Loading / error states as §3.1. Nothing is logged (S20).
- **The page** (US Letter portrait, black on white): "Jae H. Jeong's U.S. Taekwondo Center" · "Black Belt testing · payment receipt" · Candidate "Alex Kim · 1st Dan" · Cycle "Spring 2027 · first testing day Sat, Apr 3, 2027" (first day from `cycle.state.firstDay`) · Reference · School (candidate's) · Plan "3 payments of $290 + Kukkiwon certificate ($100, with payment 1)" (amounts from `cycle.plans` / `cycle.kukkiwon` for the Dan — prices never change, v0.902; unequal "$400 + $470"; one payment "In full ($870)").
- Table **Date · For · How paid · Amount**: payment lines "Mar 27 · Payment 1 + Kukkiwon certificate · Check · $390"; a returned check's original line prints normally; the `returned` line "Apr 26 · Payment 2 · check returned · — · −$290" (item from `pairReturnedLines`; none found: "Check returned"); refund "Apr 26 · Refund · Cash · −$50". Lines oldest first (the SQL's order). A long history continues on page 2 with the table head repeated (`<thead>`).
- Totals: Total due · Paid to date · Balance — "$0 · paid in full" / "$290 · next due May 29" (`nextOn`) / "$290 · overdue" (late or not paid; §7.3) / "−$50 · overpaid".
- Footer: one line per school "Worcester · 1141 Main St · (508) 767-1717" (street only; an empty phone or address is left out) · "Printed Apr 26, 2027 by Staff. Fees are non-refundable." (`printedOn`, `printedByName`).
- **Never printed:** DOB, email, notes, reasons, "recorded by", signature, links.

---

## 5. Checks before a builder is done
| Check | Who |
|---|---|
| `npm run build` and `npm run build:preview-mode` pass | all |
| `node src/lib/blackBelt/checks.mjs` passes, with B2 case tables replaying `0016_tests.sql` T6–T7: `candidateItems` (S4 floor, late Kukkiwon, order); `candidateMoney` every T7b case (nothing paid before / on / after the first due date; three checks → paid in full; Kukkiwon-only late; extra payment → overpaid; a late family's dates; money for an item the plan lost → earliest unpaid; refund off overpaid then latest items; returned check not counted but still a live row → Late); `parseAmount` (0, 0.01, 290.50, 290.505, 5000, 5000.01, "-5", "1,350"); `formatCents`; `rosterCards` (duplicates and withdrawn left out, one school); `pairReturnedLines`; store statuses for every §1.2 function in the SQL order (access → role → input → not found → stale → rules), incl. staff Undo < 10 s ok / after `bbExpireUndo` `not_allowed`, undo twice `stale`, undo a reversal `invalid`, undo under a returned mark `invalid`, net floor `invalid`, edit = exactly two rows with the same `recorded_at` and the old `paid_on`, edit with an active refund `invalid`, refund above net `refund_too_large` + `paid_cents`, returned = kind `returned` dated today (never `reversal`), returned twice `stale` (also after its undo), returned after a refund may take the net below zero, delete with an undone payment `has_payments`, Dan change after a payment staff `not_allowed`, purged → `invalid` where SQL says; the roster/receipt answers never contain `date_of_birth`, `email_for_results`, `signer_name`, `signature`, `note` (receipt), `recorded_by`; no store function ever changes or removes a `bb_payments` row (a snapshot before/after comparison of existing rows) | B |
| `node src/lib/testing/checks.mjs` and `node src/lib/finance/checks.mjs` still pass (mockClient changed) | B |
| `dist/` (production build) contains no `mockBlackBelt`, `bbSampleRoster`, `__tkdPreview`, Black Belt staff screen, `service_role`, secret or `.env` value | B, C, R |
| PGlite **not** run by builders (nothing under `supabase/` changes); the orchestrator checks it is untouched | orchestrator |
| CRLF unchanged; header comment on every new file; `git status` never lists `.env.local`, `node_modules`, `dist`, `dist-preview` | all |
| Builder's own run in preview at the four sizes, admin and staff, Hide payments on/off, Both and one school, with both samples; print preview of the receipt (incl. a two-page history) | C, R |

## 6. Reviews (orchestrator, separate agents, before CP2 for B2)
- **Security review** (data layer, store, screens, receipt): granted columns only; DOB / email / signer name only from `loadCandidate`, signature only from `loadSignature` (admins); none in the roster, cards, search, toasts, address, storage (beyond the fake store), console or print; volatile calls never GET; append-only respected in the store (no update/remove path for `bb_payments`); returned checks never written as reversals; Finance's columns (CONTRACT-0016 §4.4) unchanged; role hiding matches v0.210 and the database refusals; Hide payments hides every money and DOB/email spot; preview code absent from `dist/`.
- **Design review** against the rulebook and the approved Candidates 1–9 (status §3b, v0.900) with screenshots at **1280×800 mouse, 820×1180 touch, 390×844 touch, 320 wide**: wording word for word, columns per size, tags and colors, cards/pills and filters, duplicate box and compare, detail at each size, Record payment's checklist and "Save and record another", admin ⋯ items and grayed reasons, change plan lines, add candidate errors, receipt preview and printed page, toasts with Undo, one primary button, ≤ 5 blue elements, touch targets, keyboard (Tab, Esc, arrows, N), focus moves, no sideways scroll, **the icons of §3.11 (no `ti-cash` outside cash)**.
- Fixes → re-review → **CP2 (B2)**: Jeffrey's walkthrough in preview with the §7 points shown; his OK is a 0.9xx rulebook row and a status-file line. Then B3.

---

## 7. Open points (each with the working default the builders use)

### 7.1 For Jeffrey (they change something approved; decide before CP2)
| # | Point | Working default |
|---|---|---|
| **OP-B1** | **Undo payment can't be undone.** The mockup's toast "Payment 2 undone · … · Undo", but the database refuses to undo an undo (a reversal can't be reversed, SQL 15p) — and rule 1.4 says an action that can't be undone gets a confirmation | **Decided by Jeffrey 2026-10-21 (v0.912): A, as the default.** A short confirmation "Undo payment 2? $290 check from Mar 27 comes off Alex Kim's balance. The history keeps it." / Cancel · **Undo payment**, then toast "Payment 2 undone · $290 · Alex Kim" (no Undo). Alternative: no dialog, and the toast's Undo records the same payment again as a new row dated today (wrong day for Finance when the payment was earlier) |
| **OP-B2** | **Staff can't undo Add candidate.** The mockup's toast "Ethan Park added · BB-5107 · Undo"; removing a candidate is admin-only in the database (v0.210) | **Decided by Jeffrey 2026-10-21 (v0.913): A, as the default.** Admins get Undo (Delete permanently; nothing is paid yet). Staff see "Ethan Park added · BB-5107" without Undo and fix mistakes with Edit details or ask an admin |
| **OP-B3** | **Icons (v0.303).** The mockups use `ti-cash` on Record payment and the Not paid card | **Decided by Jeffrey 2026-10-21 (v0.914): A — Record payment `ti-cash-plus`, Edit payment `ti-cash-edit`, Not paid `ti-circle-x`.** Record payment `ti-plus`, Not paid `ti-circle-x` (§3.11); the other new icons go in the map |

### 7.2 Smaller points (defaults shown to Jeffrey at CP2)
| # | Point | Working default |
|---|---|---|
| OP-B4 | Edit payment's For is drawn as one dropdown, but a payment can be for several items ("Payment 1 + Kukkiwon") | The same checklist as Record payment, pre-ticked with the row's items |
| OP-B5 | Record payment's Method has no starting value in the mockups | Nothing chosen at first (a wrong default would put cash on Finance's check line); "Save and record another" keeps the last method |
| OP-B6 | Amount editing vs ticks | Ticks refill the Amount until the person types in it; after that ticks don't change it |
| OP-B7 | "Mat-side tablet setting" (approved) vs the live **Hide payments** switch (v0.215, which replaced the mat-side setting) and Star's planned widening to DOB/email (v0.506, not on `main` yet) | Use Hide payments; hide all money **and** DOB/email ("Hidden on this device"), Add candidate grayed "Add new candidates at the desk." (Star v0.507 Q1 pattern) |
| OP-B8 | Receipt and Edit details for a candidate whose first testing day changed | Ages and "under 18" always use the cycle's current first day (SQL) |
| OP-B9 | Undo of a Change plan that removed Kukkiwon re-adds it **dated today** (the database stamps the day it's chosen), so a fee that was due with payment 1 becomes due today | Accepted (no other way back); toast Undo still offered |
| OP-B10 | The Removed group isn't drawn in the Black Belt mockups | Star v0.113: bottom of the list, collapsed "Removed (N)", gray "Removed" / "Duplicate copy" tag, balance shown, not counted in cards |
| OP-B11 | Several duplicate pairs | One line per pair in the box, each with Review |
| OP-B12 | Wording not in the mockups (errors, empty states, Compare, Remove, paper-waiver box, statuses) | As written in §3; marked in `text.js` |
| OP-B13 | Desk add while the seeded **placeholder** waiver is current (the database allows it; only opening registration is refused) | Allowed; the detail shows "version 2026-1"; B1's amber placeholder line on Rubric and prices already warns |
| OP-B14 | The family "Registered" date on PC rows ("Registered Mar 10") | School date of `registered_at`, short month-day |
| OP-B15 | Toast amounts with cents | `formatCents` ("$290.50") everywhere money is shown in B2 |
| OP-B16 | Finance's Daily report in preview doesn't list Black Belt payments | Out of B2: Finance reads `bb_payments` through its own function later (CONTRACT-0016 §4.4); nothing in B2 for it |
| OP-B17 | The receipt's school phones (B1 OP-21) | From `locations.phone`; an empty phone is left out; the samples fill the preview's phones if empty |

### 7.3 Where the SQL differs from the mockups or CONTRACT-0016 (the SQL wins; no change asked)
- `bb_edit_payment` writes the new row with **the editing admin as recorder** (and `recorded_at` now); only the date, school and cycle name stay. So Edit's hint drops "and who recorded it stays", and after an edit the detail's "Recorded by" shows the admin (the first recorder stays in the change log).
- `bb_undo_payment`, `bb_edit_payment`, `bb_mark_check_returned` take no expected version; a double click answers `stale`.
- An undo keeps the row's method (guard `bb_payments_reversal_check`), so Finance's cash/check/card totals stay right.
- **"Has a payment"** (staff/admin split, Not paid vs Late) counts a payment whose check was marked returned: a family whose only check bounced shows **Late**, and staff need an admin to change their plan.
- A check marked returned once can't be marked again, even after that mark was undone (`stale`); the detail can't show this in advance (undone rows aren't returned).
- `bb_record_refund` caps a refund at the **net paid** (all rows), not at the overpaid amount (differs from Star v0.172; matches the mockup's "can't be more than what's been paid"). Refund methods include Card (as drawn).
- `bb_cycle_roster` rows have no withdrawn date or name: the Removed group shows the tag only; "Removed [date] by [name]" is in the detail.
- `bb_candidate_detail` also returns `id`, `note`, `reason` and `reverses_payment_id` per line (CONTRACT-0016 §7 listed fewer); the money tag's `late_since` is only set for `late` — a Not paid candidate's "was due" date comes from the items.
- `bb_receipt` has no row ids, first testing day, plan amounts, phones or late date: R takes the first day and amounts from the cycle page's data, phones from `locations`, names a returned line by pairing (`pairReturnedLines`), and writes "· overdue" instead of the mockup's "was due Apr 24".
- `bb_resolve_duplicate` answers `withdrawn` if either side is withdrawn and `stale` if the pair is no longer marked; `bb_restore_candidate` answers `stale` for a candidate who isn't withdrawn.
- `bb_change_plan` with nothing changed writes nothing and keeps the version (still `ok` with money).
- Allowed while the cycle is Past: payments, refunds, undo, edit, returned checks, Edit details, Change plan; refused: Add candidate and paper waiver (`finished`).
