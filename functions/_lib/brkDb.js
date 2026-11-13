// brkDb.js — the Board breaking Functions' ONLY way into the database.
// Why it exists: the family sign-up Function may call exactly four database functions, as the
// restricted login `brk_registrar` (contract 0051 §5, SIGNATURES-0051 "Public"):
//     public.brk_public_event(code)                     — what the family form shows
//     public.brk_public_signup(...)                     — save one student's sign-up
//     public.brk_public_registration(code, submission)  — "Try again" and the return page
//     public.brk_public_set_link(...)                   — store the Square link the Function made
// and the Square webhook may call exactly one, as the separate login `brk_square`:
//     public.brk_square_payment(...)                    — record (or refuse) a Square payment
// Keeping every call in this one small file makes it easy to check that nothing else is ever sent
// to the database. It is a copy of campDb.js with Board breaking's functions.
//
// How it connects: through Cloudflare **Hyperdrive**. The public form uses the binding
// HYPERDRIVE_BREAKING (its connection string holds the brk_registrar password) and the webhook uses
// HYPERDRIVE_BREAKING_SQUARE (the brk_square password), so each can be switched off on its own. The
// passwords live only in Cloudflare — never in this code or git.
// Driver: Postgres.js (`postgres`, exact version pinned in package.json), same settings as campDb.js:
//   prepare: false      Hyperdrive shares connections ("transaction pooling"), where saved
//                       ("prepared") statements don't work — so don't make any.
//   max: 1              one connection per request is plenty.
//   fetch_types: false  skip an extra start-up query that looks up custom types (we have none).
//   onnotice            ignore database notices instead of printing them to the log.
// Every value goes in as a separate typed parameter (`${value}::type` below). Postgres.js sends
// them apart from the SQL text, so nothing a family types can ever change the SQL itself. None of
// these functions takes a jsonb argument, so the "jsonb sent as text" trap noted in campDb.js
// does not come up here.
import postgres from 'postgres';

// jsonb answers normally arrive already turned into objects; this also copes with text.
function asObject(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

// Opens one Postgres.js client on the given connection string.
function connect(connectionString) {
  return postgres(connectionString, {
    prepare: false,
    max: 1,
    fetch_types: false,
    connect_timeout: 5, // seconds — give up quickly; the page shows "try again"
    onnotice: () => {},
  });
}

// Closes the client (waits at most 2 seconds for the connection to finish politely, then cuts it).
const closeClient = (sql) => sql.end({ timeout: 2 });

// The family form's connection (login brk_registrar). The caller MUST call close() (the Function
// does it with context.waitUntil, so closing doesn't slow the answer down).
export function openBreakingDatabase(env) {
  const sql = connect(env.HYPERDRIVE_BREAKING.connectionString);

  return {
    // Statement 1 of 4.
    async publicEvent(code) {
      const rows = await sql`select public.brk_public_event(${code}::text) as answer`;
      return asObject(rows[0]?.answer);
    },

    // Statement 2 of 4. `args` is made by breaking.js (readFields) — only checked values.
    async publicSignup(args) {
      const rows = await sql`
        select public.brk_public_signup(
          ${args.code}::text,
          ${args.clientKey}::text,
          ${args.submissionId}::uuid,
          ${args.firstName}::text,
          ${args.lastName}::text,
          ${args.age}::integer,
          ${args.rankName}::text,
          ${args.classId}::uuid,
          ${args.tech}::integer,
          ${args.adult}::integer,
          ${args.payingBy}::text,
          ${args.expectedTotalCents}::integer
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    // Statement 3 of 4.
    async publicRegistration(code, submissionId) {
      const rows = await sql`
        select public.brk_public_registration(${code}::text, ${submissionId}::uuid) as answer`;
      return asObject(rows[0]?.answer);
    },

    // Statement 4 of 4. The Function passes the registration id the database itself gave it, the
    // order id and link address Square answered with, and the balance it asked Square to charge.
    async publicSetLink(args) {
      const rows = await sql`
        select public.brk_public_set_link(
          ${args.registrationId}::uuid,
          ${args.submissionId}::uuid,
          ${args.orderId}::text,
          ${args.linkUrl}::text,
          ${args.amountCents}::integer
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      return closeClient(sql);
    },
  };
}

// The Square webhook's connection (login brk_square): ONE statement.
export function openBreakingSquareDatabase(env) {
  const sql = connect(env.HYPERDRIVE_BREAKING_SQUARE.connectionString);

  return {
    // `args` is made by breakingWebhook.js (mapPayment) — only checked values; `school` comes from
    // the address Square called (worcester / shrewsbury), never from the message.
    async squarePayment(args) {
      const rows = await sql`
        select public.brk_square_payment(
          ${args.school}::text,
          ${args.eventId}::text,
          ${args.paymentId}::text,
          ${args.orderId}::text,
          ${args.amountCents}::integer,
          ${args.currency}::text,
          ${args.status}::text
        ) as answer`;
      return asObject(rows[0]?.answer);
    },

    close() {
      return closeClient(sql);
    },
  };
}
