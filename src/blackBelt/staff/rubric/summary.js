// summary.js — short number lists about one Dan, for Copy from another Dan (mockup R9):
// "to pass 275 / 293 · most 339 / 361.5".
// Why it exists: the copy dialog shows each Dan's pass mark(s) and most points in one line; the
// brackets' names would make it too long, so several brackets are joined with " / " in their
// order (youngest first).
import { mostPoints } from '../../../lib/blackBelt/rubric.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));

export const passMarksList = (dan) => (dan?.pass?.brackets ?? []).map((b) => num(b.pass_mark)).join(' / ');
export const mostPointsList = (dan) => (dan?.pass?.brackets ?? []).map((b) => num(mostPoints(dan, b))).join(' / ');
