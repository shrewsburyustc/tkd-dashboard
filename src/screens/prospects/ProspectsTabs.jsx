// ProspectsTabs.jsx — the two tabs of the Prospects section: Prospects (first) and Forms.
// Why it exists (Jeffrey 2026-11-17: "merge the prospects and forms tabs into 1 ... the prospects area
// first, then the other tab should be the forms"): Forms used to be its own rail entry; now it is the
// second tab under the Prospects title. It copies Camps' tab bar (shared .ttabs / .ttab styles,
// role="tablist", ← → move between the tabs). Each tab's screen draws this bar itself, right under its
// page head, so the head can differ (Add prospect on one, New form on the other).
// Switching tabs is the same page: no new history step (App.jsx changeProspectsTab replaces the address).
import * as T from './text.js';

export const PROSPECTS_TABS = ['prospects', 'forms'];
const LABEL = { prospects: T.TAB_PROSPECTS, forms: T.TAB_FORMS };
export const prospectsTabId = (key) => `prospects-tab-${key}`;
export const prospectsPanelId = (key) => `prospects-panel-${key}`;

export default function ProspectsTabs({ current, onTab }) {
  function handleKeyDown(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = PROSPECTS_TABS.indexOf(current);
    onTab(PROSPECTS_TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + PROSPECTS_TABS.length) % PROSPECTS_TABS.length], { focus: true });
  }
  return (
    <div className="ttabs" role="tablist" aria-label={T.PAGE_TITLE} onKeyDown={handleKeyDown}>
      {PROSPECTS_TABS.map((key) => {
        const on = key === current;
        return (
          <button
            key={key}
            id={prospectsTabId(key)}
            type="button"
            className={`ttab${on ? ' is-current' : ''}`}
            role="tab"
            aria-selected={on ? 'true' : 'false'}
            aria-controls={prospectsPanelId(key)}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(key, { focus: false })}
          >
            {LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}
