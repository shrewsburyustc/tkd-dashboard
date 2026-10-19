// DeleteCampDialog.jsx — "Delete April Vacation Camp?" (admins, from a camp's ⋯ menu).
// Why it exists: deleting a camp is PERMANENT (its campers, check-ins and payments go with it),
// so rule 1.4 asks first and names exactly what is deleted (contract §7.3: "<Camp> and its <N>
// campers and <$X> in payments are deleted. This can't be undone."). No Undo.
// It reuses Color Belt's confirmation box (ConfirmDeleteDialog: Keep / red Delete, focus on Keep).
//
// The numbers were read fresh just before this opened (CampRowMenu.jsx), and the delete sends
// exactly those numbers: if a family signed up meanwhile, the database answers "stale" instead of
// deleting something the admin didn't see (§1.14 camp_delete_camp).
//
// Props: camp, count (every camper, withdrawn too), active (the header's count), cents (payments net of reversals),
//        onClose, onDeleted, onProblem(status)
import { useState } from 'react';
import { deleteCamp } from '../../lib/camps/campsApi.js';
import ConfirmDeleteDialog from '../testing/events/ConfirmDeleteDialog.jsx';
import * as T from './text.js';

export default function DeleteCampDialog({ camp, count, active, cents, onClose, onDeleted, onProblem }) {
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
    <ConfirmDeleteDialog
      title={T.deleteCampTitle(camp.name)}
      body={T.deleteCampBody(camp.name, active, count - active, cents)}
      keepLabel={T.KEEP_CAMP}
      deleteLabel={T.DELETE_CAMP}
      failed={failed}
      deleting={deleting}
      onDelete={handleDelete}
      onCancel={() => !deleting && onClose()}
    />
  );
}
