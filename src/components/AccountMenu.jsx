// AccountMenu.jsx — the initials button in the top bar and the menu it opens.
// Why it exists: it's where staff see who is signed in, lock the screen, change their PIN or
// password, set this device's default location, and sign out. Order (contract 0002, item 7):
//   who-line · Lock now · Change PIN (or "Set PIN" if none yet) · Change password · This device
//   · Hide private details (a switch, Finance v0.215, renamed v0.506 — anyone signed in; remembered by this device)
//   · [admins only: separator · "Admin" label · Staff accounts (v0.15 / v0.70) · Settings (v0.135)]
//   · separator · Sign out
// The Admin group is shown to admins only; the database refuses non-admins anyway (0004, 0005).
// The shared front-desk account (profile.is_shared) doesn't get Change PIN / Change password:
// only an admin changes the desk PIN and password (decided v0.28).
//   - PC and tablet: a 248px dropdown under the initials, right-aligned.
//   - Phone (<640px): a sheet that slides up from the bottom over a dimmed background.
// The dropdown-vs-sheet difference is CSS only (app.css, "Account menu" section).
//
// Keyboard: opening moves focus to the first item; ↑/↓/Home/End move between items;
// Esc, Tab, clicking outside, or choosing an item closes it and focus returns to the initials.
// Phone sheet only: dragging the sheet down with a finger more than 60px closes it too.
import { useEffect, useId, useRef, useState } from 'react';
import {
  IconCheck,
  IconCurrencyDollarOff,
  IconKey,
  IconLock,
  IconLogout,
  IconMapPin,
  IconPassword,
  IconSettings,
  IconUserCog,
} from '@tabler/icons-react';
import Avatar from './Avatar.jsx';
import { LOCATIONS } from '../lib/device.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { claimBack } from '../lib/backButton.js';
import { usePrivateDetailsHidden, HIDE_PRIVATE_DETAILS } from '../lib/privateDetails.js';

// menuitemcheckbox = the Hide private details switch (it stays checked or unchecked, like a switch).
const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const SWIPE_CLOSE_PX = 60; // drag the sheet down further than this and it closes

export default function AccountMenu({
  profile,
  deviceLocation,
  onDeviceLocationChange,
  onLockNow,
  onChangePin,
  onSetPin,
  onChangePassword,
  onStaffAccounts,
  onSettings,
  onSignOut,
  isScreenLocked,
}) {
  const [open, setOpen] = useState(false);
  const [choosingDevice, setChoosingDevice] = useState(false); // "This device" choices expanded?
  const [detailsHidden, setDetailsHidden] = usePrivateDetailsHidden(); // this device's Hide private details switch

  const buttonRef = useRef(null); // the initials button
  const panelRef = useRef(null); // the dropdown / sheet
  const deviceItemRef = useRef(null); // the "This device" row
  const wasOpenRef = useRef(false); // lets us notice the moment the menu closes
  const panelId = useId(); // unique id linking the button to the menu (aria-controls)

  // Swipe-down-to-close (phone sheet). Same breakpoint as the phone rules in app.css.
  const isSheet = useMediaQuery(PHONE_QUERY);
  const [dragDistance, setDragDistance] = useState(0); // how far (px) the sheet is pulled down
  const dragStartYRef = useRef(null); // finger's starting height on screen; null = not dragging
  const dragDistanceRef = useRef(0); // same as dragDistance, but readable instantly

  // The browser's Back while the menu is open closes the menu and nothing else (v0.83):
  // claimBack tells App.jsx to keep the page where it is.
  useEffect(() => {
    if (!open) return undefined;
    function handleBack() {
      setOpen(false);
      setChoosingDevice(false);
    }
    const release = claimBack(handleBack);
    window.addEventListener('popstate', handleBack);
    return () => {
      release();
      window.removeEventListener('popstate', handleBack);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setChoosingDevice(false);
    setDragDistance(0);
    dragStartYRef.current = null;
    dragDistanceRef.current = 0;
  }

  // ----- Swipe down to close (phone sheet only) -----
  function handleTouchStart(event) {
    if (!isSheet || event.touches.length !== 1) return; // one finger, on the phone sheet only
    // If the sheet has been scrolled down, a downward drag should scroll it back up instead.
    if (panelRef.current.scrollTop > 0) return;
    dragStartYRef.current = event.touches[0].clientY; // clientY = distance from the top of the screen
  }

  function handleTouchMove(event) {
    if (dragStartYRef.current === null) return;
    // Math.max(0, ...) = only follow the finger downward; an upward drag leaves the sheet in place.
    const distance = Math.max(0, event.touches[0].clientY - dragStartYRef.current);
    dragDistanceRef.current = distance;
    setDragDistance(distance); // moves the sheet with the finger (see `style` below)
  }

  function handleTouchEnd() {
    if (dragStartYRef.current === null) return;
    if (dragDistanceRef.current > SWIPE_CLOSE_PX) {
      close();
      return;
    }
    // Not far enough: let go and the sheet slides back up (the CSS transition animates it).
    dragStartYRef.current = null;
    dragDistanceRef.current = 0;
    setDragDistance(0);
  }

  // Focus handling: into the menu when it opens, back to the initials when it closes.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      panelRef.current?.querySelector(ITEM_SELECTOR)?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      // If focus was inside the menu it is now lost (the menu is gone), so put it back on
      // the initials. If the person clicked into something else, leave focus there.
      const active = document.activeElement;
      if (!active || active === document.body) buttonRef.current?.focus();
    }
  }, [open]);

  // While open: close on Esc anywhere, or on a click/tap outside the menu.
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') close();
    }

    function handleClick(event) {
      // composedPath() is the list of elements the click travelled through, recorded when it
      // happened — reliable even if React has already re-drawn the menu by now.
      const path = event.composedPath();
      if (path.includes(panelRef.current) || path.includes(buttonRef.current)) return;
      close();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClick);
    };
  }, [open]);

  // If the screen auto-locks while the menu is open, close it so it isn't open after unlocking.
  useEffect(() => {
    if (isScreenLocked) close();
  }, [isScreenLocked]);

  // When the location choices appear, move focus to the currently selected one.
  useEffect(() => {
    if (choosingDevice) {
      panelRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus();
    }
  }, [choosingDevice]);

  // Arrow keys inside the menu.
  function handlePanelKeyDown(event) {
    const items = Array.from(panelRef.current.querySelectorAll(ITEM_SELECTOR));
    const index = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown') next = index + 1 >= items.length ? 0 : index + 1;
    if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (event.key === 'Tab') {
      event.preventDefault(); // Tab leaves the menu: close it and return to the initials
      close();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      items[next].focus();
    }
  }

  function chooseDeviceLocation(location) {
    onDeviceLocationChange(location); // saves the device default AND moves the switcher
    setChoosingDevice(false);
    deviceItemRef.current?.focus(); // keep keyboard users on the "This device" row
  }

  const roleLabel = profile.role === 'admin' ? 'Admin' : 'Staff';
  const isShared = Boolean(profile.is_shared); // the shared front-desk account
  const hasPin = Boolean(profile.has_pin);

  // Closes the menu, then runs the chosen action.
  function choose(action) {
    close();
    action();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="avatar-button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Avatar name={profile.full_name} open={open} />
      </button>

      {open && (
        <>
          {/* Dimmed background behind the phone sheet (hidden on PC/tablet by CSS). */}
          <div className="account-backdrop" aria-hidden="true" />

          {/* While a finger drags the phone sheet: translateY moves it down by the drag distance
              (without changing the layout), and is-dragging switches off the slide-back animation. */}
          <div
            ref={panelRef}
            id={panelId}
            className={dragDistance > 0 ? 'account-panel is-dragging' : 'account-panel'}
            style={dragDistance > 0 ? { transform: `translateY(${dragDistance}px)` } : undefined}
            onKeyDown={handlePanelKeyDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div className="account-grab" aria-hidden="true" />

            {/* Who is signed in */}
            <div className="account-who">
              <p className="account-name">{profile.full_name}</p>
              <p className="account-meta">
                {profile.email} · {roleLabel}
              </p>
            </div>

            <div role="menu" aria-label="Account">
              <button type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={() => choose(onLockNow)}>
                <IconLock size={16} aria-hidden="true" className="menu-icon" />
                <span>Lock now</span>
              </button>

              {/* Personal accounts only. No PIN yet → "Set PIN" opens the Set your PIN screen. */}
              {!isShared && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="menu-item"
                  onClick={() => choose(hasPin ? onChangePin : onSetPin)}
                >
                  <IconKey size={16} aria-hidden="true" className="menu-icon" />
                  <span>{hasPin ? 'Change PIN' : 'Set PIN'}</span>
                </button>
              )}

              {!isShared && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="menu-item"
                  onClick={() => choose(onChangePassword)}
                >
                  <IconPassword size={16} aria-hidden="true" className="menu-icon" />
                  <span>Change password</span>
                </button>
              )}

              <button
                ref={deviceItemRef}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="menu-item"
                aria-expanded={choosingDevice}
                onClick={() => setChoosingDevice((value) => !value)}
              >
                <IconMapPin size={16} aria-hidden="true" className="menu-icon" />
                <span>This device</span>
                <span className="menu-value">{deviceLocation}</span>
              </button>

              {choosingDevice && (
                <div role="group" aria-label="This device opens on">
                  {LOCATIONS.map((location) => {
                    const checked = location === deviceLocation;
                    return (
                      <button
                        key={location}
                        type="button"
                        role="menuitemradio"
                        aria-checked={checked}
                        tabIndex={-1}
                        className="menu-item menu-subitem"
                        onClick={() => chooseDeviceLocation(location)}
                      >
                        <span>{location}</span>
                        {checked && <IconCheck size={16} aria-hidden="true" className="menu-check" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Hide private details (v0.215, renamed v0.506): flips at once and the menu stays open, like a
                  switch. While on, the top bar shows a gray "Private details hidden" chip (TopBar.jsx). */}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={detailsHidden ? 'true' : 'false'}
                tabIndex={-1}
                className="menu-item"
                onClick={() => setDetailsHidden(!detailsHidden)}
              >
                <IconCurrencyDollarOff size={16} aria-hidden="true" className="menu-icon" />
                <span>{HIDE_PRIVATE_DETAILS}</span>
                <span className={`fin-menu-switch${detailsHidden ? ' is-on' : ''}`} aria-hidden="true" />
              </button>

              {profile.role === 'admin' && (
                <>
                  <div role="separator" className="menu-separator" />
                  <div role="group" aria-labelledby={`${panelId}-admin`}>
                    {/* The gray "Admin" label (approved mockup, screen 1) names the group. */}
                    <p id={`${panelId}-admin`} className="menu-group-label">
                      Admin
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      className="menu-item"
                      onClick={() => choose(onStaffAccounts)}
                    >
                      {/* ti-user-cog = Staff accounts (admin), guidelines 2.4 */}
                      <IconUserCog size={16} aria-hidden="true" className="menu-icon" />
                      <span>Staff accounts</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      className="menu-item"
                      onClick={() => choose(onSettings)}
                    >
                      {/* ti-settings = Settings (admin), guidelines 2.4 / v0.135 */}
                      <IconSettings size={16} aria-hidden="true" className="menu-icon" />
                      <span>Settings</span>
                    </button>
                  </div>
                </>
              )}

              <div role="separator" className="menu-separator" />

              <button type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={() => choose(onSignOut)}>
                <IconLogout size={16} aria-hidden="true" className="menu-icon" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
