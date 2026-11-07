# shoot-v638.ps1: rulebook v0.638's shots (pass 2 L-08). Color Belt's family form, step 2 (check and
# sign), today and with "Date signed" under the signature; and the event roster's student summary (Noah
# Kim, registered on the family form) today and with a "Date signed" row, at the four review sizes
# (320 shot 900 tall). Run from the worktree root with the preview on 5191 and the screenshot browser on
# 9351. The family form needs no sign-in; the dashboard takes the preview PIN.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-v638.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '900', 'touch', 'w320'))
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  # --- the family form, step 2
  node $c open 'http://localhost:5191/register/p4w9tdkm' | Out-Null
  Start-Sleep 3
  node $c type '#reg-first' 'Ava' | Out-Null
  node $c type '#reg-last' 'Chen' | Out-Null
  node $c click 'Group A' | Out-Null
  Start-Sleep 1
  node $c click 'Yellow' | Out-Null
  Start-Sleep 1
  node $c eval "(() => { window.__regInputClass = document.getElementById('reg-first').className; const cb=[...document.querySelectorAll('input[type=checkbox]')].find(i=>i.offsetParent); if (cb) cb.click(); const r=document.querySelector('input[name=reg-paying]'); if (r) r.click(); return 'ok'; })()" | Out-Null
  node $c click 'Continue' | Out-Null
  Start-Sleep 2
  node $c eval "(() => { document.querySelector('.reg-field--sign').scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/v638-$($s[3])-form-today.png" | Out-Null
  node $c eval "window.__v638='form'; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/v638-$($s[3])-form-after.png" | Out-Null
  node $c rects '.reg-field--sign' '#reg-signed'
  # --- the dashboard's student summary
  node $c open 'http://localhost:5191/' | Out-Null
  Start-Sleep 3
  Pin
  node $c eval "location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  node $c wait 'Noah Kim' 6000 | Out-Null
  node $c eval "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Noah Kim')); r.click(); return 'ok'; })()" | Out-Null
  Start-Sleep 1
  node $c eval "(() => { const d=[...document.querySelectorAll('[role=dialog]')].pop(); const r=[...d.querySelectorAll('.ev-sum-row')].find(x=>x.querySelector('dt').innerText.trim()==='Signed by'); r.scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/v638-$($s[3])-summary-today.png" | Out-Null
  node $c eval "window.__v638='summary'; window.__v638day='Oct 29'; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/v638-$($s[3])-summary-after.png" | Out-Null
  node $c textrects 'Signed by' 'Date signed'
  node $c key Escape | Out-Null
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
