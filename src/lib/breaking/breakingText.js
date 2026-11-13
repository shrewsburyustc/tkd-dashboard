// breakingText.js — the front door to every visible word of the Board breaking staff screens.
// Why it exists: the words are kept in four files, one per part of the section, so each part's author keeps
// their own wording in one place (a word in a dialog is easy to find next to the dialog it belongs to):
//   text/events.js   the page frame, the Events tab and the Add / Edit event box
//   text/roster.js   the event page: header, count cards, rows, row menu, Mark paid, registration link
//   text/dialogs.js  Add / Edit student, Move to class, History, Delete, Refund, Edit payment, Square review
//   text/chart.js    the Chart and prices tab (prices, age line, board chart)
// Some short words ("Save", "Cancel", "Delete") appear in more than one file on purpose: each part keeps working
// if another part's wording changes. So they are exported here as four named groups, never merged into one list
// (merging would hide the repeats). Use:  import { rosterText } from '../../lib/breaking/breakingText.js'.
// The screens import their own part's file directly; this file is for checks and for anyone who wants all four.
export * as eventsText from './text/events.js';
export * as rosterText from './text/roster.js';
export * as dialogsText from './text/dialogs.js';
export * as chartText from './text/chart.js';
