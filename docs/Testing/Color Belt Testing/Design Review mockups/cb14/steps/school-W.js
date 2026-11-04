// Worcester in the top bar
(async () => {
  [...document.querySelectorAll('button.loc-option')].find((b) => b.innerText.trim() === 'Worcester')?.click();
  await new Promise((r) => setTimeout(r, 700));
  return 'W';
})()
