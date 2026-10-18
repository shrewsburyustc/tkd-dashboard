// StaffAccounts.jsx — the Staff accounts page (admins only; account menu → Admin → Staff accounts).
// Why it exists: "Forgot password? Ask an admin to reset it." (v0.16) needs somewhere for the
// admin to do that. This first part (v0.70) lists every account and offers two actions per row:
// Reset password and Reset PIN. Adding, switching off and editing accounts come later.
// Approved mockup: docs/Dashboard Docs/TKD-Staff-Accounts-Mockups.html (v0.76).
//
// What's on the page:
//   - title "Staff accounts" + the gray line under it; no page-header button (nothing to add yet)
//   - the list: name · email · ONE tag (Admin / Staff / Shared) · ⋯ (rule 8). Your own row says
//     "(you)" and has no ⋯ (you change your own password and PIN from your account menu).
//   - clicking/tapping a row, or Enter on it, opens its ⋯ menu — there is no detail view yet
//     (recorded exception to rule 8, v0.76). ↑ ↓ move between rows on a PC (v0.52); your own
//     row is skipped.
//   - the location switcher does NOT filter this list: accounts belong to both schools
//     (recorded exception to rule 3.3, v0.76).
//   - loading: gray placeholder rows; couldn't load: amber banner + Retry (rules 3.4, 3.5);
//     not an admin (or this sign-in is locked on the server): "Only admins can see Staff accounts."
//
// Props (from App.jsx):
//   profile            the signed-in person (email for "Confirm it's you"; role for the screen only —
//                      the database decides)
//   screenLocked       true while the lock screen shows: menus and dialogs close, nothing loads
//   showToast          the toast at the bottom
//   onModalOpenChange  tells the App a dialog is open (the page behind becomes inert)
//   onRefreshProfile   re-read "who am I?" (after the database said "not allowed")
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconDots, IconKey, IconPassword } from '@tabler/icons-react';
import ErrorBanner from '../components/ErrorBanner.jsx';
import IconButton from '../components/IconButton.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { listStaff } from '../lib/staffAccounts.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { useRowArrowNav } from '../lib/useRowArrowNav.js';
import { EmailText } from './staff/ConfirmStep.jsx';
import ResetPasswordDialog from './staff/ResetPasswordDialog.jsx';
import ResetPinDialog from './staff/ResetPinDialog.jsx';
import * as T from './staff/text.js';

const SKELETON_ROWS = 3;

export default function StaffAccounts({ profile, screenLocked, showToast, onModalOpenChange, onRefreshProfile }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const rowHintId = useId();
  const [load, setLoad] = useState({ state: 'loading', accounts: [] }); // loading | ok | error | not_allowed
  const [retrying, setRetrying] = useState(false);
  const [menu, setMenu] = useState(null); // { account, anchor } while a row menu is open
  const [dialog, setDialog] = useState(null); // { type: 'password' | 'pin', account }
  const dotsRefs = useRef(new Map()); // account id → its ⋯ button (menu anchor, focus target)
  const returnFocusTo = useRef(null); // account id whose ⋯ gets focus after a dialog closes

  const fetchList = useCallback(async () => {
    const result = await listStaff();
    if (result.status === 'ok') setLoad({ state: 'ok', accounts: result.accounts });
    else if (result.status === 'not_allowed') {
      setLoad({ state: 'not_allowed', accounts: [] });
      onRefreshProfile?.(); // maybe no longer an admin, or locked on the server
    } else setLoad((current) => ({ state: 'error', accounts: current.accounts }));
  }, [onRefreshProfile]);

  // Load when the page opens, and again after unlocking (not while locked).
  useEffect(() => {
    if (!screenLocked) fetchList();
  }, [screenLocked, fetchList]);

  // The lock screen closes menus and dialogs (nothing typed is saved — same as account dialogs).
  useEffect(() => {
    if (!screenLocked) return;
    setMenu(null);
    setDialog(null);
  }, [screenLocked]);

  // The App makes the page behind inert while a dialog is open.
  useEffect(() => {
    onModalOpenChange(dialog !== null);
  }, [dialog, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  // After a dialog closes: focus back on that row's ⋯ button.
  useEffect(() => {
    if (dialog !== null || returnFocusTo.current === null) return;
    const id = returnFocusTo.current;
    returnFocusTo.current = null;
    // (closeDialog told the App in the same step, so the page is no longer inert here —
    // an inert button can't take focus.)
    dotsRefs.current.get(id)?.focus();
  }, [dialog]);

  // Closing a dialog: tell the App at the same moment, so the page behind becomes clickable
  // again in the same screen update (the effect above then puts focus back on the ⋯ button).
  function closeDialog() {
    onModalOpenChange(false);
    setDialog(null);
  }

  async function retry() {
    setRetrying(true);
    await fetchList();
    setRetrying(false);
  }

  const accounts = load.accounts;
  const others = accounts.filter((account) => !account.isMe);
  const nav = useRowArrowNav({
    rowKeys: others.map((account) => account.id),
    onOpen: (id) => openMenu(others.find((account) => account.id === id)),
  });

  function openMenu(account) {
    if (!account) return;
    setMenu({ account, anchor: dotsRefs.current.get(account.id) ?? null });
  }

  function closeMenu(reason) {
    const id = menu?.account.id;
    setMenu(null);
    // Esc / Tab put focus back on the ⋯ button (choosing an item opens a dialog instead).
    if (reason === 'escape' || reason === 'tab') dotsRefs.current.get(id)?.focus();
  }

  function openDialog(type, account) {
    returnFocusTo.current = account.id;
    onModalOpenChange(true);
    setDialog({ type, account });
  }

  const menuItems = menu
    ? [
        { key: 'password', label: T.RESET_PASSWORD, Icon: IconPassword, onSelect: () => openDialog('password', menu.account) },
        { key: 'pin', label: T.RESET_PIN, Icon: IconKey, onSelect: () => openDialog('pin', menu.account) },
      ]
    : [];

  return (
    <div className="staffaccounts">
      {/* Read after a row's name by screen readers: what Enter / a tap on the row does. */}
      <span id={rowHintId} className="visually-hidden">
        {T.ROW_HINT}
      </span>
      <div className="phead">
        <div className="phead-titles">
          <h1 className="ptitle">{T.PAGE_TITLE}</h1>
        </div>
      </div>
      <p className="sa-sub">{T.PAGE_SUB}</p>

      {load.state === 'not_allowed' && <p className="sa-empty">{T.ONLY_ADMINS}</p>}

      {load.state === 'error' && <ErrorBanner text={T.LOAD_FAILED} onRetry={retry} retrying={retrying} />}

      {load.state === 'loading' && (
        <div className="clist sa-list tskeleton" aria-busy="true">
          <span className="visually-hidden">{T.LOADING}</span>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} className="tskeleton-row" aria-hidden="true">
              <span className="tskeleton-bar" />
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 && load.state !== 'not_allowed' && (
        <div className="clist sa-list" role="list" aria-label={T.PAGE_TITLE} {...nav.containerProps}>
          {accounts.map((account) => {
            const tag = <span className="ttag">{T.tagFor(account)}</span>;
            const name = (
              <span className="sa-name">
                {account.fullName}
                {account.isMe && <span className="sa-you"> {T.YOU}</span>}
              </span>
            );
            if (account.isMe) {
              return (
                <div key={account.id} className="sa-row is-me" role="listitem">
                  <span className="sa-main">
                    {name}
                    <span className="sa-email">
                      <EmailText email={account.email} />
                    </span>
                  </span>
                  {tag}
                  {/* keeps the tags lined up with the rows that have a ⋯ */}
                  <span className="sa-dots-spacer" aria-hidden="true" />
                </div>
              );
            }
            const open = menu?.account.id === account.id;
            return (
              <div
                key={account.id}
                className={`sa-row${open || dialog?.account.id === account.id ? ' is-selected' : ''}`}
                role="listitem"
                aria-label={`${account.fullName}, ${account.email}, ${T.tagFor(account)}`}
                aria-describedby={rowHintId}
                {...nav.rowProps(account.id)}
                onClick={() => openMenu(account)}
              >
                <span className="sa-main">
                  {name}
                  <span className="sa-email">
                    <EmailText email={account.email} />
                  </span>
                </span>
                {tag}
                <IconButton
                  // React 19 passes ref straight through to the <button> inside IconButton
                  ref={(element) => {
                    if (element) dotsRefs.current.set(account.id, element);
                    else dotsRefs.current.delete(account.id);
                  }}
                  label={T.moreActionsFor(account.fullName)}
                  Icon={IconDots}
                  aria-haspopup="menu"
                  aria-expanded={open ? 'true' : 'false'}
                  tabIndex={nav.itemTabIndex(account.id)}
                  onClick={(event) => {
                    event.stopPropagation(); // the row's own click would open it a second time
                    if (open) setMenu(null);
                    else openMenu(account);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {menu && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menu.account.fullName}
          subtitle={T.sheetSubtitle(menu.account)}
          label={T.moreActionsFor(menu.account.fullName)}
          items={menuItems}
          onClose={closeMenu}
        />
      )}

      {dialog?.type === 'password' && (
        <ResetPasswordDialog
          account={dialog.account}
          adminEmail={profile.email}
          isPhone={isPhone}
          onCancel={closeDialog}
          onDone={(devices) => {
            const name = dialog.account.fullName;
            closeDialog();
            showToast(T.passwordResetToast(name, devices), { icon: false });
          }}
        />
      )}
      {dialog?.type === 'pin' && (
        <ResetPinDialog
          account={dialog.account}
          adminEmail={profile.email}
          isPhone={isPhone}
          onCancel={closeDialog}
          onDone={() => {
            const name = dialog.account.fullName;
            closeDialog();
            showToast(T.pinResetToast(name), { icon: false });
          }}
        />
      )}
    </div>
  );
}
