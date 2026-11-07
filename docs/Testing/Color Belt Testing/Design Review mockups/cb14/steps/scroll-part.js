// scroll so the drawn Classes and ranks part starts at the top (the page scrolls inside main on some sizes)
(() => {
  const p = document.querySelector('.cb14-part');
  if (!p) return 'no part';
  p.scrollIntoView({ block: 'start' });
  return 'scrolled';
})()
