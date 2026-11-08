// payingByWhere.js — where a candidate's "Paying by" was chosen: on the family form, or at the desk
// (R1-02, rulebook v1.104 / v0.518, Camps' 0033 pattern; migration 0038).
// Why it exists: the Mark paid box and the candidate's summary used to say "They chose Check on the
// form" whenever the candidate CAME from the form, even after the desk changed Paying by. Now the
// database keeps the form's own choice on the candidate (paying_by_on_form, never changed) and this
// rule compares it with the current Paying by:
//   same as the form's choice            -> 'form'   ("… on the form.")
//   different                            -> 'desk'   ("… at the desk.")  (staff changed it)
//   no form choice at all                -> 'desk'   (a candidate added at the desk, or an old form
//                                                    sign-up the database could not fill in: it never
//                                                    falls back to today's Paying by, which may
//                                                    already be a desk change)
// Camps has the same rule in campRules.js, except that for Camps a missing form choice means 'form'
// (a database from before its 0033). For Star a missing choice means "added at the desk", so it
// reads "at the desk", as a desk-added candidate always did.
//
// A plain function with no browser or database code, so candidatesChecks.mjs can run it in Node.
//   payingByWhere(row) -> 'form' | 'desk'     row = a Candidate ({ payingBy, payingByOnForm })
export function payingByWhere(row) {
  const onForm = row?.payingByOnForm;
  if (!onForm) return 'desk';
  return row.payingBy === onForm ? 'form' : 'desk';
}
