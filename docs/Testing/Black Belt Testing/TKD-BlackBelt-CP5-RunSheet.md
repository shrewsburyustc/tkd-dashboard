# Black Belt testing — CP5 run sheet: Cloudflare setup for the family form

**What this is:** checkpoint CP5 (contract `docs/Dashboard Docs/Build contracts/CONTRACT-0016.md` §13, SETUP "Migration 0016" step **0016f**), in order. It connects the Black Belt family form's Function to the database, **with the form switched off**. Nothing here deploys anything; Cloudflare uses the new settings from the next deployment (the push after the merge into `main`, which needs its own OK).
**Already in place (shared with Color Belt, nothing to do):** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN` (Production variables), the Turnstile widget for `tkd-dashboard.pages.dev`, and Supabase's CA certificate in Cloudflare (`ustc-color-belt-staging-supabase-ca`). Turnstile needs no change: the page asks for action `bb_register` and the Function refuses any other action.
**Not needed (rulebook v0.410):** no `RATE_LIMITER` binding (Pages Functions can't have one).
**Nothing secret goes into chat or a screenshot.** The password stays in your password manager.

---

## 1. Hyperdrive configuration `tkd-bb-registrar` (you, Cloudflare, ~5 min)

The same way as Color Belt's `tkd-registrar` (SETUP 12g, "what the dashboard actually looked like"):

1. **Open the form:** Cloudflare → **Storage & databases → Postgres & MySQL (Hyperdrive) → Connect database → Connect to public database**.
2. **Use Manual entry (advanced)**, and **leave the Connection String box empty.** Cloudflare would write the password there in plain text.
3. **Fill in:**

   | Field | Value |
   |---|---|
   | Name | `tkd-bb-registrar` |
   | Host | `aws-0-us-east-1.pooler.supabase.com` |
   | Port | `5432` |
   | Database | `postgres` |
   | User | `bb_registrar.eozkfbdfxqlcbpewhach` |
   | Password | from Google Password Manager, "Supabase bb_registrar (Hyperdrive)". If Chrome autofills a different saved password, clear it first. |

4. **Server certificates → Verify full**, with the existing `ustc-color-belt-staging-supabase-ca`.
5. **Create.** The test connection must pass. If it fails, tell me the message (not the password).
6. **Settings after creating:**
   - **Caching: Disabled.**
   - **Origin connection limit: 5.** It's created at 20; lower it to 5 in the configuration's Settings, as Color Belt's was.

## 2. Binding (you, Cloudflare, ~1 min)

`tkd-dashboard` (the Pages project) → **Settings → Bindings → Add → Hyperdrive**:
- **Variable name:** `HYPERDRIVE_BB` (exactly this, not `HYPERDRIVE`, which is Color Belt's)
- **Configuration:** `tkd-bb-registrar`
- **Environment:** **Production only**

## 3. The form's own switch, set to off (you, Cloudflare, ~1 min)

`tkd-dashboard` → **Settings → Variables and Secrets → Add** (Production):
- **Name:** `BB_PUBLIC_REGISTRATION`
- **Value:** `off`
- **Type:** text, not secret

(A missing value also means off. Setting it explicitly makes the switch visible and ready for CP6.)

**Don't retry or start a deployment.** The settings take effect with the next one.

## 4. My checks (read-only, through the Cloudflare connection)

- **The configuration:** `tkd-bb-registrar` exists, with caching disabled, `verify-full`, origin limit 5, user `bb_registrar.eozkfbdfxqlcbpewhach`. I check only this; the password isn't shown.
- **Color Belt untouched:** its `tkd-registrar` is unchanged.
- **Nothing triggered:** no deployment.

## 5. Optional: a write check on this PC against the real database

The contract's CP5 also asks for a check with real writes: add a test cycle, a desk candidate, a payment and its undo.

- **The catch:** payments can never be deleted, so a cycle with any payment line stays in the database **forever**.
- **Already proven:** `0016_tests.sql` exercised every money function on production, rolled back.
- **My recommendation:** only **add a test cycle** named "TEST – delete me" through the app, then **Delete cycle**. That's allowed while it has no payments and no online waivers. It proves the app's writes work against the real database. The history (change_log) keeps the add and the delete, which is normal.

---

## If something goes wrong

- **The test connection fails:** check the user name (with `.eozkfbdfxqlcbpewhach`), the port (5432, not 6543) and the password entry. Then tell me the error message.
- **A setting went to the wrong place:** an extra binding or variable does nothing until the next deployment, so it can simply be removed.
- **Emergency off switch** (once the form is live): SETUP **0016g**.
