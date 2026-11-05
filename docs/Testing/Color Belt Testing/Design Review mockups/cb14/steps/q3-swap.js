// CB14 sheet 3, option B on Shrewsbury: inject-cb14.js draws the first list from Worcester's grab, so
// put Shrewsbury's grab (first class open) in its place for one drawing; q3-unswap.js puts it back.
(() => {
  const kind = window.matchMedia('(max-width: 639.98px)').matches ? 'phone' : 'pc';
  const w = `__cb14:Worcester:${kind}`, s = `__cb14:Shrewsbury:${kind}`;
  sessionStorage.setItem('__q3:saved', sessionStorage.getItem(w));
  sessionStorage.setItem(w, sessionStorage.getItem(s));
  return 'swapped ' + kind;
})()
