// authErrors.js — sorts a Supabase sign-in error into one of three plain kinds.
// Why it exists: the sign-in screen, Change PIN and Change password all check a password with
// supabase.auth.signInWithPassword, and all need the same answer to "what went wrong?":
//   'credentials' → wrong email or password
//   'connection'  → couldn't reach Supabase (offline), or Supabase itself had a problem
//   'tooMany'     → too many tries in a short time (Supabase's rate limit)

export function classifySignInError(error) {
  if (error?.status === 429) return 'tooMany';
  // AuthRetryableFetchError / status 0 = couldn't reach Supabase; 5xx = Supabase had a problem.
  if (error?.name === 'AuthRetryableFetchError' || !error?.status || error.status >= 500) return 'connection';
  return 'credentials';
}
