// device.js — remembers which school THIS device opens on (Worcester or Shrewsbury).
// Why it exists: the default location belongs to the device, not the person
// (guidelines 3.3): the Shrewsbury tablet always opens on Shrewsbury, whoever signs in.
// It is saved in this browser's localStorage, so each device keeps its own value.
import { readStorage, writeStorage } from './storage.js';

const DEVICE_LOCATION_KEY = 'tkd.deviceLocation';

// The two real schools. A device default must be one of these.
export const LOCATIONS = ['Worcester', 'Shrewsbury'];

// The top-bar switcher also offers "Both" for combined views.
export const SWITCHER_OPTIONS = [...LOCATIONS, 'Both'];

const FALLBACK_LOCATION = 'Worcester';

export function loadDeviceLocation() {
  const saved = readStorage(DEVICE_LOCATION_KEY);
  // Only trust values we recognise; anything else falls back to Worcester.
  return LOCATIONS.includes(saved) ? saved : FALLBACK_LOCATION;
}

export function saveDeviceLocation(location) {
  if (LOCATIONS.includes(location)) writeStorage(DEVICE_LOCATION_KEY, location);
}
