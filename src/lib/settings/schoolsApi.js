// schoolsApi.js — reading and saving the two schools' street addresses and phones (Settings → Schools).
// Why it exists: the family registration page and the printed flyer show the school's address
// (contract 0005 §1.2). Admins enter it on the Settings page (mockups S1–S3); this file is the
// only place that knows the database's column and argument names for it. Like api.js, every
// function answers { status, … } with a status CODE and never throws:
//   'ok' · 'no_access' · 'not_allowed' (not an admin) · 'not_found' · 'stale' (someone else saved
//   first) · 'invalid' (the address parts were refused) · 'error'
import { supabase } from '../supabase.js';
import { normalizeName, nameProblem } from '../testing/names.js';

// phone: migration 0019 (the closed sign-up form says "Call us at …"; F3 difference 4)
const SCHOOL_COLUMNS = 'code, name, id, address_street, address_city, address_state, address_zip, version, phone';
const STATUSES = new Set(['ok', 'no_access', 'not_allowed', 'not_found', 'stale', 'invalid']);

const failure = (error) => ({ status: 'error', error });
const unexpected = (what) => failure(new Error(`Unexpected answer from ${what}`));

// The address rules (the database checks the same, §1.2), so the Edit dialog can warn as you type.
// All four parts are empty together (no address) or all filled in.
export const ADDRESS_LIMITS = { street: 100, city: 60 };
export const STATE_PATTERN = /^[A-Z]{2}$/; // two capital letters, e.g. MA
export const ZIP_PATTERN = /^[0-9]{5}(-[0-9]{4})?$/; // 01605 or 01605-1234

// What's wrong with an address, as codes for the screen's words. Tidied first like the database
// does: street and city get the name rule's space tidying, state and ZIP lose the spaces at
// their ends. Returns { street, city, state, zip, all } — each null (fine) or a code:
//   'empty' (this part is missing while others are filled) · 'tooLong' · 'badCharacter' ·
//   'badState' · 'badZip'
// all = 'partial' when some parts are filled and some aren't. Every part empty = fine (cleared).
export function addressProblems({ street, city, state, zip } = {}) {
  const ends = (v) => String(v ?? '').replace(/^ +| +$/g, '');
  const parts = { street: normalizeName(street), city: normalizeName(city), state: ends(state), zip: ends(zip) };
  const filled = Object.values(parts).filter((v) => v !== '').length;
  const problems = { street: null, city: null, state: null, zip: null, all: null };
  if (filled === 0) return problems;
  for (const key of Object.keys(parts)) if (parts[key] === '') problems[key] = 'empty';
  if (filled < 4) problems.all = 'partial';
  if ([...parts.street].length > ADDRESS_LIMITS.street) problems.street = 'tooLong';
  if ([...parts.city].length > ADDRESS_LIMITS.city) problems.city = 'tooLong';
  if (nameProblem(parts.street) === 'badCharacter') problems.street = 'badCharacter';
  if (nameProblem(parts.city) === 'badCharacter') problems.city = 'badCharacter';
  if (parts.state !== '' && !STATE_PATTERN.test(parts.state)) problems.state = 'badState';
  if (parts.zip !== '' && !ZIP_PATTERN.test(parts.zip)) problems.zip = 'badZip';
  return problems;
}

// The school phone rule (= 0019's locations_phone_check): empty, or 7-20 characters of digits,
// spaces, + ( ) - . with 7-15 digits. → null (fine) or 'badPhone'.
export function phoneProblem(phone) {
  const p = String(phone ?? '').trim();
  if (p === '') return null;
  const digits = p.replace(/[^0-9]/g, '').length;
  return p.length <= 20 && /^[0-9 +().-]+$/.test(p) && digits >= 7 && digits <= 15 ? null : 'badPhone';
}

function toSchool(row) {
  const hasAddress = row.address_street !== null && row.address_street !== undefined;
  return {
    code: row.code, // 'worcester' | 'shrewsbury'
    name: row.name, // 'Worcester'
    id: row.id,
    // null = no address entered yet (family pages and the flyer then show just the school name)
    address: hasAddress
      ? { street: row.address_street, city: row.address_city, state: row.address_state, zip: row.address_zip }
      : null,
    version: row.version,
    phone: typeof row.phone === 'string' && row.phone !== '' ? row.phone : null, // null = none yet
  };
}

// Both schools. → { status:'ok', schools:[{ code, name, id, address|null, version }] }
export async function loadSchools() {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const [res, access] = await Promise.all([
      supabase.from('locations').select(SCHOOL_COLUMNS).order('name', { ascending: false }), // Worcester, then Shrewsbury
      supabase.rpc('has_data_access'),
    ]);
    if (!access?.error && access?.data === false) return { status: 'no_access' };
    if (access?.error) return failure(access.error);
    if (res?.error) return failure(res.error);
    if (access?.data !== true) return unexpected('has_data_access');
    if (!Array.isArray(res.data)) return unexpected('locations');
    return { status: 'ok', schools: res.data.map(toSchool) };
  } catch (error) {
    return failure(error);
  }
}

// Save one school's address AND phone in one go (admin; 0019's settings_update_school_contact):
// both are saved or neither. An empty phone clears it. → { status:'ok', version } or a refusal code.
export async function updateSchoolContact({ code, expectedVersion, street, city, state, zip, phone } = {}) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v));
    const { data, error } = await supabase.rpc('settings_update_school_contact', {
      p_code: code,
      p_expected_version: expectedVersion,
      p_street: blankToNull(street),
      p_city: blankToNull(city),
      p_state: blankToNull(state),
      p_zip: blankToNull(zip),
      p_phone: blankToNull(phone),
    });
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !STATUSES.has(status)) return unexpected('settings_update_school_contact');
    if (status !== 'ok') return { status };
    return Number.isInteger(data.version) ? { status: 'ok', version: data.version } : unexpected('settings_update_school_contact');
  } catch (error) {
    return failure(error);
  }
}

// Save one school's address (admin). All four empty (or null) clears it. The database tidies the
// spaces itself. → { status:'ok', version } or a refusal code.
export async function updateSchoolAddress({ code, expectedVersion, street, city, state, zip } = {}) {
  try {
    if (!supabase) return failure(new Error('No connection is set up'));
    const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v));
    const { data, error } = await supabase.rpc('settings_update_school_address', {
      p_code: code,
      p_expected_version: expectedVersion,
      p_street: blankToNull(street),
      p_city: blankToNull(city),
      p_state: blankToNull(state),
      p_zip: blankToNull(zip),
    });
    if (error) return failure(error);
    const status = data?.status;
    if (typeof status !== 'string' || !STATUSES.has(status)) return unexpected('settings_update_school_address');
    if (status !== 'ok') return { status };
    return Number.isInteger(data.version) ? { status: 'ok', version: data.version } : unexpected('settings_update_school_address');
  } catch (error) {
    return failure(error);
  }
}
