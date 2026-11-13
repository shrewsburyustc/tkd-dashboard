// DeleteStudentConfirm.jsx — the "Delete student?" box of the Board breaking roster's ⋯ menu (admins only).
// Why it exists: deleting a student is for good, so it asks first with the dashboard's one "are you sure?" box
// (components/ConfirmBox.jsx, rulebook v1.008): the button that changes nothing says what stays ("Keep student") and is
// on the LEFT; the red action repeats the words pressed ("Delete student") on the RIGHT, and says "Deleting…" while it works.
// The database refuses when the student has any payment on record ('has_payments': money is never lost quietly),
// when someone else changed the row first ('stale'), and for a non-admin ('not_allowed'). Each refusal, and a failed
// save, shows an amber note under the buttons and the box stays open (guidelines 3.5).
//
// Props: registration (the roster row), onClose(), onDeleted(name) after it worked, onNoAccess(), onRefreshProfile().
import { useState } from 'react';
import { IconTrash } from '@tabler/icons-react';
import ConfirmBox from '../../../components/ConfirmBox.jsx';
import { deleteRegistration } from '../../../lib/breaking/breakingApi.js';
import * as T from '../../../lib/breaking/text/dialogs.js';

export default function DeleteStudentConfirm({ registration, onClose, onDeleted, onNoAccess, onRefreshProfile }) {
  const [failed, setFailed] = useState(null);
  const name = `${registration.firstName} ${registration.lastName}`;

  async function confirm() {
    setFailed(null);
    const result = await deleteRegistration(registration.id, registration.version);
    if (result.status === 'ok') {
      onDeleted?.(name);
      onClose();
      return;
    }
    if (result.status === 'no_access') {
      onNoAccess?.();
      return;
    }
    if (result.status === 'not_allowed') {
      onRefreshProfile?.();
      setFailed(T.ROSTER_NOT_ALLOWED);
    } else if (result.status === 'has_payments') setFailed(T.deleteHasPayments(name));
    else if (result.status === 'stale' || result.status === 'not_found') setFailed(T.DELETE_STALE);
    else setFailed(T.DELETE_FAILED);
  }

  return (
    <ConfirmBox
      title={T.deleteTitle(name)}
      keepLabel={T.KEEP_STUDENT}
      actionLabel={T.DELETE_STUDENT}
      actionIcon={IconTrash}
      busyLabel={T.DELETING}
      loses="forGood"
      failed={failed}
      onKeep={onClose}
      onConfirm={confirm}
    >
      {T.deleteBody(name)}
    </ConfirmBox>
  );
}
