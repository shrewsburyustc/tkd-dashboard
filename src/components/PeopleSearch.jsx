// PeopleSearch.jsx — the top-bar "Search people" (M16; rulebook v0.12, v1.031, v1.144; migration 0049).
// Why it exists: to find a person in ANY section from any page. One box, results grouped by section, showing
// name, event and school only (Prospects: "Ava R."); a tap opens that person's summary in their own section.
//   - PC and tablet: a box in the top bar with a dropdown under it. ↑ ↓ move, Enter opens, Esc closes; on a PC
//     the "/" key jumps to the box when you are not typing somewhere else.
//   - Phone: a magnifier button in the top bar opens a full-screen search page (back arrow, keyboard up,
//     results fill the screen).
//   - It searches the school in the top bar (Both = both) and starts at 2 letters, after a short pause
//     (lib/people/rules.js). Nothing private is ever in a result, so Hide private details has nothing to hide.
// Props:
//   location          the top bar's school: 'Worcester' | 'Shrewsbury' | 'Both'
//   onLocationChange  switches the top bar (the empty state's "Search both schools")
//   onOpenPerson      (result) => void: the App opens that person's section and summary
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import Dialog from './Dialog.jsx';
import { searchPeople } from '../lib/people/api.js';
import {
  CLOSE_SEARCH,
  PAUSE_MS,
  SEARCH_BOTH,
  SEARCH_FAILED,
  SEARCH_PEOPLE,
  SEARCHING,
  TYPE_MORE,
  cleanQuery,
  detailLine,
  groupResults,
  noMatch,
  schoolArg,
  schoolName,
} from '../lib/people/rules.js';
import { PHONE_QUERY, useMediaQuery } from '../lib/useMediaQuery.js';
import { RETRY } from './text.js';
import '../styles/people-search.css';

// What the search is showing: { phase: 'idle' | 'short' | 'loading' | 'ok' | 'error', results }
const IDLE = { phase: 'idle', results: [] };

function usePeopleSearch(text, location) {
  const [state, setState] = useState(IDLE);
  const [again, setAgain] = useState(0); // Retry
  useEffect(() => {
    const query = cleanQuery(text);
    if (!query) {
      setState(text.trim() ? { phase: 'short', results: [] } : IDLE);
      return undefined;
    }
    let current = true; // a newer typing makes an older answer stale
    setState((old) => ({ phase: 'loading', results: old.results }));
    const timer = window.setTimeout(async () => {
      const answer = await searchPeople(query, location);
      if (!current) return;
      if (answer.status === 'ok') setState({ phase: 'ok', results: answer.results });
      else if (answer.status === 'invalid') setState({ phase: 'short', results: [] });
      else setState({ phase: 'error', results: [] });
    }, PAUSE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [text, location, again]);
  return { ...state, retry: () => setAgain((n) => n + 1) };
}

// The list of results (and the words when there are none): the same inside the dropdown and on the phone page.
function Results({ search, text, location, active, onPick, onSearchBoth, listId }) {
  const groups = useMemo(() => groupResults(search.results), [search.results]);
  const name = location === 'Both' ? null : schoolName(schoolArg(location));
  if (search.phase === 'short') return <p className="ps-hint">{TYPE_MORE}</p>;
  if (search.phase === 'error')
    return (
      <p className="ps-hint">
        {SEARCH_FAILED}{' '}
        <button type="button" className="link-button" onClick={search.retry}>
          {RETRY}
        </button>
      </p>
    );
  if (search.phase === 'loading' && search.results.length === 0) return <p className="ps-hint">{SEARCHING}</p>;
  if (search.phase === 'ok' && search.results.length === 0)
    return (
      <p className="ps-hint">
        {noMatch(text.trim(), name)}
        {name && (
          <>
            {' '}
            <button type="button" className="link-button" onClick={onSearchBoth}>
              {SEARCH_BOTH}
            </button>
          </>
        )}
      </p>
    );
  if (groups.length === 0) return null;
  let index = -1;
  return (
    <ul role="listbox" id={listId} aria-label={SEARCH_PEOPLE} className="ps-results">
      {groups.map((group) => (
        <li key={group.key} role="presentation" className="ps-group">
          <p className="ps-group-title" aria-hidden="true">
            {group.title}
          </p>
          <ul role="presentation">
            {group.items.map((result) => {
              index += 1;
              const mine = index;
              return (
                <li key={`${result.kind}:${result.id}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-o${mine}`}
                    aria-selected={mine === active ? 'true' : 'false'}
                    tabIndex={-1}
                    className={`ps-item${mine === active ? ' is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(result)}
                  >
                    <span className="ps-name">{result.name}</span>
                    <span className="ps-detail">
                      <span className="visually-hidden">{group.title}, </span>
                      {detailLine(result)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function PeopleSearch({ location, onLocationChange, onOpenPerson }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false); // PC/tablet: the dropdown; phone: the full-screen page
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const search = usePeopleSearch(text, location);
  const flat = useMemo(() => groupResults(search.results).flatMap((g) => g.items), [search.results]);

  useEffect(() => {
    setActive(0);
  }, [search.results]);

  const close = useCallback(() => {
    setOpen(false);
    setText('');
  }, []);
  const pick = useCallback(
    (result) => {
      close();
      onOpenPerson(result);
    },
    [close, onOpenPerson],
  );
  const searchBoth = () => onLocationChange('Both');

  // Signing out forgets what was typed (App.jsx's plain signal), so the next person never sees it.
  useEffect(() => {
    const forget = () => {
      setOpen(false);
      setText('');
    };
    window.addEventListener('tkd:signed-out', forget);
    return () => window.removeEventListener('tkd:signed-out', forget);
  }, []);

  // PC and tablet: "/" jumps to the box (rulebook §3.6) when the person isn't typing somewhere.
  useEffect(() => {
    if (isPhone) return undefined;
    function onKey(event) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const t = event.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if (typing || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPhone]);

  // PC and tablet: a click outside the box and its dropdown closes the dropdown.
  useEffect(() => {
    if (isPhone || !open) return undefined;
    function onDown(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [isPhone, open]);

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (text) setText('');
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (flat[active]) pick(flat[active]);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="search"
      className="ps-input"
      role="combobox"
      aria-label={SEARCH_PEOPLE}
      aria-expanded={open && flat.length > 0 ? 'true' : 'false'}
      aria-controls={listId}
      aria-activedescendant={open && flat[active] ? `${listId}-o${active}` : undefined}
      aria-autocomplete="list"
      data-autofocus={isPhone ? true : undefined} // the phone page puts the keyboard here when it opens
      placeholder={SEARCH_PEOPLE}
      autoComplete="off"
      spellCheck={false}
      maxLength={80}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={handleKeyDown}
    />
  );

  if (isPhone) {
    return (
      <>
        <button type="button" className="icon-button ps-open" aria-label={SEARCH_PEOPLE} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <IconSearch size={20} aria-hidden="true" />
        </button>
        {open && (
          <Dialog title={SEARCH_PEOPLE} fullScreen onRequestClose={close}>
            <div className="ps-page" onKeyDown={handleKeyDown}>
              <div className="ps-field">
                <IconSearch size={16} aria-hidden="true" className="ps-icon" />
                {input}
              </div>
              <Results search={search} text={text} location={location} active={active} onPick={pick} onSearchBoth={searchBoth} listId={listId} />
            </div>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <div className="ps" ref={boxRef}>
      <div className="ps-field">
        <IconSearch size={16} aria-hidden="true" className="ps-icon" />
        {input}
        <kbd className="ps-key" aria-hidden="true">
          /
        </kbd>
      </div>
      {open && text.trim() !== '' && (
        <div className="ps-drop">
          <Results search={search} text={text} location={location} active={active} onPick={pick} onSearchBoth={searchBoth} listId={listId} />
        </div>
      )}
      <span className="visually-hidden" aria-live="polite">
        {open && search.phase === 'ok' ? `${flat.length} ${flat.length === 1 ? 'person' : 'people'} found` : ''}
      </span>
    </div>
  );
}