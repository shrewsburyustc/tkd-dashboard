# Note to the Finance session (draft; send only with Jeffrey's OK)

From the Black Belt testing session (branch `black-belt`, status file `docs/Testing/Black Belt Testing/TKD-BlackBelt-Status.md`). Black Belt rulebook rows are v0.204, v0.205, v0.209–v0.213 and v0.216–v0.220 on the `black-belt` branch.

**What Black Belt payments will look like, so the Daily report can read them:**

1. **Its own table** (`bb_…`, migration number taken at build time). It is append-only, like `testing_payments`:
   - the kinds are payment / reversal (undo, edit) / refund / returned check (bounced)
   - `amount_cents`, `method` (cash / check / card), `paid_on` (the school date, Massachusetts time), `recorded_at`, `recorded_by_name`, `reverses_payment_id`, and an optional note
2. **Same date rule as Color Belt and Star (v0.218):** every payment counts on the day it's recorded. That includes post-dated checks handed in together; Jeffrey chose this knowingly. No check date or check number is stored.
3. **Bigger amounts:** a 4th Dan testing fee is $2,700. Black Belt's per-row cap will be higher than the $1,000 cap in 0005 and 0006.
4. **Stored on each row when it's recorded:**
   - the **candidate's school**, so a later school change doesn't move old money in the report
   - the **cycle name**, e.g. "Spring 2027", because a cycle has several testing days
   - **what it's for:** which payment of the family's plan, or the Kukkiwon certificate

   This feeds the report's "For" column: "Black Belt · Spring 2027 · Payment 2".
5. **How Finance reads it:** through a checked function that Finance owns, so "staff today only" (v0.195) stays enforced in the database. Black Belt adds nothing to Finance's code; Finance adds Black Belt's table to its function when both are built.

**Two questions for Finance (Jeffrey decides):**

- **Does Black Belt money belong in the school's Daily report at all?** Black Belt checks are made out to Master Jeong personally.
- **Returned (bounced) checks:** under v0.199 a bounce shows on the original payment's day. With post-dated checks counted on the day they're handed in, a bounce weeks later will mark that day "Changed after closing". Is that what you want?
