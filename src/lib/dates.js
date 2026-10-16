// dates.js — the greeting and date text in the Home welcome header.
// Why it exists: keeps the small text rules (time of day → greeting, date format,
// "Both" → "Worcester and Shrewsbury") in one place so they're easy to find and change.

// Before 12:00 → morning, before 17:00 (5 pm) → afternoon, otherwise evening.
export function getGreeting(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// e.g. "Thursday, October 15"
export function formatLongDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// The location as it reads in the header sub line.
export function describeLocation(location) {
  return location === 'Both' ? 'Worcester and Shrewsbury' : location;
}
