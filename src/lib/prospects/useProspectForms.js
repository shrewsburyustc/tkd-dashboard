// useProspectForms.js — which form each prospect came from, for the Prospects "Forms" filter.
// Why it exists (Jeffrey 2026-11-17: "view prospects from a specific form"): the prospects list does not
// say which form a family used. The app may read each sign-up's form (the same columns the Forms page
// reads), so this hook asks for the forms' names and, for every family in the list, its form — no
// database change. A family's form never changes, so what was learned is kept (in `cache`, shared by the
// whole page) and only new families are asked about; leaving for the Forms tab and coming back is instant.
// The cache holds ids and form names only — no child or parent details — and is thrown away when the
// screen locks or someone signs out (clearProspectFormsCache).
//
//   const f = useProspectForms({ familyIds, enabled });
//   f.ready    true once the forms' names and every listed family's form are known
//   f.forms    [{ id, locationCode, name, status }] — every form (the screen picks the shown schools')
//   f.formOf   Map: familyId → formId        f.version  changes when formOf gets new entries
//   f.failed   the last read failed (the previous answer, if any, is kept)
//   f.reload() ask again
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFormNames, loadFormsOfFamilies } from './api.js';

const cache = { forms: null, formOf: new Map() };

export function clearProspectFormsCache() {
  cache.forms = null;
  cache.formOf = new Map();
}

export function useProspectForms({ familyIds, enabled }) {
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [again, setAgain] = useState(0); // Retry
  const namesFresh = useRef(false); // the forms' names are read once each time the page opens (a form may have been renamed)

  useEffect(() => {
    if (!enabled) return undefined;
    const missing = familyIds.filter((id) => !cache.formOf.has(id));
    if (missing.length === 0 && cache.forms && namesFresh.current) return undefined;
    let cancelled = false; // an answer that comes back after the list changed again is thrown away
    (async () => {
      const [names, pairs] = await Promise.all([loadFormNames(), missing.length > 0 ? loadFormsOfFamilies(missing) : { status: 'ok', pairs: [] }]);
      if (cancelled) return;
      if (names.status === 'ok' && pairs.status === 'ok') {
        cache.forms = names.forms;
        for (const [familyId, formId] of pairs.pairs) cache.formOf.set(familyId, formId);
        namesFresh.current = true;
        setFailed(false);
        setVersion((v) => v + 1);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyIds, enabled, again]);

  const reload = useCallback(() => {
    namesFresh.current = false;
    setAgain((n) => n + 1);
  }, []);

  // ready = the names are known and every family in the list has its form (a family signed up a moment ago waits for the next read)
  const ready = Boolean(cache.forms) && familyIds.every((id) => cache.formOf.has(id));
  return { ready, forms: cache.forms ?? [], formOf: cache.formOf, version, failed, reload };
}
