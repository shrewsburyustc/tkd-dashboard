// bbDb.js — the Black Belt Function's ONLY way into the database.
// Why it exists: the Black Belt registration Function may call exactly two database functions,
// as the restricted login `bb_registrar` (CONTRACT-0016 §8, migration 0016 §14 and §17):
//     public.bb_public_cycle(code)          — what the family form needs to show
//     public.bb_public_register(...)        — save one candidate's registration
// Keeping both calls in this one small file makes it easy to check that nothing else is ever
// sent to the database. It is Black Belt's own copy of Color Belt's functions/_lib/db.js, so
// Color Belt's file (and its tests) never change because of Black Belt work (CONTRACT-0016 §9.2).
//
// How it connects: through Cloudflare **Hyperdrive**, binding HYPERDRIVE_BB (its own Hyperdrive
// configuration, user bb_registrar, caching disabled — set up later, at CP5). Its connection
// string holds the registrar's password, so the password lives only in Cloudflare — never in
// this code or git.
// Driver: Postgres.js (`postgres`, exact version pinned in package.json).
//   prepare: false      Hyperdrive shares connections between requests ("transaction pooling"),
//                       where saved ("prepared") statements don't work — so don't make any.
//   max: 1              one connection per request is plenty (one query each).
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice            ignore database notices instead of printing them to the log (a notice
//                       could contain details we must never log).
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
  const sql = postgres(env.HYPERDRIVE_BB.connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });

  return {
    async publicCycle(code) {
      const rows = await sql`select public.bb_public_cycle(${code}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    // The 14 parameters in exactly migration 0016's order (17c):
    // code, client key, submission id, first, last, date of birth, email, Dan, plan id,
    // Kukkiwon, acknowledged, waiver version, signer's name, signature.
    async publicRegister(args) {
      const rows = await sql`
        select public.bb_public_register(
          ${args.code}::text,
          ${args.clientKey}::text,
          ${args.submissionId}::uuid,
          ${args.first}::text,
          ${args.last}::text,
          ${args.dateOfBirth}::date,
          ${args.email}::text,
          ${args.dan}::integer,
          ${args.cyclePlanId}::uuid,
          ${args.kukkiwon}::boolean,
          ${args.acknowledged}::boolean,
          ${args.waiverVersion}::text,
          ${args.signerName}::text,
          ${args.signature}::text
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      // Wait at most 2 seconds for the connection to finish politely, then cut it.
      return sql.end({ timeout: 2 });
    },
  };
}
