// colors.js — the 8 class colors on the Schedule (rulebook v0.137).
// Why it exists: an admin picks each class's color; the week grid, the phone day view and the
// swatches in the dialog all draw from this one list. Red is NEVER offered — red means delete
// (guidelines 7). These soft colors are labels, not status colors (recorded exception, v0.137).
// Every box also shows the class NAME, so color is never the only cue (accessibility).
//
// Each color: a pale fill, a darker edge, and dark text that reads well on the fill (4.5:1+).
export const CLASS_COLORS = [
  { key: 'gray', label: 'Gray', fill: '#F7F7F5', edge: '#CFCFCA', text: '#1F1F1F' },
  { key: 'yellow', label: 'Yellow', fill: '#FBF3CF', edge: '#D9BC4A', text: '#4F4105' },
  { key: 'orange', label: 'Orange', fill: '#FBE9D4', edge: '#E0A866', text: '#5A3410' },
  { key: 'green', label: 'Green', fill: '#E7F2D8', edge: '#9CC26A', text: '#2F4A0C' },
  { key: 'teal', label: 'Teal', fill: '#DFF3EC', edge: '#7FC6AE', text: '#074536' },
  { key: 'sky', label: 'Sky', fill: '#E2EFFA', edge: '#8DB9E2', text: '#0C3F72' },
  { key: 'purple', label: 'Purple', fill: '#EEEDFE', edge: '#ABA5EA', text: '#3C3489' },
  { key: 'pink', label: 'Pink', fill: '#FBE8EF', edge: '#E39CB6', text: '#6E2140' },
];

export const COLOR_KEYS = CLASS_COLORS.map((c) => c.key);
export const DEFAULT_COLOR = 'gray'; // a class nobody has colored yet

const BY_KEY = new Map(CLASS_COLORS.map((c) => [c.key, c]));

// The color record for a key (unknown or missing → gray).
export function colorOf(key) {
  return BY_KEY.get(key) ?? BY_KEY.get(DEFAULT_COLOR);
}
