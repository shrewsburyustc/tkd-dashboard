// Forms at Shrewsbury → Free class — Facebook → the Book a class field's settings (Classes offered)
(async () => {
  location.hash = '#forms';
  await new Promise((r) => setTimeout(r, 800));
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent) && b.offsetParent);
  btn(/^\s*Shrewsbury|Shrewsbury\s*$/)?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const form = await window.__wait(() => [...document.querySelectorAll('main *')].find((b) => b.textContent.trim() === 'Free class — Facebook' && b.offsetParent)?.closest('button,a'));
  form.click();
  await new Promise((r) => setTimeout(r, 1500));
  const field = await window.__wait(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Free class time') && !/Drag/.test(x.getAttribute('aria-label') || '') && x.offsetParent));
  field.click();
  const hint = await window.__wait(() => [...document.querySelectorAll('.field-hint')].find((x) => /no classes yet/.test(x.textContent) && x.offsetParent));
  hint.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 500));
  return 'forms';
})()
