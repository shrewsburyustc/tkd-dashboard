// DuplicateBox.jsx — the amber "1 possible duplicate · Ava Thompson is signed up twice  Review"
// box at the top of the Payments tab (C4b; Color Belt's built box, Star v0.114).
// Why it exists: a family can send the form twice. The newer sign-up gets the Possible duplicate
// tag (and no Mark paid) until someone looks; this box makes sure they notice. One line per pair,
// each with Review (opens the compare dialog).
//
// Also exports findPairs(): the pairs of an active "possible" row and the row it matches.
import { IconAlertTriangle } from '@tabler/icons-react';
import * as T from './text.js';

// Pairs { first, second } (first = the older sign-up), each pair once.
export function findPairs(active) {
  const pairs = [];
  const seen = new Set();
  for (const row of active) {
    if (row.duplicateState !== 'possible' || !row.duplicateOf) continue;
    const other = active.find((o) => o.id === row.duplicateOf);
    if (!other) continue;
    const key = [row.id, other.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const [first, second] = [row, other].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    pairs.push({ first, second });
  }
  return pairs;
}

export default function DuplicateBox({ pairs, onReview }) {
  if (pairs.length === 0) return null;
  return (
    <div className="ev-dupbox" role="status">
      <IconAlertTriangle size={16} aria-hidden="true" className="ev-dupbox-icon" />
      <div className="ev-dupbox-lines">
        {pairs.map((pair, index) => (
          <p key={pair.first.id} className="ev-dupbox-line">
            {index === 0 && <strong className="cp-dup-count">{T.duplicateBoxLine(pairs.length)}</strong>}
            {/* On phones the count gets its own line and this dot is hidden (camps.css). */}
            {index === 0 && <span className="cp-dup-sep"> · </span>}
            {T.signedUpTwice(T.camperLabel(pair.first))}
            <button type="button" className="btn btn-sm ev-dupbox-review" onClick={(event) => onReview(pair, event.currentTarget)}>
              {T.REVIEW}
            </button>
          </p>
        ))}
      </div>
    </div>
  );
}
