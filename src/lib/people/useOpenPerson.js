// useOpenPerson.js — lets a section notice a NEW "open this person" request while it is already showing
// (M16, rulebook v1.144 D).
// Why it exists: the first search → open works when the section mounts after the request. But a person searched
// for while their section's page is already open (searching a camper while on that camp's page) needs the page
// to look again. requestOpenPerson fires a plain window signal, 'tkd:open-person'; this hook turns it into a
// number that changes each time, so a section adds it to the dependency list of its take-the-request effect.
//   const personTick = useOpenPersonTick();
//   useEffect(() => { …takeOpenPerson([...])… }, [live.status, screenLocked, personTick]);
import { useEffect, useState } from 'react';

export const OPEN_PERSON_EVENT = 'tkd:open-person';

export function useOpenPersonTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onRequest = () => setTick((n) => n + 1);
    window.addEventListener(OPEN_PERSON_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_PERSON_EVENT, onRequest);
  }, []);
  return tick;
}