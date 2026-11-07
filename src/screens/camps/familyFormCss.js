// familyFormCss.js — makes the camp family page's look usable inside the dashboard (Fill in, v0.741).
// Why it exists: the Fill in dialog (FillInDialog.jsx) draws the camp family page's own steps
// (src/camp/StepDetails.jsx, StepCheck.jsx), so it needs that page's styles: register.css (the
// public forms' "reg-" look, Color Belt's file) and camp.css (the camp form's "camp-" pieces).
// camp.css only has "camp-" rules, so it can be used as it is. register.css starts with a few
// PAGE rules for the public page itself (html / body background and font, box-sizing, b, button /
// input fonts, the focus ring); loaded into the dashboard those would change every screen. So the
// dialog takes register.css as text and keeps only what comes from its first "reg-" rule on —
// every rule from there is a class starting "reg-", which the dashboard never uses.
//
// This file is plain JavaScript (no Vite, no React), so checks.mjs can test the cut on the real file.

// The first rule of register.css whose selector is a "reg-" class (".reg-preview { …" today; the
// minified build has no spaces or comments, so the pattern allows both).
const FIRST_REG_RULE = /(^|[}\s;])\.reg-[\w-]+[^{}]*\{/;

// register.css as text → only its "reg-" part (from its first .reg- rule to the end), or '' when
// the text has no .reg- rule at all (then nothing of it is used rather than the page rules).
export function scopedRegisterCss(text) {
  if (typeof text !== 'string') return '';
  const match = FIRST_REG_RULE.exec(text);
  if (!match) return '';
  return text.slice(match.index + match[1].length);
}

// Is every selector in this CSS text a "reg-" or "camp-" class rule (inside @media blocks too)?
// For checks.mjs: proves the part the dashboard loads can't reach the dashboard's own elements.
// Every selector (each part between commas) must START with a .reg- / .camp- class, optionally
// tied to an element name ("section.reg-card …"): its first element is then always one of the
// family form's own. So ":not(.reg-x)", "body .reg-x" or "div, .reg-x" are refused.
const STARTS_WITH_FAMILY_CLASS = /^[a-z][a-z0-9]*\.(reg|camp)-[\w-]|^\.(reg|camp)-[\w-]/;
export function onlyFamilyFormRules(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(noComments)) !== null) {
    const sel = m[1].trim();
    if (sel === '' || sel.startsWith('@')) continue; // @media / @supports open a block of rules
    selectors.push(sel);
  }
  return selectors.length > 0 && selectors.every((sel) => sel.split(',').every((part) => STARTS_WITH_FAMILY_CLASS.test(part.trim())));
}
