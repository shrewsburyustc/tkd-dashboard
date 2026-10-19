// db.js — the Function's ONLY way into the database.
// Why it exists: the registration Function may call exactly two database functions, as the
// restricted login `testing_registrar` (contract 0005 §1.8, §1.10):
//     public.testing_public_event(code)          — what the form needs to show
//     public.testing_public_register(...)        — save one registration
// Keeping both calls in this one small file makes it easy to check that nothing else is ever
// sent to the database.
//
// How it connects: through Cloudflare **Hyperdrive** (the binding named HYPERDRIVE), a
// connection helper that sits between Cloudflare and Supabase. Its connection string holds the
// registrar's password, so the password lives only in Cloudflare — never in this code or git.
// Driver: Postgres.js (`postgres`, exact version pinned in package.json).
//   prepare: false   Hyperdrive shares connections between requests ("transaction pooling"),
//                    where saved ("prepared") statements don't work — so don't make any.
//   max: 1           one connection per request is plenty (one query each).
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice         ignore database notices instead of printing them to the log (a notice
//                    could contain details we must never log).
// Every value goes in as a separate typed parameter (`${value}::type` below). Postgres.js sends
// them apart from the SQL text, so nothing a family types can ever change the SQL itself.
import postgres from 'postgres';

// jsonb answers normally arrive already turned into objects; this also copes with text.
function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

// Opens one client for one request. The caller MUST call close() (the Function does it with
// context.waitUntil, so closing doesn't slow the answer down).
export function openDatabase(env) {
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });

  return {
    async publicEvent(code) {
      const rows = await sql`select public.testing_public_event(${code}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    async publicRegister(args) {
      const rows = await sql`
        select public.testing_public_register(
          ${args.code}::text,
          ${args.clientKey}::text,
          ${args.submissionId}::uuid,
          ${args.first}::text,
          ${args.last}::text,
          ${args.eventRankId}::uuid,
          ${args.payingBy}::text,
          ${args.stripes}::boolean,
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
