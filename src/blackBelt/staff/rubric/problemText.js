// problemText.js — turns a rubric problem (a code from the shared checker, rubric.js
// danProblems, or the database's identical answer) into the words the editor shows.
// Why it exists: CONTRACT-0024 §3.3 and mockup R8. The checker only says WHAT is wrong and WHERE
// ({ code, part, subject, way, bracket, item, step }); this file names the place the way the
// admin sees it ("Physical · Push-up (1 min)", "To pass · 17 and under") and, where it helps,
// the exact numbers ("B (26) is higher than B+ (25)").
//
//   describe(problem, dan) → { list, field }
//     list   the line in the amber "Can't save 1st Dan yet" box ("Physical · Free sparring:
//            credits must be a whole number from 1 to 20.")
//     field  the shorter words under the field itself ("Credits must be a whole number from 1 to 20.")
// Every sentence below is new wording except those copied from mockup R8 (marked "R8").
import { bracketLabel, CUTOFF_LETTERS, mostPoints, partLetters, subjectLetters } from '../../../lib/blackBelt/rubric.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));
const hasIndex = (v) => v !== undefined && v !== null;

// The first two neighbouring letters that break the order (strict: equal breaks it too, as for
// cut-offs; points and grade points may stay equal) ("B (26) is higher than B+ (25)").
function orderBreak(map, letters, goingDown, strict = false) {
  for (let i = 1; i < letters.length; i += 1) {
    const above = map?.[letters[i - 1]];
    const here = map?.[letters[i]];
    if (typeof above !== 'number' || typeof here !== 'number') continue;
    const wrong = goingDown ? here > above : here < above;
    const strictWrong = goingDown ? here >= above : here <= above;
    if (strict ? strictWrong : wrong) return { here: letters[i], hereValue: here, above: letters[i - 1], aboveValue: above, equal: here === above };
  }
  return null;
}

// The ages no bracket covers between two neighbours ("age 12" / "ages 12–13").
function gapAges(prev, cur) {
  const a = (prev?.to ?? -1) + 1;
  const b = (cur?.from ?? 0) - 1;
  return a === b ? `age ${a}` : `ages ${a}–${b}`;
}

// Words for a problem with the brackets of one list (the pass list, or a way's).
function bracketWords(code, list, index) {
  const cur = list?.[index];
  const prev = hasIndex(index) && index > 0 ? list?.[index - 1] : null;
  switch (code) {
    case 'brackets_count':
      return 'use 1 to 6 age brackets.';
    case 'bracket_ages':
      return `${cur ? `${bracketLabel(cur)}: ` : ''}ages must be whole numbers from 0 to 99, and “from” can’t be above “to”.`;
    case 'brackets_order':
      return 'age brackets must go from the youngest to the oldest.';
    case 'brackets_gap':
      return `age brackets leave a gap: no bracket covers ${gapAges(prev, cur)}.`; // R8
    case 'brackets_overlap':
      return `age brackets overlap: ${prev ? bracketLabel(prev) : ''} and ${cur ? bracketLabel(cur) : ''} both cover age ${num(cur?.from)}.`;
    case 'brackets_ends':
      return 'the first age bracket must start at the youngest (leave “from” empty) and the last must have no end (leave “to” empty).';
    default:
      return null;
  }
}

export function describe(problem, dan) {
  const p = problem ?? {};
  const code = p.code;
  const part = p.part ? (dan?.parts ?? []).find((x) => x?.code === p.part) : null;
  const partName = part?.name || p.part || '';
  const subject = p.subject && part ? (part.subjects ?? []).find((s) => s?.id === p.subject) : null;
  const subjectName = subject?.name || '';
  const way = subject && hasIndex(p.way) ? subject.ways?.[p.way] : null;
  const twoWays = (subject?.ways?.length ?? 0) > 1;
  const passList = dan?.pass?.brackets ?? [];
  const item = hasIndex(p.item) ? dan?.extra_points?.items?.[p.item] : null;
  const itemName = item?.name || '';

  let prefix = '';
  let text;

  // ----- a box that doesn't hold a number yet -----
  if (code === 'not_a_number') {
    if (p.subject) prefix = `${partName} · ${subjectName}`;
    else if (p.part) prefix = partName;
    else if (hasIndex(p.item)) prefix = `Extra points · ${itemName}`;
    else if (p.field === 'limit') prefix = 'Extra points';
    else if (hasIndex(p.bracket)) prefix = `To pass · ${passList[p.bracket] ? bracketLabel(passList[p.bracket]) : ''}`;
    text = p.field === 'credits' ? 'credits must be a whole number from 1 to 20.' : 'enter a number.';
    return { list: prefix ? `${prefix}: ${text}` : cap(text), field: cap(text) };
  }

  // ----- the pass rule -----
  if (!p.part && !p.subject && !code?.startsWith('extra_')) {
    const b = hasIndex(p.bracket) ? passList[p.bracket] : null;
    const label = b ? bracketLabel(b) : '';
    prefix = 'To pass';
    switch (code) {
      case 'pass_mark_range':
        text = `${label ? `${label}: ` : ''}enter a pass mark from 1 to 9999 (up to 2 decimals).`;
        break;
      case 'pass_mark_too_high': {
        const most = b ? mostPoints(dan, b) : '';
        text = `${label}: ${num(b?.pass_mark)} points is more than this bracket can score (${num(most)}).`; // R8
        break;
      }
      case 'bracket_empty':
        text = `${label}: no subject counts for this bracket.`;
        break;
      case 'makeup':
        text = 'the make-up sentence must be 1 to 300 characters on one line.';
        break;
      default:
        text = bracketWords(code, passList, p.bracket);
    }
    if (text) return { list: `${prefix}: ${text}`, field: cap(text) };
  }

  // ----- a subject -----
  if (p.subject) {
    prefix = `${partName} · ${subjectName}${twoWays && way?.name ? ` (${way.name})` : ''}`;
    const wb = way && hasIndex(p.bracket) ? way.brackets?.[p.bracket] : null;
    switch (code) {
      case 'subject_id':
        text = 'this subject can’t be read. Remove it and add it again.';
        break;
      case 'subject_name':
        prefix = partName;
        text = 'a subject name must be 1 to 60 characters.';
        break;
      case 'subject_name_duplicate':
        prefix = partName;
        return {
          list: `${partName}: two subjects are named “${subjectName}”.`, // R8
          field: `Two subjects are named “${subjectName}”. Give each a different name.`, // R8
        };
      case 'credits':
        text = 'credits must be a whole number from 1 to 20.'; // R8
        break;
      case 'points_range':
        text = 'points must be numbers from 0 to 999 (up to 2 decimals), and A+ above 0.';
        break;
      case 'points_order': {
        const br = orderBreak(subject?.points, subjectLetters(p.part, subject?.scoring), true);
        text = br ? `points must go down from A+ to D: ${br.here} (${num(br.hereValue)}) is higher than ${br.above} (${num(br.aboveValue)}).` : 'points must go down from A+ to D.';
        break;
      }
      case 'points_not_worked_out':
        text = 'the worked-out points don’t match credits × grade points. Open the subject and press Done.';
        break;
      case 'ways_count':
        text = 'a measured subject needs one or two ways.';
        break;
      case 'way_name':
        text = 'with two ways, give each way its own name.';
        break;
      case 'unit':
        text = 'enter a unit (1 to 40 characters on one line).';
        break;
      case 'direction':
        text = 'choose what a grade needs (at least, at most or under the number).';
        break;
      case 'cutoffs_range':
        text = `cut-offs${wb ? ` for ${bracketLabel(wb)}` : ''} must be numbers from 0 to 999 (up to 2 decimals).`;
        break;
      case 'cutoffs_order': {
        const down = way?.direction === 'at_least';
        const br = orderBreak(wb?.cutoffs, CUTOFF_LETTERS, down, true);
        const how = down ? 'go down' : 'go up';
        const cmp = br?.equal ? 'is the same as' : down ? 'is higher than' : 'is lower than';
        text = `cut-offs${wb ? ` for ${bracketLabel(wb)}` : ''} must ${how} from A+ to C${br ? `: ${br.here} (${num(br.hereValue)}) ${cmp} ${br.above} (${num(br.aboveValue)})` : ''}.`; // R8
        break;
      }
      case 'limited_to':
        return {
          list: `${subjectName} is limited to a bracket that no longer exists.`, // R6
          field: `${subjectName} is limited to a bracket that no longer exists.`,
        };
      case 'note':
        text = 'the note must be 1 to 200 characters on one line.';
        break;
      default:
        text = way ? bracketWords(code, way.brackets, p.bracket) : null;
    }
    if (!text) text = 'something in this subject can’t be saved.';
    return { list: prefix ? `${prefix}: ${text}` : cap(text), field: cap(text) };
  }

  // ----- a part -----
  if (p.part) {
    prefix = partName;
    switch (code) {
      case 'part_name':
        text = 'a part name must be 1 to 60 characters.';
        break;
      case 'part_name_duplicate':
        text = `two parts are named “${partName}”.`;
        break;
      case 'grade_points_range':
        text = 'grade points must be numbers from 0 to 999 (up to 2 decimals), and A+ above 0.';
        break;
      case 'grade_points_order': {
        const br = orderBreak(part?.grade_points, partLetters(p.part), true);
        text = br ? `grade points must go down from A+ to D: ${br.here} (${num(br.hereValue)}) is higher than ${br.above} (${num(br.aboveValue)}).` : 'grade points must go down from A+ to D.'; // R8
        break;
      }
      case 'subject_count':
        text = 'a part needs 1 to 30 subjects.';
        break;
      default:
        text = 'something in this part can’t be saved.';
    }
    return { list: `${prefix}: ${text}`, field: cap(text) };
  }

  // ----- extra points -----
  if (code?.startsWith('extra_')) {
    prefix = item ? `Extra points · ${itemName}` : 'Extra points';
    const steps = item?.rule?.steps ?? [];
    switch (code) {
      case 'extra_limit':
        text = 'the limit must be from 1 to 999 points, or empty for no limit.';
        break;
      case 'extra_note':
        text = 'the note must be 1 to 200 characters on one line.';
        break;
      case 'extra_item_count':
        text = 'there can be at most 12 items.';
        break;
      case 'extra_item_name':
        prefix = 'Extra points';
        text = 'an item name must be 1 to 60 characters.';
        break;
      case 'extra_item_name_duplicate':
        prefix = 'Extra points';
        text = `two items are named “${itemName}”.`;
        break;
      case 'extra_rule':
        text = 'choose Per count or Steps.';
        break;
      case 'extra_points_each':
        text = 'points each must be from 0.01 to 999.';
        break;
      case 'extra_steps_count':
        text = 'use 1 to 10 steps.';
        break;
      case 'extra_step_range':
        text = 'each step needs “at least” as a whole number from 1 to 9999 and points from 0.01 to 999.';
        break;
      case 'extra_steps_order': {
        // The checker may not say which step: find the first one that doesn't go up.
        let k = hasIndex(p.step) ? p.step : steps.findIndex((s, i) => i > 0 && (!(s.at_least > steps[i - 1].at_least) || !(s.points > steps[i - 1].points)));
        if (k < 1) k = 1;
        const cur = steps[k];
        const prev = steps[k - 1];
        if (cur && prev && !(cur.at_least > prev.at_least)) text = `steps must go up: “${num(cur.at_least)}+” comes after “${num(prev.at_least)}+”.`; // R8
        else if (cur && prev) text = `each step must give more points than the one before: ${num(cur.points)} comes after ${num(prev.points)}.`;
        else text = 'steps must go up.';
        break;
      }
      default:
        text = 'something here can’t be saved.';
    }
    return { list: `${prefix}: ${text}`, field: cap(text) };
  }

  // ----- the whole Dan (too big, or not readable) -----
  text = code === 'too_big' ? 'This Dan is too big to save. Remove some subjects, notes or steps.' : 'This Dan can’t be saved as it is. Cancel and edit it again.';
  return { list: text, field: text };
}
