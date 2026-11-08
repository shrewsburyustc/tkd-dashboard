// deskSchool.js — which school's DESK takes a Star payment or refund (R1-01, rulebook v1.035, v1.040).
// Why it exists: Finance counts each payment at the school of the desk that took it, not the
// candidate's own school. The desk is the school set under "This device" in the account menu
// (src/lib/device.js: 'Worcester' or 'Shrewsbury'; it is never "Both"). Record payment and Record
// refund send it to the database as `p_school`, which stores it on the payment (migration 0038).
//
// A plain function with no browser or database code, so candidatesChecks.mjs can run it in Node.
//
//   deskSchoolFor(deviceLocation) → 'worcester' | 'shrewsbury' | null
//     Accepts the device's name ('Worcester') or a code ('worcester'). Anything else (unset, "Both",
//     nonsense) → null: nothing is sent for the school, and the database then uses the candidate's
//     own school (the same answer the app gave before 0038).
const SCHOOL_CODES = ['worcester', 'shrewsbury'];

export function deskSchoolFor(deviceLocation) {
  const code = typeof deviceLocation === 'string' ? deviceLocation.trim().toLowerCase() : null;
  return SCHOOL_CODES.includes(code) ? code : null;
}
