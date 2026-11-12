// mockPeople.js — the preview's fake answer to people_search (M16; migration 0049, rulebook v1.144).
// Why it exists: the preview app has a fake database, and the top-bar search needs something to find. This is a
// made-up list of people, searched with the SAME rules as the real database function (2–80 letters, the typed
// text matched anywhere in "first last" ignoring case with % _ and \ taken literally, one school or both,
// withdrawn people left out, at most 25 per kind, kinds in order, and only name / event / school come back,
// with New students as "Ava R."). Like the Calendar's preview samples (mockCalendar.js previewCalendarItems) the
// ids are made up, so opening a result in the preview lands in the section but finds no such person.
const KINDS = ['colorbelt', 'colorbelt_private', 'star', 'black_belt', 'camp', 'prospect'];
const PER_KIND = 25;

// kind, id, eventId, name, event, school (null = a camp for both schools), status
const PEOPLE = [
  ['colorbelt', 'prev-cb-ava-chen', 'cb-event-1', 'Ava Chen', 'November Children Testing', 'worcester', 'active'],
  ['colorbelt', 'prev-cb-ben-diaz', 'cb-event-1', 'Ben Diaz', 'November Children Testing', 'worcester', 'active'],
  ['colorbelt', 'prev-cb-ava-gone', 'cb-event-1', 'Ava Gone', 'November Children Testing', 'worcester', 'withdrawn'],
  ['colorbelt_private', 'prev-cbp-ava-lopez', null, 'Ava Lopez', null, 'shrewsbury', 'active'],
  ['star', 'prev-st-ava-reed', 'star-event-1', 'Ava Reed', 'Fall Star Testing', 'worcester', 'active'],
  ['star', 'prev-st-ava-kim', 'star-event-1', 'Ava Kim', 'Fall Star Testing', 'shrewsbury', 'active'],
  ['star', 'prev-st-leo-nash', 'star-event-1', 'Leo Nash', 'Fall Star Testing', 'worcester', 'active'],
  ['black_belt', 'prev-bb-ava-brooks', 'bb-cycle-1', 'Ava Brooks', 'Spring 2027', 'shrewsbury', 'active'],
  ['black_belt', 'prev-bb-mia-chen', 'bb-cycle-1', 'Mia Chen', 'Spring 2027', 'worcester', 'active'],
  ['camp', 'prev-cp-ava-thompson', 'camp-1', 'Ava Thompson', 'April Vacation Camp', 'worcester', 'active'],
  ['camp', 'prev-cp-ava-park', 'camp-2', 'Ava Park', 'Summer Camp', null, 'active'],
  ['camp', 'prev-cp-zoe-park', 'camp-1', 'Zoe Park', 'April Vacation Camp', 'worcester', 'active'],
  ['prospect', 'prev-pr-ava-r', null, 'Ava R.', 'Free class', 'worcester', 'active'],
  ['prospect', 'prev-pr-liam-p', null, 'Liam P.', 'Free class', 'worcester', 'active'],
];

// The typed text as the database reads it: lower case; the text is matched against the shown name.
function matches(name, text) {
  return name.toLowerCase().includes(text.toLowerCase());
}

// Same answers as the real function: { status: 'ok', results } | { status: 'invalid' }.
// extra is for the browser checks only: rows in the same shape as PEOPLE that point at REAL preview people
// (their ids read from the page), so a tap can be followed all the way into a section's summary.
export function previewPeopleSearch({ p_query: query, p_school: school } = {}, extra = []) {
  if (typeof query !== 'string') return { status: 'invalid' };
  const text = query.trim();
  if (text.length < 2 || text.length > 80) return { status: 'invalid' };
  const where = String(school ?? '').trim().toLowerCase() || 'both';
  if (!['worcester', 'shrewsbury', 'both'].includes(where)) return { status: 'invalid' };
  const results = [];
  for (const kind of KINDS) {
    [...PEOPLE, ...extra].filter(([k, , , name, , s, status]) => {
      // a camp for both schools (school null) shows for either school
      const inSchool = where === 'both' || s === null || s === where;
      return k === kind && status === 'active' && inSchool && matches(name, text);
    })
      .sort((a, b) => (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : a[1] < b[1] ? -1 : 1))
      .slice(0, PER_KIND)
      .forEach(([k, id, eventId, name, event, s]) => results.push({ kind: k, id, event_id: eventId, name, event, school: s }));
  }
  return { status: 'ok', results };
}