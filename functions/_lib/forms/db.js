// forms/db.js — the Forms public Function's ONLY way into the database.
// Why it exists: the Function may call exactly two database functions (migration 0009 §9), as
// the restricted login `forms_registrar`:
//     public.forms_public_get(slug)        — what the public form needs to show
//     public.forms_public_submit(...)      — save one sign-up (and its free-class bookings)
// The third one the login may run, forms_public_email_result, is NOT called: emails are off
// for now (rulebook v0.601). Keeping every call in this one small file makes it easy to check
// that nothing else is ever sent to the database.
//
// Modelled on functions/_lib/db.js (Color Belt; copied, not shared — build plan §8).
//
// How it connects: through Cloudflare **Hyperdrive**, the binding named HYPERDRIVE_FORMS — its
// OWN configuration, signed in as forms_registrar (never Color Belt's testing_registrar). Its
// connection string holds the registrar's password, so the password lives only in Cloudflare —
// never in this code or git. Driver: Postgres.js (`postgres`, exact version pinned in
// package.json).
//   prepare: false      Hyperdrive shares connections between requests ("transaction
//                       pooling"), where saved ("prepared") statements don't work.
//   max: 1              one connection per request is plenty (one query each).
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice            ignore database notices instead of printing them to the log.
// Every value goes in as a separate typed parameter (`${value}::type` below). Postgres.js sends
// them apart from the SQL text, so nothing a family types can ever change the SQL itself.
// The jsonb values (answers, children, bookings) are sent as JSON text and turned into jsonb
// by the database (`::jsonb`).
import postgres from 'postgres';

// jsonb answers normally arrive already turned into objects; this also copes with text.
function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

// Opens one client for one request. The caller MUST call close() (the Function does it with
// context.waitUntil, so closing doesn't slow the answer down).
export function openDatabase(env) {
  const sql = postgres(env.HYPERDRIVE_FORMS.connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });

  return {
    async publicGet(slug) {
      const rows = await sql`select public.forms_public_get(${slug}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    // args: { slug, clientKey, submissionKey, publishedVersion, answers, children, bookings,
    //         signature (text or null), kioskToken (text or null) }
    async publicSubmit(args) {
      const rows = await sql`
        select public.forms_public_submit(
          ${args.slug}::text,
          ${args.clientKey}::text,
          ${args.submissionKey}::uuid,
          ${args.publishedVersion}::integer,
          ${JSON.stringify(args.answers)}::jsonb,
          ${JSON.stringify(args.children)}::jsonb,
          ${JSON.stringify(args.bookings)}::jsonb,
          ${args.signature}::text,
          ${args.kioskToken}::text
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      // Wait at most 2 seconds for the connection to finish politely, then cut it.
      return sql.end({ timeout: 2 });
    },
  };
}
