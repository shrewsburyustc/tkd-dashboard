// DeleteDialog.jsx — the old address of the small "Delete …?" box (DeleteDialog).
// Why it exists: the box moved, as it is, to src/components/DeleteDialog.jsx in Dashboard core
// step 1 (rulebook v1.030). This file only keeps the old import path working (no logic here) for
// its two users, Color Belt's classes and ranks and Star's categories, until each switches to the
// shared ConfirmBox in its own prompt.
//
//   import DeleteDialog from '…/components/DeleteDialog.jsx';   // the new address
export { default } from '../../components/DeleteDialog.jsx';
