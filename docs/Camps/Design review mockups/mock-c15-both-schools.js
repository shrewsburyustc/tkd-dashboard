// mock-c15-both-schools.js — Camps design review C15 (rule v1.022), drawn ON TOP of the real preview page for a
// picture only: on Both, the Camps page line under the title says "Both schools" (today "Worcester and
// Shrewsbury"), the one wording the review chose for every page. Only the line's words change.
// Run on the Camps list with Both picked:   node shotx.mjs out.png --eval mock-c15-both-schools.js
(() => {
  const line = document.querySelector('main .phead .psub');
  if (!line) return 'no page line';
  if (line.textContent.trim() !== 'Worcester and Shrewsbury') return `line says "${line.textContent}"`;
  line.firstChild.nodeValue = 'Both schools';
  return 'drawn';
})()
