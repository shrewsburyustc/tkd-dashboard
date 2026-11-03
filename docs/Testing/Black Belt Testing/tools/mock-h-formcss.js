// mock-h-formcss.js — for mockup H (design review BB12, "Star's date picker", rulebook v1.018): adds
// to the Black Belt FAMILY form, in the browser only, the few style rules the calendar needs there.
// Nothing in the app's code changes.
// Why: the family form is its own small page; it does not load the dashboard's styles. Star's family
// page has the same situation and solves it with about 60 lines in src/styles/star-register.css: the
// dashboard's field look (.input), the "visible to screen readers only" rule (.visually-hidden), the
// calendar as a bordered box under the field on PC and tablet, edge to edge on phones, bigger days on
// touch screens, and "Opens a calendar." hidden while the calendar is open. Without them the
// calendar draws broken (the weekday names show twice, "SuSunday"). For the "After" picture this file
// puts a copy of those rules into the page, with Star's ".sreg" (Star's page box) changed to
// ".bbf-main" (the Black Belt form's page box) — the same thing the build will add to form.css.
// How: open the family form (a link from __tkdPreview.bbLinks()) with the temporary DatePicker
// DateField in place, then run this file in the page (Design Review's cdp.mjs eval). A reload removes it.
(() => {
  document.querySelector('style[data-mock-h]')?.remove();
  const css = `
.bbf-main .input { height: var(--control-height); border: 1px solid var(--color-border-control);
  border-radius: var(--radius-control); padding: 0 12px; font-size: var(--text-13);
  background: var(--color-bg); width: 100%; min-width: 0; color: inherit; font-family: inherit;
  display: flex; align-items: center; justify-content: space-between; text-align: left; }
.bbf-main .input:focus-visible { outline: none; border-color: var(--color-blue); box-shadow: 0 0 0 1px var(--color-blue); }
.bbf-main .input[aria-invalid='true'] { border-color: var(--color-warning-text); box-shadow: 0 0 0 1px var(--color-warning-text); }
.bbf-main .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.bbf-main .dp-pop.is-inline { margin: var(--space-4) 0 0; padding: var(--space-12);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); box-shadow: 0 2px 8px rgba(0,0,0,.08); }
.bbf-main .dp-pop.is-inline .dp-top, .bbf-main .dp-pop.is-inline .dp-hint { padding-right: 0; padding-left: 0; }
.bbf-main .dp-pop.is-inline .dp-day { height: 36px; font-size: var(--text-14); }
.bbf-field:has(.dp-pop) > .bbf-hint { display: none; }
@media (pointer: coarse) {
  .bbf-main .input { height: 40px; font-size: var(--text-16); }
  .bbf-main .dp-pop.is-inline .dp-day { height: var(--tap-size); font-size: var(--text-16); }
}
@media (max-width: 599px) {
  .bbf-main .input { height: 40px; font-size: var(--text-16); }
  .bbf-main .dp-pop.is-inline { margin: var(--space-4) calc(50% - 50vw) var(--space-12); padding: var(--space-12) 0;
    border-right: 0; border-left: 0; border-radius: 0; box-shadow: none; }
  .bbf-main .dp-pop.is-inline .dp-top, .bbf-main .dp-pop.is-inline .dp-hint { padding-right: var(--space-16); padding-left: var(--space-16); }
  .bbf-main .dp-pop.is-inline .dp-day { height: var(--tap-size); font-size: var(--text-16); }
}`;
  const style = document.createElement('style');
  style.dataset.mockH = '1';
  style.textContent = css;
  document.head.appendChild(style);
  return 'calendar styles added';
})()
