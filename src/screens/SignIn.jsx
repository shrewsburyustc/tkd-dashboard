// SignIn.jsx — the email + password screen.
// Why it exists: every person signs in with their own login (guidelines 5) on a new device,
// after signing out, and every 7 days. There is no sign-up and no reset link on purpose:
// admins create accounts and reset passwords.
//
// Props:
//   notice   — optional message from the App (e.g. "Sign in with your password to unlock.")
//   onSignIn — async (email, password) => { error: 'credentials' | 'connection' | 'tooMany' } | { ok: true }
import { useState } from 'react';
import Logo from '../components/Logo.jsx';
import Notice from '../components/Notice.jsx';

const ERROR_TEXT = {
  credentials: "That email or password doesn't match. Try again.",
  connection: "Couldn't reach the server. Check the connection and try again.",
  tooMany: 'Too many sign-in tries. Wait a minute and try again.',
};

export default function SignIn({ notice, onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); // true while waiting for the server
  const [error, setError] = useState(null); // key into ERROR_TEXT, or null
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page (default form behaviour)
    if (busy) return; // already signing in — ignore extra clicks / Enter presses
    setNoticeDismissed(true); // the App's notice has done its job once they try again
    setError(null);

    if (!email.trim() || !password) {
      setError('credentials');
      return;
    }

    setBusy(true);
    let result;
    try {
      result = await onSignIn(email.trim(), password);
    } catch {
      result = { error: 'connection' };
    }
    // On success the App switches to Home and this screen disappears, so only errors land here.
    if (result?.error) {
      setError(result.error);
      setBusy(false);
    }
  }

  // Only one message at a time: a fresh error wins over the App's notice.
  const message = error ? ERROR_TEXT[error] : !noticeDismissed ? notice : null;

  return (
    <div className="center-screen">
      <div className="signin-card">
        <div className="signin-header">
          {/* alt="" because the school name is written right underneath */}
          <Logo size={72} alt="" />
          <h1 className="signin-title">U.S. Taekwondo Center</h1>
          <p className="signin-subtitle">Sign in to the dashboard</p>
        </div>

        {/* noValidate: we show our own plain-language message instead of the browser's pop-ups */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="name@ustc.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {/* The error / notice slot sits right above the button. */}
          {message && <Notice>{message}</Notice>}

          <div className="signin-actions">
            <button type="submit" className="btn btn-primary signin-button" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="signin-forgot">Forgot password? Ask an admin to reset it.</p>
      </div>
    </div>
  );
}
