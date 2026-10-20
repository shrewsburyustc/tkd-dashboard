// financeState.js — what the Finance section remembers while the dashboard is open.
// Why it exists: an admin who opens an earlier day, goes to Home and comes back should land on
// the same day (like Testing remembers its tab). This small shared object keeps it. It lives in
// memory only: a reload starts again on today.
//   day        the day the Daily report shows ('YYYY-MM-DD'), or null = today
//   month      the month History shows ('YYYY-MM-01'), or null = this month
// Home's reminder links reset it (they always mean "today" / "this month").
export const financeState = {
  day: null,
  month: null,
  openClose: false,
};

// Home → "Close the day": show today. Home → "Open History": show the month of the first unclosed day.
//   openClose  true = open the Close the day dialog as soon as today's report has loaded (v0.800:
//              Home's "Close the day" link opens the report AND the dialog)
export function showToday({ openClose = false } = {}) {
  financeState.day = null;
  financeState.openClose = openClose;
}

export function showMonthOf(day) {
  financeState.month = day ? `${String(day).slice(0, 7)}-01` : null;
}
