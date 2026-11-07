// pageRoom.js — the room beside the left panel, for a roster that changes its layout when the room is
// narrow (rulebook v1.053, v1.130; design review rolling check pass 2, L-02).
// Why it exists: a roster (Color Belt's, Star's, Camps') has a tablet layout with columns, drawn for a
// tablet's window. But the left panel takes part of the window (72 px, or 96 px with Panel size
// Largest, v1.118), so in a narrow tablet window the columns get less room than they were drawn for,
// and text runs into other text. Since v1.053 a roster picks its layout from the room it really has
// beside the panel, not from the window's width. v1.130 chose how: this shared code measures the page
// area, and each roster asks whether the room is narrower than its own limit. (Not a CSS "container
// query": on iPads before iPadOS 18.4, and Chrome or Edge before 129, a container also moved every
// pop-up list inside the page; docs/Dashboard Core/Questions/L02-measure-room.png.)
//
// "The room" is the page area's width (`main.shell-content`, Shell.jsx): the window minus the panel.
// On a device whose scrollbars take room (a PC with a mouse), a scrollbar's width is taken off too,
// whether or not the page scrolls right now. So the room never depends on how long the page is, and a
// roster switching layout can't change it (a page growing a scrollbar can't flip the roster back).
// The page's own side margins are inside the room, so a roster's limit counts them.
//
//   usePageRoomBelow(px)     a React hook: true while the room is narrower than px. A roster calls it
//                            with its own limit (the narrowest room its tablet columns fit in), always,
//                            like any hook, and draws its phone layout when either answer says so:
//                              const narrowRoom = usePageRoomBelow(ROSTER_ROOM);
//                              const stacked = isPhone || narrowRoom;
//                            It puts a class on the roster when stacked, and the roster's phone-layout
//                            styles follow that class (as Color Belt's and Star's phone rows already
//                            follow is-phone), instead of a phone-width @media rule.
//                            Only the roster's own layout follows the room (v1.053). The rest of the
//                            page, its dialogs and its ⋯ menus keep following the window (isPhone,
//                            lib/useMediaQuery.js), and with a mouse the roster's buttons keep their
//                            mouse size: touch sizes follow the kind of screen, not the layout (§2.5).
//                            So move only the roster's own layout rules onto the class, never a whole
//                            phone-width @media block.
//                            The roster re-draws only when the answer flips, not at every pixel.
//   usePageRoom()            the room itself, in px (null before it's measured): for the parts page's
//                            sample. A roster uses usePageRoomBelow instead.
//   useMeasurePageRoom(ref)  Shell.jsx measures its page area with it (and the parts page its sample's
//                            page area): first before the screen is painted, then, through a
//                            ResizeObserver (the browser tells the code when a box changes size), one
//                            frame after the box's outer size changes: a window resized or a tablet
//                            turned, Panel size changed, the page zoomed.
//   pageRoom(), pageRoomIsBelow(px), reportPageRoom(width), subscribePageRoom(listener)
//                            the same outside React, for the checks (src/lib/shared/checks.mjs).
// Where nothing measures it (outside the signed-in frame), usePageRoomBelow answers false, as today.
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

let room = null; // the room in whole px; null until a page area has been measured
const listeners = new Set(); // the hooks waiting to hear about a change

export const pageRoom = () => room;

// True while the room is known and narrower than px.
export const pageRoomIsBelow = (px) => room !== null && room < px;

export function reportPageRoom(width) {
  if (width === room) return; // nothing new: nobody re-draws
  room = width;
  for (const listener of listeners) listener();
}

export function subscribePageRoom(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore: React's way to read a value kept outside React (as lib/connection.js does).
// Here the answer is a true/false, so a roster re-draws only when it flips. The third argument is
// only for drawing the page on a server, which this app never does.
export function usePageRoomBelow(px) {
  return useSyncExternalStore(subscribePageRoom, () => pageRoomIsBelow(px), () => false);
}

export function usePageRoom() {
  return useSyncExternalStore(subscribePageRoom, pageRoom, () => null);
}

// How much room the box's scrollbar takes on this device: about 15 px on a PC with a mouse, 0 where
// scrollbars float over the page (phones, tablets, Macs). A hidden box that always scrolls, with the
// same scrollbar style, tells.
function scrollbarWidth(style) {
  const box = document.createElement('div');
  box.style.cssText = 'position: absolute; top: -9999px; width: 100px; height: 100px; overflow: scroll; visibility: hidden';
  box.style.scrollbarWidth = style.scrollbarWidth ?? '';
  document.body.appendChild(box);
  const width = box.offsetWidth - box.clientWidth;
  box.remove();
  return width;
}

// The room in a box: its outer width (offsetWidth, which a scrollbar coming or going doesn't change),
// less a scrollbar's width when the box is a scrolling one, like the page area.
function roomOf(element) {
  const style = getComputedStyle(element);
  const scrolls = /auto|scroll/.test(style.overflowY);
  return element.offsetWidth - (scrolls ? scrollbarWidth(style) : 0);
}

export function useMeasurePageRoom(ref) {
  // Set once, after the first measure. A roster drawn in the same go as the frame only starts
  // listening after the screen is painted, so it would miss the first room for one frame. A change
  // of state here makes React finish that listening and draw again before the first paint, so a
  // roster's first look is already right.
  const [, setMeasured] = useState(false);
  // A layout effect runs before the screen is painted.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      // Behind the lock screen the frame is hidden and would measure 0. Keep the last room, so nothing
      // re-draws while it's hidden and the page is just as it was after unlocking.
      if (element.offsetParent === null) return;
      const width = roomOf(element);
      reportPageRoom(width);
      // Preview mode only: the room on the box itself, for the browser checks
      // (docs/Dashboard Core/tools/check-room.mjs) and to read in the browser's own tools. The real
      // build leaves this line out.
      if (import.meta.env.MODE === 'preview') element.dataset.pageRoom = String(width);
    };
    measure();
    setMeasured(true);
    // It watches the box's outer size ("border-box"), which a scrollbar coming or going doesn't
    // change. A change is measured one frame later, outside the browser's own round of size reports:
    // a roster that switches layout then changes the page's length outside that round, so Shell's
    // other observers of this box hear about it as usual, with no "ResizeObserver loop" warning
    // (ConfirmBox.jsx does the same).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    });
    observer.observe(element, { box: 'border-box' });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      reportPageRoom(null); // the frame is gone (signed out): no room to report
    };
  }, [ref]);
}
