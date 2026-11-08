// R205.jsx — the parts page's sample of the queued Undo (lib/toastLine.js, lib/saveLine.js,
// components/Toast.jsx and PageBar.jsx; rulebook v1.125–v1.129; design review R2-05).
// Why it exists: the queued Undo is built before any section uses it, so it needs a page where it can
// be seen and checked. The sample is a small pretend page: a top bar, the frame's bars under it (a
// left page's Undo bar, then the page's own bar, as Shell.jsx draws them), and a roster of three
// campers whose Withdraw is a fake save (nothing reads or saves anything). The real toast shows at
// the bottom, from the sample's own toast line.
// The choices above it set the next fake saves: a save can take 3 seconds (time to press an Undo
// meanwhile), a save or an Undo can fail. "Go to Home" leaves the page, as the rail would, while an
// Undo waits. Try: withdraw Zoe, make saves slow, withdraw Sofia, and press Zoe's Undo meanwhile.
// The browser check (docs/Dashboard Core/tools/check-undo.mjs) drives it.
import { useEffect, useId, useRef, useState } from 'react';
import ChoiceGroup from '../components/ChoiceGroup.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import PageBar, { PageBarSlot } from '../components/PageBar.jsx';
import Toast from '../components/Toast.jsx';
import { dismissLeftUndoBar, endLeftUndoBarSession, useLeftUndoBar, useSaveLine } from '../lib/saveLine.js';
import { useToastLine } from '../lib/toastLine.js';

const CAMPERS = [
  { id: 'zoe', name: 'Zoe Park' },
  { id: 'sofia', name: 'Sofia Rivera' },
  { id: 'ava', name: 'Ava Chen' },
];
const SECTION = 'Sample';
const QUICK_MS = 300;
const SLOW_MS = 3000;

// A fake save: answers { status: 'ok' } or { status: 'error' } after ms.
const fakeSave = (ms, fails) => new Promise((resolve) => window.setTimeout(() => resolve({ status: fails ? 'error' : 'ok' }), ms));

// The sample page: a roster whose Withdraw and Undo go through one save line.
function SamplePage({ settingsRef, toasts }) {
  const [withdrawn, setWithdrawn] = useState({});
  const [notSaved, setNotSaved] = useState(null);
  const [bar, setBar] = useState(null); // the page's one bar: { kind: 'row' | 'undo', text, retry, takeFocus }
  const line = useSaveLine({
    section: SECTION,
    showToast: (text, options) => toasts.show(text, options),
    undoBar: (next) => setBar((current) => (next ? { kind: 'undo', ...next } : current?.kind === 'undo' ? null : current)),
  });

  async function withdraw(camper) {
    const token = line.begin();
    if (!token) return;
    const { saveMs, saveFails } = settingsRef.current;
    // The pattern every page follows: end() exactly once per begin(), from a finally, with its
    // token, so a save that throws still frees the line and a second end() can't free it under an Undo.
    let result = { status: 'error' };
    try {
      result = await fakeSave(saveMs, saveFails);
    } catch {
      // a save that throws counts as not reached: result stays { status: 'error' }, and the bar below says so
    } finally {
      line.end(result.status, { retry: () => withdraw(camper), token });
    }
    if (result.status !== 'ok') {
      setNotSaved(camper.id);
      setBar({ kind: 'row', text: `Couldn't withdraw ${camper.name}. Check the connection, then retry.`, retry: () => withdraw(camper) });
      toasts.clear();
      return;
    }
    setNotSaved(null);
    setBar((current) => (current?.kind === 'row' ? null : current));
    setWithdrawn((current) => ({ ...current, [camper.id]: true }));
    const words = `${camper.name} withdrawn`;
    toasts.show(words, {
      icon: false,
      action: line.undoAction(
        async () => {
          const answer = await fakeSave(QUICK_MS, settingsRef.current.undoFails);
          if (answer.status === 'ok') setWithdrawn((current) => ({ ...current, [camper.id]: false }));
          return answer;
        },
        { words },
      ),
    });
  }

  return (
    <div className="parts-r205-pagebody">
      {bar && <PageBar text={bar.text} onRetry={bar.retry ?? undefined} onDismiss={() => setBar(null)} retrying={bar.retrying} takeFocus={bar.takeFocus} />}
      <ul className="parts-r205-roster" aria-label="Sample roster">
        {CAMPERS.map((camper) => (
          <li key={camper.id} className="parts-r205-row" data-camper={camper.id}>
            <span className="parts-r205-name">{camper.name}</span>
            <span className="parts-r205-state">{withdrawn[camper.id] ? 'Withdrawn' : 'Signed up'}</span>
            {notSaved === camper.id && <span className="ttag ttag--warn">Not saved</span>}
            <button
              type="button"
              className={`btn${line.busy || withdrawn[camper.id] ? ' is-unavailable' : ''}`}
              aria-disabled={line.busy || withdrawn[camper.id] ? 'true' : undefined}
              onClick={() => {
                if (!line.busy && !withdrawn[camper.id]) withdraw(camper);
              }}
            >
              {`Withdraw ${camper.name}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The frame around it: the pretend top bar, the bars under it, the page (or "Home"), and the toast.
function UndoSample({ start = {} }) {
  const saveLabel = useId();
  const saveFailLabel = useId();
  const undoFailLabel = useId();
  const [saveMs, setSaveMs] = useState(start.saveMs ?? QUICK_MS);
  const [saveFails, setSaveFails] = useState(start.saveFails ?? false);
  const [undoFails, setUndoFails] = useState(start.undoFails ?? false);
  const settingsRef = useRef({ saveMs, saveFails, undoFails });
  useEffect(() => {
    settingsRef.current = { saveMs, saveFails, undoFails };
  }, [saveMs, saveFails, undoFails]);
  const { toast, line: toasts } = useToastLine();
  const leftBar = useLeftUndoBar();
  const [slot, setSlot] = useState(null);
  const [onPage, setOnPage] = useState(true);
  // Leaving the sample: nothing of it may stay behind (a left bar belongs to this sample only).
  useEffect(() => () => endLeftUndoBarSession(), []);

  return (
    <div className="parts-frame" data-shot>
      <div className="parts-r205-controls">
        <div className="parts-room-control">
          <span id={saveLabel} className="parts-room-label">
            Next saves take
          </span>
          <ChoiceGroup
            labelId={saveLabel}
            variant="segmented"
            options={[
              { key: 'quick', label: '0.3 seconds' },
              { key: 'slow', label: '3 seconds' },
            ]}
            value={saveMs === SLOW_MS ? 'slow' : 'quick'}
            onChange={(key) => setSaveMs(key === 'slow' ? SLOW_MS : QUICK_MS)}
          />
        </div>
        <div className="parts-room-control">
          <span id={saveFailLabel} className="parts-room-label">
            Next saves
          </span>
          <ChoiceGroup
            labelId={saveFailLabel}
            variant="segmented"
            options={[
              { key: 'ok', label: 'Work' },
              { key: 'fail', label: 'Fail' },
            ]}
            value={saveFails ? 'fail' : 'ok'}
            onChange={(key) => setSaveFails(key === 'fail')}
          />
        </div>
        <div className="parts-room-control">
          <span id={undoFailLabel} className="parts-room-label">
            Next Undos
          </span>
          <ChoiceGroup
            labelId={undoFailLabel}
            variant="segmented"
            options={[
              { key: 'ok', label: 'Work' },
              { key: 'fail', label: 'Fail' },
            ]}
            value={undoFails ? 'fail' : 'ok'}
            onChange={(key) => setUndoFails(key === 'fail')}
          />
        </div>
      </div>
      <div className="parts-r205-frame">
        <div className="parts-r205-top">
          <span className="parts-r205-title">{onPage ? 'Thanksgiving Camp' : 'Home'}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              toasts.drop(); // as the app does on every page change
              setOnPage((value) => !value);
            }}
          >
            {onPage ? 'Go to Home' : 'Back to the camp'}
          </button>
        </div>
        <div className="shell-bars">
          {leftBar && (
            <div className="shell-errbar">
              <ErrorBanner text={leftBar.text} onRetry={leftBar.retry ?? undefined} onDismiss={dismissLeftUndoBar} retrying={leftBar.retrying} />
            </div>
          )}
          <div ref={setSlot} className="shell-pagebars" />
        </div>
        <PageBarSlot.Provider value={slot}>
          <div className="parts-r205-page">
            {onPage ? <SamplePage settingsRef={settingsRef} toasts={toasts} /> : <p className="parts-r205-home">Home (the sample page has closed).</p>}
          </div>
        </PageBarSlot.Provider>
      </div>
      <Toast toast={toast} onDismiss={(id) => toasts.dismiss(id)} onUndo={(id) => toasts.pressUndo(id)} />
    </div>
  );
}

export const PART = {
  id: 'R205',
  title: 'The queued Undo',
  file: 'lib/saveLine.js, lib/toastLine.js',
  states: [
    { id: 'page', title: 'A sample page: an Undo pressed during another save waits as "Undoing…"', render: () => <UndoSample /> },
    { id: 'slow', title: 'The same, with 3-second saves already chosen', render: () => <UndoSample start={{ saveMs: SLOW_MS }} /> },
  ],
};
