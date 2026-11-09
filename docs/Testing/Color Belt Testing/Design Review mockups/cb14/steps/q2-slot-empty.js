// Schedule at Shrewsbury (no classes in the preview after clearSchool), then Add time slot's empty note
(async () => {
  location.hash = '#schedule';
  await new Promise((r) => setTimeout(r, 800));
  const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent) && b.offsetParent);
  btn(/^\s*Shrewsbury|Shrewsbury\s*$/)?.click();
  await new Promise((r) => setTimeout(r, 1500));
  (await window.__wait(() => btn(/Add time slot/) || [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add" && b.offsetParent))).click();
  await window.__wait(() => [...document.querySelectorAll('[role=dialog] *')].find((e) => /Add classes in/.test(e.textContent)));
  await new Promise((r) => setTimeout(r, 500));
  return 'slot empty';
})()
