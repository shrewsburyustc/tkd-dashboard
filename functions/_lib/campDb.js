// campDb.js — the camp sign-up Function's ONLY way into the database.
// Why it exists: the camp sign-up Function may call exactly two database functions, as the
// restricted login `camps_registrar` (contract 0013 §1.16, §1.18):
//     public.camp_public_camp(code)        — what the family form needs to show
//     public.camp_public_signup(...)       — save one family's sign-up (1–3 children)
// Keeping both calls in this one small file makes it easy to check that nothing else is ever
// sent to the database. It is a copy of db.js (Color Belt's) with the camp functions.
//
// How it connects: through Cloudflare **Hyperdrive**, the binding named HYPERDRIVE_CAMPS (its
// own connection string with the camps_registrar password, so Camps can be switched off without
// touching Color Belt). The password lives only in Cloudflare — never in this code or git.
// Driver: Postgres.js (`postgres`, exact version pinned in package.json), same settings as db.js:
//   prepare: false      Hyperdrive shares connections ("transaction pooling"), where saved
//                       ("prepared") statements don't work — so don't make any.
//   max: 1              one connection per request is plenty (one query each).
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice            ignore database notices instead of printing them to the log.
// Every value goes in as a separate typed parameter (`${value}::type` below). Postgres.js sends
// them apart from the SQL text, so nothing a family types can ever change the SQL itself.
// The children list is sent as JSON TEXT (`::text`) and only then turned into jsonb by the
// database (`(…)::jsonb`); the database checks its shape before using any of it.
// Why not cast the parameter straight to jsonb: Postgres.js then sees a jsonb parameter and runs
// JSON.stringify on our already-stringified text a second time, so the database gets one
// long string instead of a list and answers "invalid" (found in the live phone test,
// 2026-10-21 — the tests use a fake database, so they couldn't see it). functions/_lib/forms/db.js
// hit the same bug and uses the other correct form, sql.json(value) — don't mix the two up.
import postgres from 'postgres';

// jsonb answers normally arrive already turned into objects; this also copes with text.
function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

// Opens one client for one request. The caller MUST call close() (the Function does it with
// context.waitUntil, so closing doesn't slow the answer down).
export function openCampDatabase(env) {
  const sql = postgres(env.HYPERDRIVE_CAMPS.connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });

  return {
    // Statement 1 of 2.
    async publicCamp(code) {
      const rows = await sql`select public.camp_public_camp(${code}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    // Statement 2 of 2. `args` is made by camp.js (readFields) — only checked values.
    async publicSignup(args) {
      const rows = await sql`
        select public.camp_public_signup(
          ${args.code}::text,
          ${args.clientKey}::text,
          ${args.submissionId}::uuid,
          (${JSON.stringify(args.children)}::text)::jsonb,
          ${args.parentName}::text,
          ${args.parentPhone}::text,
          ${args.parentRelation}::text,
          ${args.emergencyName}::text,
          ${args.emergencyPhone}::text,
          ${args.emergencyRelation}::text,
          ${args.payingBy}::text,
          ${args.acknowledged}::boolean,
          ${args.signature}::text,
          ${args.ackVersion}::text,
          ${args.waiverVersion}::text,
          ${args.expectedTotalCents}::integer
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      // Wait at most 2 seconds for the connection to finish politely, then cut it.
      return sql.end({ timeout: 2 });
    },
  };
}
