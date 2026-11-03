// DeleteCampDialog.jsx — "Delete April Vacation Camp?" (admins, from a camp's ⋯ menu).
// Why it exists: deleting a camp is PERMANENT (its campers, check-ins and payments go with it),
// so rule 1.4 asks first and names exactly what is deleted (contract §7.3: "<Camp> and its <N>
// campers and <$X> in payments are deleted. This can't be undone."). No Undo.
// It uses the dashboard's shared "are you sure?" box (components/ConfirmBox.jsx, loses 'forGood':
// "Keep camp" on the left with the first focus, red "Delete camp" on the right; rulebook v0.729,
// design review C6 / C20 — it replaced Color Belt's ConfirmDeleteDialog). While it works the red
// button says "Deleting…" and both buttons gray; Esc, a click outside and Back wait.
//
// The numbers were read fresh just before this opened (CampRowMenu.jsx), and the delete sends
// exactly those numbers: if a family signed up meanwhile, the database answers "stale" instead of
// deleting something the admin didn't see (§1.14 camp_delete_camp).
//
// While "Hide private details" is on (detailsHidden, rulebook v0.722) the sentence says "any recorded
// payment" instead of the amount; the delete still sends the real numbers.
//
// Props: camp, count (every camper, withdrawn too), active (the header's count), cents (payments net of reversals),
//        detailsHidden, onClose, onDeleted, onProblem(status)
import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import ConfirmBox from '../../components/ConfirmBox.jsx';
import { deleteCamp } from '../../lib/camps/campsApi.js';
import * as T from './text.js';

export default function DeleteCampDialog({ camp, count, active, cents, detailsHidden = false, onClose, onDeleted, onProblem }) {
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setFailed(false);
    const result = await deleteCamp(camp.id, camp.version, count, cents);
    if (result.status === 'ok') {
      onDeleted();
      return;
    }
    setDeleting(false);
    // Didn't reach the database: stay open with "Couldn't delete…" so it can be tried again.
    if (result.status === 'error') setFailed(true);
    else onProblem(result.status);
  }

  return (
    <ConfirmBox
      title={T.deleteCampTitle(camp.name)}
      keepLabel={T.KEEP_CAMP}
      actionLabel={T.DELETE_CAMP}
      actionIcon={IconTrash} // ti-trash = delete (red: deleting only)
      busyLabel={T.DELETING}
      loses="forGood"
      busy={deleting}
      failed={failed ? T.DELETE_FAILED : null}
      onConfirm={handleDelete}
      onKeep={onClose} // ConfirmBox ignores it while the delete works
    >
      {T.deleteCampBody(camp.name, active, count - active, cents, detailsHidden)}
    </ConfirmBox>
  );
}
