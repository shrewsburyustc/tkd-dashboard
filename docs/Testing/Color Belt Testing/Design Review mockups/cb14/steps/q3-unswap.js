// CB14 sheet 3: puts Worcester's grab back after q3-swap.js
(() => {
  const kind = window.matchMedia('(max-width: 639.98px)').matches ? 'phone' : 'pc';
  const saved = sessionStorage.getItem('__q3:saved');
  if (saved) sessionStorage.setItem(`__cb14:Worcester:${kind}`, saved);
  sessionStorage.removeItem('__q3:saved');
  return 'unswapped';
})()
