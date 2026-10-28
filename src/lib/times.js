// times.js — the choices of the shared time list (components/TimeList.jsx, design review M8).
// Why it exists: rulebook v1.019 / v1.109 — one time list everywhere: every 5 minutes, AM/PM on
// every time ("4:40 PM" can't be read as 4:40 in the morning), and a range that fits the job:
// 6:00 AM–10:00 PM for classes, testing and camps; Finance's reminder Off, then 11:00 AM–11:00 PM.
// Today each section builds its own list (Star 8 AM–8 PM every 15 minutes, Black Belt 6 AM–10 PM
// every 15, Color Belt and Camps the browser's own list every 5, Finance every 15). This file
// builds the one list, so every section gets the same choices and the same words.
// Plain functions with no React and no browser, so src/lib/shared/checks.mjs can test them with
// plain `node` (193 choices for 6 AM–10 PM, 146 for Finance's Off + 11 AM–11 PM, …).
//
// Times are written the way the database stores them: 'HH:MM' on a 24-hour clock ('16:40').
//
// How TimeList.jsx uses it:
//   timeOptions({ from, to, step, value, offLabel })  → [{ value: '16:40', label: '4:40 PM' }, …]
//   selectValue(value, offLabel)                      → what the dropdown (Select.jsx) is given
//   hourJump(typed, activeIndex, options)            → "typing a number jumps to that hour"

export const DEFAULT_FROM = '06:00'; // classes, testing and camps (v1.019)
export const DEFAULT_TO = '22:00';
export const DEFAULT_STEP = 5; // minutes (v1.019: every 5 minutes everywhere, Finance included)
export const OFF_VALUE = ''; // the value of Finance's "Off" choice inside the list (null outside it)

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/; // 'HH:MM', or the database's 'HH:MM:SS'

// 'HH:MM' (or the database's 'HH:MM:SS') → 'HH:MM'. Anything else → null.
export function normalizeTime(value) {
  const match = TIME.exec(typeof value === 'string' ? value : '');
  return match ? `${match[1]}:${match[2]}` : null;
}

// Minutes since midnight: '16:40' → 1000. null for anything that isn't a time.
function minutesOf(value) {
  const time = normalizeTime(value);
  return time === null ? null : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

// 1000 → '16:40'
function timeFromMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// '16:40' → '4:40 PM' · '06:00' → '6:00 AM' · '12:00' → '12:00 PM' · '00:30' → '12:30 AM'.
// '' for anything that isn't a time.
export function timeLabel(value) {
  const total = minutesOf(value);
  if (total === null) return '';
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

// The hour on a 12-hour clock (1–12) of a time: '18:05' → 6. null for anything else.
export function hour12(value) {
  const total = minutesOf(value);
  return total === null ? null : ((Math.floor(total / 60) + 11) % 12) + 1;
}

// The list's choices, in time order:
//   from, to   the first and last time ('HH:MM'; both on the list when they fit the step)
//   step       minutes between choices (5)
//   value      the saved time: if it isn't on the list (another step, or outside the range) it is
//              still shown, added in its place (rulebook v1.109, as Color Belt does today)
//   offLabel   Finance's "Off": a first choice with the value OFF_VALUE ('')
export function timeOptions({ from = DEFAULT_FROM, to = DEFAULT_TO, step = DEFAULT_STEP, value = null, offLabel = null } = {}) {
  const first = minutesOf(from);
  const last = minutesOf(to);
  const gap = Number.isInteger(step) && step > 0 ? step : DEFAULT_STEP;
  const minutes = [];
  if (first !== null && last !== null) {
    for (let t = first; t <= last; t += gap) minutes.push(t);
  }
  // A saved time that isn't on the list goes in its place (the list is in time order).
  const saved = minutesOf(value);
  if (saved !== null && !minutes.includes(saved)) {
    const at = minutes.findIndex((t) => t > saved);
    minutes.splice(at === -1 ? minutes.length : at, 0, saved);
  }
  const times = minutes.map((t) => {
    const time = timeFromMinutes(t);
    return { value: time, label: timeLabel(time) };
  });
  return offLabel ? [{ value: OFF_VALUE, label: offLabel }, ...times] : times;
}

// What the dropdown is given for a saved value: the 'HH:MM' time; Finance's Off choice ('') when
// nothing is saved and the list has Off; otherwise null (nothing chosen → the gray placeholder).
export function selectValue(value, offLabel = null) {
  const time = normalizeTime(value);
  if (time !== null) return time;
  return offLabel ? OFF_VALUE : null;
}

// "Typing a number jumps to that hour" (rulebook v1.109, detail b). The dropdown keeps what was
// typed for half a second (so "1" then "0" is "10"); this finds the choice to move to:
//   - a number 1–12 → that hour: its first row (its ":00" when on the list). The first press goes
//     to the earlier one ("6" → 6:00 AM); pressed again while on that hour, the other one
//     ("6" again → 6:00 PM), and round again. "Again" is judged from the row the list was on when
//     the number STARTED (startIndex): typing "10" moves the list to 1:00 PM on its "1" first, so
//     the row it is on now can't tell whether 10 was already reached ("10" again → 10:00 PM).
//   - the same digit typed quickly ("66") is that digit pressed again: judged from the row the
//     list is on now (activeIndex), which the first "6" already moved.
//   - letters → the first choice whose words start with them ("o" → Finance's Off).
// activeIndex = the row the list is on now; startIndex = the row it was on when the typing started
// (the same row for a single key). Returns the index to move to, or null (nothing matches: the
// list stays where it is).
export function hourJump(typed, activeIndex, options, startIndex = activeIndex) {
  const text = String(typed ?? '').toLowerCase();
  if (text === '' || !Array.isArray(options)) return null;
  if (!/^\d+$/.test(text)) {
    const index = options.findIndex((option) => String(option.label).toLowerCase().startsWith(text));
    return index === -1 ? null : index;
  }
  let hour = Number(text);
  let judgeFrom = startIndex; // a number: "again" counts from where the typing started
  if (!(hour >= 1 && hour <= 12)) {
    const sameDigit = text.length > 1 && text.split('').every((digit) => digit === text[0]);
    hour = sameDigit ? Number(text[0]) : NaN;
    if (!(hour >= 1 && hour <= 12)) return null;
    judgeFrom = activeIndex; // "66": the first "6" already moved the list, so count from there
  }
  // The first row of each 24-hour hour that reads as this hour (AM and PM), in list order.
  const starts = [];
  const seen = new Set();
  options.forEach((option, index) => {
    if (hour12(option.value) !== hour) return;
    const hour24 = Math.floor(minutesOf(option.value) / 60);
    if (seen.has(hour24)) return;
    seen.add(hour24);
    starts.push({ index, hour24 });
  });
  if (starts.length === 0) return null;
  const from = options[judgeFrom];
  const fromHour = from && minutesOf(from.value) !== null ? Math.floor(minutesOf(from.value) / 60) : null;
  const onIt = starts.findIndex((start) => start.hour24 === fromHour);
  return onIt === -1 ? starts[0].index : starts[(onIt + 1) % starts.length].index;
}
