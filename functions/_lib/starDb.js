// starDb.js — the Star family form Function's ONLY way into the database.
// Why it exists: the Star registration Function may call exactly two database functions, as the
// restricted login `star_registrar` (CONTRACT-0006 §8.1–§8.3, rulebook v0.159):
//     public.star_public_event(code)          — what the Star form needs to show
//     public.star_public_register(...)        — save one Star candidate's registration
// Keeping both calls in this one small file makes it easy to check that nothing else is ever
// sent to the database (functions/tests/starRegister.test.mjs reads this file and checks it).
// A copy of Color Belt's functions/_lib/db.js, with Star's two functions and its own binding;
// Color Belt's file is not changed.
//
// How it connects: through Cloudflare **Hyperdrive**, the binding named HYPERDRIVE_STAR — a
// SECOND Hyperdrive configuration (`tkd-star-registrar`, caching disabled, SETUP §13f) whose
// connection string holds star_registrar's password, so the password lives only in Cloudflare —
// never in this code or git. Color Belt's binding (HYPERDRIVE) is never used here.
// Driver: Postgres.js (`postgres`, exact version pinned in package.json).
//   prepare: false   Hyperdrive shares connections between requests ("transaction pooling"),
//                    where saved ("prepared") statements don't work — so don't make any.
//   max: 1           one connection per request is plenty (one query each).
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice         ignore database notices instead of printing them to the log (a notice
//                    could contain details we must never log).
// Every value goes in as a separate typed parameter (`${value}::type` below), in the exact order
// and with the exact types of the database function (migration 0006 §20a, §20c). Postgres.js
// sends them apart from the SQL text, so nothing a family types can ever change the SQL itself.
import postgres from 'postgres';

// jsonb answers normally arrive already turned into objects; this also copes with text.
function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

// Opens one client for one request. The caller MUST call close() (the Function does it with
// context.waitUntil, so closing doesn't slow the answer down).
export function openDatabase(env) {
  const sql = postgres(env.HYPERDRIVE_STAR.connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });

  return {
    async publicEvent(code) {
      const rows = await sql`select public.star_public_event(${code}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    // The 13 values of star_public_register(p_code, p_client_key, p_submission_id, p_first,
    // p_last, p_date_of_birth, p_email, p_dan, p_stars_from, p_paying_by, p_acknowledged,
    // p_signature, p_ack_version), in that order.
    async publicRegister(args) {
      const rows = await sql`
        select public.star_public_register(
          ${args.code}::text,
          ${args.clientKey}::text,
          ${args.submissionId}::uuid,
          ${args.first}::text,
          ${args.last}::text,
          ${args.dateOfBirth}::date,
          ${args.email}::text,
          ${args.dan}::integer,
          ${args.starsFrom}::integer,
          ${args.payingBy}::text,
          ${args.acknowledged}::boolean,
          ${args.signature}::text,
          ${args.ackVersion}::text
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      // Wait at most 2 seconds for the connection to finish politely, then cut it.
      return sql.end({ timeout: 2 });
    },
  };
}
