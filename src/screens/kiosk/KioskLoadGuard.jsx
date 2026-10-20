// KioskLoadGuard.jsx — a safety net around the front-desk kiosk.
// Why it exists: the kiosk is a separate download (App.jsx loads it only when a tablet becomes a
// kiosk). If that download fails (the Wi-Fi drops at that moment) React would otherwise stop
// drawing the whole app and leave a blank white page (security review L2). This shows a short
// message and a Reload button instead. It never unlocks anything: the dashboard stays locked on
// the server, and a reload opens the kiosk again.
import { Component } from 'react';

export default class KioskLoadGuard extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-screen">
        <div className="lock-card" role="alert">
          <p className="lock-prompt">The sign-up screen didn&apos;t load. Check the connection, then reload.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
