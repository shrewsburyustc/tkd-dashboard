// api.js — the top-bar people search's one database call (M16; migration 0049 people_search).
// Why it exists: the screen never talks to the database itself. It asks searchPeople(text, location) and gets
//   { status: 'ok', results }  |  { status: 'invalid' } (too short / too long)  |  { status: 'no_access' }
//   | { status: 'error', error }.
// The database function returns name, event and school only; rules.js toResult makes each row usable.
import { supabase } from '../supabase.js';
import { cleanQuery, schoolArg, toResult } from './rules.js';

export async function searchPeople(text, location) {
  const query = cleanQuery(text);
  if (!query) return { status: 'invalid' };
  try {
    if (!supabase) return { status: 'error', error: new Error('No connection is set up') };
    const { data, error } = await supabase.rpc('people_search', { p_query: query, p_school: schoolArg(location) });
    if (error) return { status: 'error', error };
    if (data?.status === 'no_access') return { status: 'no_access' };
    if (data?.status === 'invalid') return { status: 'invalid' };
    if (data?.status !== 'ok' || !Array.isArray(data.results)) return { status: 'error', error: new Error('Unexpected answer from people_search') };
    return { status: 'ok', results: data.results.map(toResult).filter(Boolean) };
  } catch (error) {
    return { status: 'error', error };
  }
}