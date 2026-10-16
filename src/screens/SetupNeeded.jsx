// SetupNeeded.jsx — a developer-only message shown when the Supabase settings aren't usable.
// Why it exists: without .env.local the app can't reach the database. Instead of a blank
// white page, this says exactly what to do. Staff never see it once the app is set up.
//
// Props:
//   problem — 'missing'   (no URL or key in .env.local)
//           | 'secretKey' (the secret key was pasted instead of the publishable/anon key)
export default function SetupNeeded({ problem = 'missing' }) {
  if (problem === 'secretKey') {
    return (
      <div className="center-screen">
        <div className="setup-card">
          <h1 className="setup-title">Setup needed</h1>
          <p>
            The key in <code>.env.local</code> is a secret key. Use the publishable (anon) key instead — never put the
            secret key in the app.
          </p>
          <p>
            Fix <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="setup-card">
        <h1 className="setup-title">Setup needed</h1>
        <p>
          The Supabase settings are missing. Copy <code>.env.example</code> to <code>.env.local</code>, fill in{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart{' '}
          <code>npm run dev</code>.
        </p>
        <p>
          To try the screens without a database, run <code>npm run dev:preview-mode</code> instead.
        </p>
      </div>
    </div>
  );
}
