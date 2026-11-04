// CamperHistory.jsx — the History line at the end of Camper detail's summary (design review C7,
// rulebook v0.736; a copy of Star's CandidateHistory.jsx pattern, v0.518).
// Why it exists: who changed a camper's days, the family's phone or the way they pay could only be
// found in the database. Now Camper detail ends with the shared one-line history
// (components/HistoryLine.jsx): "History · 5 changes ›"; a tap opens the list in place, newest
// first — what changed, then "Oct 13 · Jeffrey Berg" (or "Family form").
//   - The reader (camp_camper_history, migration 0033) THROWS when the answer isn't ok, so a failed
//     read shows the shared amber bar with Retry, never "no changes yet". no_access also takes the
//     house path (the lock screen), as Star's does.
//   - One save = one entry, its parts joined with "; "; the words and the merging live in
//     camperHistoryWords.js (plain JavaScript, checked by src/lib/camps/checks.mjs).
//   - A change to the family part (parent, emergency contact, signature) shows in every child's
//     history from that form, ending "(whole family)" when the form has more than one child
//     (v0.736 option A). familySize = how many campers the roster has on this camper's sign-up.
//   - Hide private details on (`hidden`): money changes are left out of the count and the list,
//     with "Payment history is hidden on this tablet." (the shared line does that part).
// Login ids never reach the screen: the database leaves them out before the app gets the rows.
//
// Props: camper (Camper detail's camper: id, days [{ dayId }], extras [{ extraId, dayId }]),
//        campDays (Day[]), campExtras (the camp's extras), familySize, hidden, onNoAccess
import HistoryLine from '../../components/HistoryLine.jsx';
import { loadCamperHistory } from '../../lib/camps/campsApi.js';
import { describeCamperBatch, groupCamperHistory } from './camperHistoryWords.js';

// The reader: the camper's saves (grouped, with their days and extras before / after), or a thrown
// error (HistoryLine then shows its amber bar with Retry).
export function camperHistoryReader(camper, onNoAccess) {
  return async () => {
    const answer = await loadCamperHistory(camper.id);
    if (answer.status === 'ok') {
      return groupCamperHistory(answer.rows, {
        dayIds: (camper.days ?? []).map((d) => d.dayId),
        extras: (camper.extras ?? []).map((e) => ({ extraId: e.extraId, dayId: e.dayId ?? null })),
      });
    }
    if (answer.status === 'no_access') onNoAccess?.();
    throw new Error(`camp_camper_history: ${answer.status}`);
  };
}

export default function CamperHistory({ camper, campDays, campExtras, familySize = 1, hidden = false, onNoAccess }) {
  return (
    <HistoryLine
      load={camperHistoryReader(camper, onNoAccess)}
      describe={(batch, { hidden: hiddenNow }) => describeCamperBatch(batch, { hidden: hiddenNow, campDays, campExtras, familySize })}
      hidden={hidden}
    />
  );
}
