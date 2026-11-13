// starterClasses.js — the class times Add event starts with when the school has no earlier Board breaking event.
// Where it comes from: the Settings tab of Jeffrey's old Google Sheet (the monthly board-breaking night, 2026): five
// class times, 40 minutes each, in this order. Changing the starter list later is a code change (edit this file);
// an admin can always edit, reorder and remove the rows in the Add event box before saving, and from the second event
// on the box copies the school's latest event instead (EventsTab.jsx), so this list is only ever the FIRST event's start.
// Times are 24-hour 'HH:MM' on a 5-minute step, as the class time lists and the database want them.
export const STARTER_CLASSES = [
  { name: 'Group D', startTime: '16:20', endTime: '17:00' }, // 4:20 PM – 5:00 PM
  { name: 'White / Little Tiger', startTime: '17:10', endTime: '17:50' }, // 5:10 PM – 5:50 PM
  { name: 'Group A', startTime: '18:00', endTime: '18:40' }, // 6:00 PM – 6:40 PM
  { name: 'Group B+C', startTime: '18:50', endTime: '19:30' }, // 6:50 PM – 7:30 PM
  { name: 'Teen / Adult', startTime: '19:40', endTime: '20:20' }, // 7:40 PM – 8:20 PM
];

// What the Add event box shows: the classes of the school's latest earlier event (from the roster read: [{ name, startTime,
// endTime }] in its order), or the starter list when there is none. Pure, so the checks can test the rule.
export function startingClasses(latestEventClasses) {
  const list = Array.isArray(latestEventClasses) && latestEventClasses.length > 0 ? latestEventClasses : STARTER_CLASSES;
  return list.map(({ name, startTime, endTime }) => ({ name, startTime, endTime }));
}
