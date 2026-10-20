// ics.js — the "Add to calendar" file on the thank-you screen (build plan §3).
// Why it exists: families tap "Add to calendar" and their phone or computer adds the free class
// to its own calendar app. The file is made right here in the browser (nothing is sent anywhere):
// an .ics file is plain text in the "iCalendar" format that every calendar app understands.
//
//   icsText({ events: [{ title, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', location }], now })
//   downloadIcs(text, 'free-class.ics')   → the browser saves / opens the file
//
// The class times are Massachusetts times. The file stores them in UTC (the "Z" at the end), so
// every calendar app shows the right time wherever the phone is, including on the days the
// clocks change. Plain functions with no browser parts except downloadIcs, so checks.mjs can test
// them in Node.

const SCHOOL_ZONE = 'America/New_York';

// How far Massachusetts is from UTC at that moment, in minutes (e.g. -240 in summer, -300 in winter).
function zoneOffsetMinutes(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SCHOOL_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - utcMs) / 60000);
}

// A school-time date + 'HH:MM' → the real moment (milliseconds since 1970).
export function schoolTimeToUtc(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  // Two rounds: the first offset may be from the wrong side of a clock change.
  let utc = guess - zoneOffsetMinutes(guess) * 60000;
  utc = guess - zoneOffsetMinutes(utc) * 60000;
  return utc;
}

// 20270113T210000Z
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// iCalendar text values: backslash, semicolon, comma and line breaks must be escaped.
const esc = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

// Lines longer than 75 bytes are "folded" (continued on the next line after a space), as the
// format requires. Counted in characters here — the texts are short and nearly all plain letters.
const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

const randomId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function icsText({ events, now = Date.now() }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//US Taekwondo Center//Forms//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${randomId()}@tkd-dashboard.pages.dev`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(schoolTimeToUtc(e.date, e.start))}`,
      `DTEND:${stamp(schoolTimeToUtc(e.date, e.end))}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`; // the format uses CRLF line ends
}

// Saves the file. A "blob" is a file made in memory; the temporary link to it is removed after.
export function downloadIcs(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
