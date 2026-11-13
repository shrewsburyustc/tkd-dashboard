// functions/api/square/breaking/[school].js — the Cloudflare Pages Function Square calls when a
// Board breaking payment changes (/api/square/breaking/worcester and /api/square/breaking/shrewsbury).
// Why it exists: a family who pays by card goes to Square's own page. Square then tells THIS address
// "payment completed", and the Function records the payment in the database as the separate
// restricted login `brk_square`, which may call exactly one function (brk_square_payment). Each
// school has its own Square account, its own address here and its own signature key.
// Contract 0051 §6; docs/Board Breaking/FUNCTION-API.md.
//
// There is NO Origin check (Square is not a browser). The signature is the gate: a message without
// the right signature is refused before any of it is read. See functions/_lib/breakingWebhook.js
// for every step, and functions/_lib/squareSignature.js for the signature check.
//
// Settings it reads (Cloudflare dashboard, Production only — never in git), per school
// (<SCHOOL> = WORCESTER or SHREWSBURY):
//   HYPERDRIVE_BREAKING_SQUARE          binding to the database connection as brk_square
//   SQUARE_WEBHOOK_SIGNATURE_KEY_<SCHOOL>  that school's Square "signature key" (a secret)
//   SQUARE_WEBHOOK_URL_<SCHOOL>            the exact address registered in that school's Square
// Any of them missing → this Function answers 503 for that school and touches nothing.
import { handleWebhook } from '../../../_lib/breakingWebhook.js';
import { openBreakingSquareDatabase } from '../../../_lib/brkDb.js';

const realDeps = {
  openDatabase: openBreakingSquareDatabase,
  now: () => Date.now(),
};

// One entry point for every method; the handler itself answers 405 for anything but POST.
export async function onRequest(context) {
  return handleWebhook(context, realDeps);
}
