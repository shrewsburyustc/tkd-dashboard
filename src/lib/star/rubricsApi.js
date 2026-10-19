// rubricsApi.js — every call the Star testing "Rubrics and prices" tab makes to the database.
// Why it exists: the screens shouldn't need to know table names, column lists or the exact
// argument names of the database functions (migration 0006). They call these friendly functions
// instead and always get back a plain object with a `status` — and they NEVER throw, so a screen
// can't crash because the Wi-Fi dropped.
//   'ok' · 'no_access' · 'not_allowed' · 'invalid' · 'not_found' · 'stale' · 'duplicate_name'
//   · 'error' (anything else: no connection, unexpected answer — { status:'error', error })
//
// The logic lives in rubricsCore.js (so Node can check it without the browser); this file only
// connects it to the app's one connection, supabase.js — the real database, or the preview
// database (mockClient.js) in preview mode.
//
//   loadRubrics()
//     → { status:'ok', dans, grades, assistant }
//       dans:      [{ dan, label, passMark, starLimit, standardCents, sameDayCents, privateCents, version,
//                     updatedAt, updatedByName,
//                     categories: [{ id, name, credits, position, fromClassCount, version, updatedAt, updatedByName }] }]
//                     (by dan, by position)
//       grades:    [{ id, grade, position, value, version, updatedAt, updatedByName }]  (A+ … D, by position)
//       assistant: { id, childMaxAge, childMins: [A+, A, B+, B, C+, C], adultMins: [6 numbers], version,
//                    updatedAt, updatedByName }
//       updatedAt / updatedByName = the "Last changed by" line (ISO timestamp text, a person's name)
//     or { status:'no_access' } / { status:'error' }
//   updateDanSettings(dan, expectedVersion, { passMark, starLimit, standardCents, sameDayCents, privateCents })
//                                                               → { status, version }
//   addCategory(dan, name, credits)                             → { status, id, version, position }
//   updateCategory(id, expectedVersion, name, credits)          → { status, id, version }
//   reorderCategories(dan, expectedIds, newIds)                 → { status }
//   deleteCategory(id, expectedVersion)                         → { status }
//   updateGradeValues(expectedVersions /*7*/, values /*7*/)     → { status, versions }
//   updateAssistantTable(expectedVersion, childMaxAge, childMins /*6*/, adultMins /*6*/) → { status, version }
// (Result fields other than status are only there when status is 'ok'.)
import { supabase } from '../supabase.js';
import { createRubricsApi, RUBRIC_STATUSES } from './rubricsCore.js';

export { RUBRIC_STATUSES };

const api = createRubricsApi(() => supabase);

export const loadRubrics = api.loadRubrics;
export const updateDanSettings = api.updateDanSettings;
export const addCategory = api.addCategory;
export const updateCategory = api.updateCategory;
export const reorderCategories = api.reorderCategories;
export const deleteCategory = api.deleteCategory;
export const updateGradeValues = api.updateGradeValues;
export const updateAssistantTable = api.updateAssistantTable;
