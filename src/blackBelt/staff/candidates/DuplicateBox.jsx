// DuplicateBox.jsx — the amber "possible duplicate" box above the summary cards.
// Why it exists: Star v0.114, approved on mockup Candidates 1: when the same name and date of birth
// are registered twice in a cycle, the desk sees "1 possible duplicate · Noah Silva (2nd Dan) is
// registered twice" with Review, which opens the side-by-side compare (CompareDialog.jsx). Several
// pairs get one line each (OP-B11). Amber with the warning triangle AND words (never color alone).
// It counts the rows that are shown, so it follows the location switcher.
//
// Props:
//   pairs     [{ row, partner }] from rules.duplicatePairs (partner null = the other copy is at the
//             other school, so it isn't on the list right now)
//   onReview  (row, partner, opener) => void
//   busy      a write or a load is on its way (Review waits)
import { ICONS } from './icons.js';
import * as T from '../text.js';

export default function DuplicateBox({ pairs, onReview, busy }) {
  if (pairs.length === 0) return null;
  const Warn = ICONS.warn;
  return (
    <div className="ev-dupbox bb-dupbox" role="status">
      <Warn size={16} aria-hidden="true" className="ev-dupbox-icon" />
      <div className="ev-dupbox-lines">
        {pairs.map(({ row, partner }, index) => {
          const name = T.candidateName(row);
          return (
            <p key={row.id} className="ev-dupbox-line">
              <span>
                {index === 0 && <strong>{T.possibleDuplicates(pairs.length)}</strong>}
                {index === 0 && ' · '}
                {T.registeredTwice(name, row.dan)}
              </span>
              {partner && (
                <button
                  type="button"
                  className="btn btn-sm ev-dupbox-review"
                  aria-label={T.reviewDuplicateLabel(name)}
                  aria-disabled={busy ? 'true' : undefined}
                  onClick={(event) => !busy && onReview(row, partner, event.currentTarget)}
                >
                  {T.REVIEW}
                </button>
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
