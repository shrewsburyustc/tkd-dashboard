# FUNCTION-API — how the family page talks to the Function (Board breaking, last batch)

Approved design: `CONTRACT-0051.md` §5 and §6; database: `SIGNATURES-0051.md` (live since 2026-11-13). This file only fixes the
JSON between the page (`src/breaking/*`) and the Cloudflare Function (`functions/api/breaking/[code].js`) so two people can build
each side. Copy Camps (`functions/api/camp/[code].js`, `functions/_lib/camp.js`, `campDb.js`, `src/camp/api.js`) for everything not
stated here. Every answer is JSON with a text `status`; HTTP 400 only for `bad_request`; `Cache-Control: no-store`.

## GET /api/breaking/<code>  → the event
`{status:'ok', event:{name, location_code, event_date, registration_state:'open'|'closed', classes:[{id,name,start_time,end_time}],
prices:{tech_cents, adult_cents, card_extra_cents, same_day_extra_cents, same_day}, child_max_age, chart:[{band, rank_name, sort,
technique, tech_boards, adult_boards}]}, turnstile_site_key}` or `{status:'not_found'|'not_open'|'rate_limited'|'unavailable'}`.
(`not_open` = the Function's switch / Cloudflare variables are not complete.) The page never sees an id of a student.

## POST /api/breaking/<code>   (Content-Type application/json, ≤ 256 KB; Origin checked with `functions/_lib/origins.js`)
All three actions carry `turnstile_token`, `website` (honeypot, must be empty), `started_at` and `sent_at` (ms; the form must have
been open ≥ 4 s) — except `status`, which needs only the rate limit.
1. `{action:'signup', submission_id (uuid made by the page), first_name, last_name, age, rank_name, class_id, tech, adult, paying_by:'cash'|'check'|'card', expected_total_cents}`
   → Turnstile action `breaking_signup` → `brk_public_signup`. Answer:
   `{status:'ok', amount_cents, paying_by, same_day, pay:{state:'link', url} | {state:'failed'} | {state:'none'}}`
   (`pay.state` is `link` only for Card with a Square link made; `failed` for Card when Square could not make one or that school's Square
   set is incomplete — the page says "You're registered. Pay at the front desk" + **Try again**; `none` for cash/check),
   or `{status:'invalid', field}` · `closed` · `full` · `duplicate` · `price_changed` + `amount_cents` · `rate_limited` ·
   `verify_failed` · `not_open` · `not_found` · `unavailable` · `bad_request`.
2. `{action:'pay', submission_id}` ("Try again") → Turnstile action `breaking_pay` → `brk_public_registration` then the same Square step
   with the **balance** → `{status:'ok', amount_cents, pay:{...}}` | `not_found` | `paid` (already paid) | the refusals above.
3. `{action:'status', submission_id}` (the return page after Square) → `brk_public_registration` →
   `{status:'ok', paid:boolean, amount_cents (balance), paying_by}` | `not_found`. The page remembers `submission_id` in this browser only
   (localStorage); it is **never** put in an address, a log line or an error message.

## Square step (server side only; the browser never sees a token, location id or amount it chose)
After `brk_public_signup` is `ok` with `paying_by = card` (and for action `pay`): choose the school's credentials by the event's
`location_code` (`SQUARE_*_WORCESTER` / `_SHREWSBURY`; any missing → `pay.state:'failed'`, nothing else); call Square's CreatePaymentLink
(`POST {base}/v2/online-checkout/payment-links`, base `https://connect.squareup.com` or, when `SQUARE_ENVIRONMENT_<SCHOOL>` is
`sandbox`, `https://connect.squareupsandbox.com`; headers `Authorization: Bearer <token>`, `Square-Version: 2024-12-18`; body
`{idempotency_key: <the registration id that `brk_public_signup` / `brk_public_registration` returned to the Function (never sent to the browser), so a retry gets the same link>, quick_pay:{name:'Board Breaking — <first name>', price_money:{amount:<balance cents from the database>, currency:'USD'}, location_id}, checkout_options:{redirect_url:'<publicOrigin>/breaking/<code>?paid=1', ask_for_shipping_address:false}}`);
take `payment_link.url` and `payment_link.order_id`; store them with `brk_public_set_link(registration_id, submission_id, order_id, url, balance_cents)`;
answer `pay:{state:'link', url}`. Any Square or database error → `pay.state:'failed'` (the student stays registered). Never log the token,
the body or the url.

## Square webhooks — `functions/api/square/breaking/[school].js`  (`/api/square/breaking/worcester|shrewsbury`)
POST only, no Origin check. `[school]` must be `worcester` or `shrewsbury` else 404. Needs `SQUARE_WEBHOOK_SIGNATURE_KEY_<SCHOOL>`,
`SQUARE_WEBHOOK_URL_<SCHOOL>`, `SQUARE_LOCATION_ID_<SCHOOL>` and the `HYPERDRIVE_BREAKING_SQUARE` binding, else 503 (fails closed). Verify
`base64(HMAC-SHA256(key, SQUARE_WEBHOOK_URL + raw body))` against header `x-square-hmacsha256-signature` in **constant time** BEFORE
parsing (403 on mismatch). Accept only `type = payment.updated` **whose `payment.location_id` equals that school's `SQUARE_LOCATION_ID_<SCHOOL>`** (any other payment on the same Square account — dues, retail — is answered 200 "ignored" with no database call; a missing location variable is a 503); read `event_id`, `data.object.payment.{id, order_id, status,
amount_money.{amount,currency}}`; call `brk_square_payment(school-from-the-path, event_id, payment id, order id, amount, currency,
status)` as `brk_square`; answer 200 for every outcome (so Square stops retrying), 500 only on a database error. Logs: outcome word
and timing only.

## Cloudflare names (set by Jeffrey; see SETUP 0051g)
`HYPERDRIVE_BREAKING` (binding, `brk_registrar`), `HYPERDRIVE_BREAKING_SQUARE` (binding, `brk_square`), `BREAKING_REGISTRATION`
(`on`/`off`), `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `CLIENT_KEY_SECRET`, `PUBLIC_ORIGIN` (Domain's helper), and per school
`SQUARE_ENVIRONMENT_`, `SQUARE_ACCESS_TOKEN_`, `SQUARE_LOCATION_ID_`, `SQUARE_WEBHOOK_SIGNATURE_KEY_`, `SQUARE_WEBHOOK_URL_` + `WORCESTER` / `SHREWSBURY`.
