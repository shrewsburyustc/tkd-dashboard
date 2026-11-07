// Shrewsbury in the top bar, first class open
(async () => {
  [...document.querySelectorAll('button.loc-option')].find((b) => b.innerText.trim() === 'Shrewsbury')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const t = document.querySelector('main .ctoggle');
  if (t && t.getAttribute('aria-expanded') === 'false') t.click();
  await new Promise((r) => setTimeout(r, 300));
  return 'S';
})()
