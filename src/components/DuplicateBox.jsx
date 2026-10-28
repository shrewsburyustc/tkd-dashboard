// DuplicateBox.jsx — the amber "possible duplicate" box above a roster (design review M1,
// rulebook v1.102; Star v0.114 first).
// Why it exists: when the same person is registered twice, the newer registration gets the
// Possible duplicate tag until someone looks; this box makes sure they notice. Color Belt and Star
// draw it inline today, Camps and Black Belt have their own DuplicateBox — one design, four copies.
// This is the one box:
//   - the count on the FIRST line only ("2 possible duplicates"), then one line per pair, each with
//     its own Review (it opens the shared Compare dialog, CompareDialog.jsx);
//   - on phones the count gets a line of its own and each Review sits under its words (shared.css
//     .dupbox-line), so the buttons line up;
//   - amber with the warning triangle AND words, never color alone (guidelines 7).
// Each section passes its own words (its noun: "is registered twice" / "is signed up twice") and
// its own count line. Nothing switches to it in Dashboard core step 1; each section does later.
//
// Props:
//   countText   the first line's count, the section's words: "1 possible duplicate"
//   pairs       [{ key, text, onReview(opener), reviewLabel?, canReview? }] — text is the line
//               ("Mia Lopez (Group A) is registered twice"); onReview gets the Review button, so
//               focus can go back to it when the compare closes; reviewLabel is an optional
//               screen-reader name; canReview false = no Review on that line (e.g. Black Belt's
//               other copy is at the other school)
// No pairs → nothing is drawn.
import { IconAlertTriangle } from '@tabler/icons-react';
import { REVIEW } from './text.js';

export default function DuplicateBox({ countText, pairs }) {
  if (!pairs || pairs.length === 0) return null;
  return (
    // role="status": screen readers hear it when it appears, without interrupting.
    <div className="ev-dupbox dupbox" role="status">
      {/* ti-alert-triangle = a warning (with words) */}
      <IconAlertTriangle size={16} aria-hidden="true" className="ev-dupbox-icon" />
      <div className="ev-dupbox-lines">
        {pairs.map((pair, index) => (
          <div key={pair.key} className="ev-dupbox-line dupbox-line">
            {index === 0 && <strong className="dupbox-count">{countText}</strong>}
            {/* The dot between the count and the first line; hidden on phones, where the count
                has its own line. Screen readers skip it. */}
            {index === 0 && (
              <span className="dupbox-sep" aria-hidden="true">
                ·
              </span>
            )}
            <span>{pair.text}</span>
            {pair.canReview !== false && (
              <button type="button" className="btn btn-sm" aria-label={pair.reviewLabel} onClick={(event) => pair.onReview(event.currentTarget)}>
                {REVIEW}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
